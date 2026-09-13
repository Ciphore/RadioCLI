import {resolve4, resolve6} from 'node:dns/promises';
import {request as requestHttps, type RequestOptions as HttpsRequestOptions} from 'node:https';

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type ExternalRequestOptions = {timeoutMs: number; init?: RequestInit; fetchImpl?: FetchLike};
type ResolvedAddress = {address: string; family: 4 | 6};
type ResolverRuntime = {
  resolve4?: (hostname: string) => Promise<string[]>;
  resolve6?: (hostname: string) => Promise<string[]>;
  request?: typeof requestHttps;
  ca?: HttpsRequestOptions['ca'];
};

const maxResolvedResponseBytes = 128 * 1024 * 1024;

export function networkPolicy(env: NodeJS.ProcessEnv = process.env): {offline: boolean; lowBandwidth: boolean} {
  return {offline: env.RADIOCLI_OFFLINE === '1', lowBandwidth: env.RADIOCLI_LOW_BANDWIDTH === '1'};
}

/** A direct connection must never silently bypass an operator-configured proxy. */
export function allowsDirectDnsFallback(env: NodeJS.ProcessEnv = process.env): boolean {
  return !['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY']
    .some(name => Boolean(env[name]?.trim()));
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

/**
 * HTTPS fetch fallback for systems where libc getaddrinfo() reports EAI_AGAIN
 * but Node's DNS-protocol resolver can still reach the configured nameserver.
 * The original hostname remains the HTTP Host and TLS SNI identity, so normal
 * certificate-chain and hostname verification remain enabled.
 */
export async function fetchHttpsWithSystemResolver(
  input: string | URL,
  init: RequestInit = {},
  runtime: ResolverRuntime = {}
): Promise<Response> {
  const url = new URL(input);
  if (url.protocol !== 'https:') throw new Error('The DNS fallback only supports HTTPS requests.');
  if (url.username || url.password) throw new Error('The DNS fallback does not accept URL credentials.');
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') throw new Error('The DNS fallback only supports GET and HEAD requests.');
  if (init.body) throw new Error('The DNS fallback does not accept a request body.');
  init.signal?.throwIfAborted();

  const addresses = await resolveHttpsAddresses(url.hostname, init.signal, runtime);
  let lastError: Error | null = null;
  for (const address of addresses) {
    try {
      return await requestResolvedHttps(url, address, init, runtime, method);
    } catch (error) {
      if (init.signal?.aborted) throw init.signal.reason;
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error(`DNS did not return an address for ${url.hostname}.`);
}

async function resolveHttpsAddresses(
  hostname: string,
  signal: AbortSignal | null | undefined,
  runtime: ResolverRuntime
): Promise<ResolvedAddress[]> {
  let lastErrors: unknown[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const results = await raceAbort(
      Promise.allSettled([
        (runtime.resolve4 ?? resolve4)(hostname),
        (runtime.resolve6 ?? resolve6)(hostname)
      ]),
      signal
    );
    const addresses = [
      ...(results[0].status === 'fulfilled' ? results[0].value.map(address => ({address, family: 4 as const})) : []),
      ...(results[1].status === 'fulfilled' ? results[1].value.map(address => ({address, family: 6 as const})) : [])
    ];
    if (addresses.length > 0) return dedupeAddresses(addresses);

    lastErrors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
    if (attempt === 1 || !lastErrors.some(isTemporaryDnsError)) break;
    await abortableDelay(100, signal);
  }

  const lastError = lastErrors.find(value => value instanceof Error);
  throw lastError instanceof Error ? lastError : new Error(`DNS did not return an address for ${hostname}.`);
}

function requestResolvedHttps(
  url: URL,
  address: ResolvedAddress,
  init: RequestInit,
  runtime: ResolverRuntime,
  method: string
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers = new Headers(init.headers);
    if (!headers.has('host')) headers.set('host', url.host);
    if (!headers.has('accept-encoding')) headers.set('accept-encoding', 'identity');
    const request = (runtime.request ?? requestHttps)({
      hostname: address.address,
      family: address.family,
      port: url.port ? Number(url.port) : 443,
      path: `${url.pathname}${url.search}`,
      method,
      headers: Object.fromEntries(headers.entries()),
      servername: url.hostname,
      signal: init.signal ?? undefined,
      ca: runtime.ca,
      agent: false
    }, response => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > maxResolvedResponseBytes) {
          response.destroy(new Error('HTTPS response exceeded the 128 MiB safety limit.'));
          return;
        }
        chunks.push(buffer);
      });
      response.once('error', reject);
      response.once('aborted', () => reject(new Error('HTTPS response ended before completion.')));
      response.once('end', () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) responseHeaders.append(name, item);
          } else if (value !== undefined) {
            responseHeaders.set(name, value);
          }
        }
        const status = response.statusCode ?? 500;
        const body = method === 'HEAD' || status === 204 || status === 205 || status === 304
          ? null
          : Buffer.concat(chunks);
        resolve(new Response(body, {
          status,
          statusText: response.statusMessage,
          headers: responseHeaders
        }));
      });
    });
    request.once('error', reject);
    request.end();
  });
}

function dedupeAddresses(addresses: ResolvedAddress[]): ResolvedAddress[] {
  const seen = new Set<string>();
  return addresses.filter(({address, family}) => {
    const key = `${family}:${address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isTemporaryDnsError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EAI_AGAIN';
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, {once: true});
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function abortableDelay(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  if (!signal) return new Promise(resolve => setTimeout(resolve, ms));
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(done, ms);
    const onAbort = () => done(signal.reason);
    signal.addEventListener('abort', onAbort, {once: true});
    function done(error?: unknown) {
      clearTimeout(timeout);
      signal!.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    }
  });
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
