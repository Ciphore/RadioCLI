type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type ExternalRequestOptions = {timeoutMs: number; init?: RequestInit; fetchImpl?: FetchLike};

export function networkPolicy(env: NodeJS.ProcessEnv = process.env): {offline: boolean; lowBandwidth: boolean} {
  return {offline: env.RADIOCLI_OFFLINE === '1', lowBandwidth: env.RADIOCLI_LOW_BANDWIDTH === '1'};
}

/** Configuration preflight only: no network request or proxy credentials. */
export function networkDiagnostic() {
  const policy = networkPolicy();
  if (policy.offline) return {...policy, status: 'offline', message: 'Public directory and update requests are disabled; cached data and direct stream URLs remain usable.'};
  try {
    validateProxyConfiguration(new URL('http://example.invalid'));
    validateProxyConfiguration(new URL('https://example.invalid'));
    return {...policy, status: 'configured', message: 'Network configuration accepted; reachability and TLS are checked per request. External player networking is separate.'};
  } catch (error) {
    return {...policy, status: 'unavailable', message: error instanceof Error ? error.message : 'Network configuration is invalid.'};
  }
}

/** Keep the request deadline active through body consumption, including errors. */
export async function withExternalResponse<T>(
  url: string | URL,
  {timeoutMs, init = {}, fetchImpl = fetch}: ExternalRequestOptions,
  consume: (response: Response) => T | Promise<T>
): Promise<T> {
  if (networkPolicy().offline) throw new Error('RadioCLI is offline (RADIOCLI_OFFLINE=1).');
  validateProxyConfiguration(new URL(url));
  init.signal?.throwIfAborted();

  const controller = new AbortController();
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  let onAbort: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, {once: true});
  });
  const timeout = setTimeout(() => controller.abort(new Error(`Network request timed out after ${timeoutMs} ms.`)), timeoutMs);
  let response: Response | undefined;
  const work = async () => {
    response = await fetchImpl(url, {...init, signal});
    try {
      // A custom fetch can resolve after the deadline without observing abort.
      signal.throwIfAborted();
      return await consume(response);
    } finally {
      cancelBody(response);
    }
  };
  try {
    return await Promise.race([work(), aborted]);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort!);
    controller.abort();
    if (response) cancelBody(response);
  }
}

function cancelBody(response: Response): void {
  // Cancellation is best-effort and must not extend the request deadline. A
  // locked native body is interrupted by the request's AbortController instead.
  if (response.body && !response.body.locked) void response.body.cancel().catch(() => {});
}

function validateProxyConfiguration(url: URL): void {
  const http = proxyVariable('http_proxy', 'HTTP_PROXY');
  const https = proxyVariable('https_proxy', 'HTTPS_PROXY');
  for (const proxy of [http, https]) {
    if (!proxy.value) continue;
    let parsed: URL;
    try {
      if (/[\r\n]/.test(proxy.value)) throw new Error();
      parsed = new URL(proxy.value);
      decodeURIComponent(parsed.username);
      decodeURIComponent(parsed.password);
    } catch {
      // URL parse errors can contain credentials. Do not attach the raw cause.
      throw new Error(`${proxy.name} contains an invalid proxy URL.`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`${proxy.name} uses an unsupported proxy protocol. This Node HTTP client supports HTTP(S) proxies; SOCKS proxies are unavailable.`);
    }
  }

  // Native fetch falls back to HTTP_PROXY for HTTPS when HTTPS_PROXY is unset.
  const selected = url.protocol === 'https:' && https.value ? https : http;
  if (!selected.value) {
    const all = proxyVariable('all_proxy', 'ALL_PROXY');
    if (all.value) throw new Error(`${all.name} is not supported by this Node HTTP client. Configure HTTP_PROXY or HTTPS_PROXY with an HTTP(S) proxy; SOCKS proxies are unavailable.`);
    return;
  }

  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  if (major < 24 && !(major === 22 && minor >= 21)) {
    throw new Error('Native HTTP(S) proxy support requires Node 22.21+ or Node 24+.');
  }
  let enabled = process.env.NODE_USE_ENV_PROXY === '1';
  const environmentFlags = (process.env.NODE_OPTIONS ?? '').match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  for (const raw of [...environmentFlags, ...process.execArgv]) {
    const flag = raw.replace(/^["']|["']$/g, '');
    if (flag === '--use-env-proxy') enabled = true;
    if (flag === '--no-use-env-proxy') enabled = false;
  }
  if (!enabled) {
    throw new Error(`${selected.name} is configured. Start RadioCLI with NODE_USE_ENV_PROXY=1 to enable the native HTTP(S) proxy.`);
  }
  // Node configures its dispatcher at startup. Do not mutate proxy environment
  // variables or install a global dispatcher here; local IPC has a direct agent.
}

function proxyVariable(lower: string, upper: string): {name: string; value: string | undefined} {
  const name = process.env[lower] !== undefined ? lower : upper;
  return {name, value: process.env[name]};
}
