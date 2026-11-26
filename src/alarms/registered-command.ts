/** Decode only RadioCLI's data envelopes; never execute scheduler source. */
export function registeredCommand(body: string, platform: 'darwin' | 'linux' | 'win32'): string[] | null {
  try {
    if (platform === 'darwin') {
      const array = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(body)?.[1];
      return array ? [...array.matchAll(/<string>([\s\S]*?)<\/string>/g)].map(match => decodeXml(match[1]!)) : null;
    }
    if (platform === 'linux') {
      const line = /^ExecStart=:(.+)$/m.exec(body)?.[1];
      return line ? [...line.matchAll(/"(?:[^"\\]|\\.)*"/g)].map(match => (JSON.parse(match[0]) as string).replaceAll('%%', '%')) : null;
    }
    const argumentsText = /<Arguments>([\s\S]*?)<\/Arguments>/.exec(body)?.[1];
    const encoded = argumentsText && /-EncodedCommand\s+(\S+)/.exec(decodeXml(argumentsText))?.[1];
    if (!encoded) return null;
    const script = Buffer.from(encoded, 'base64').toString('utf16le');
    const payload = /FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(script)?.[1];
    if (!payload) return null;
    const invocation = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as {command: unknown; args: unknown};
    if (typeof invocation.command !== 'string' || !Array.isArray(invocation.args) || !invocation.args.every(value => typeof value === 'string')) return null;
    return [invocation.command, ...invocation.args];
  } catch { return null; }
}

export function registeredRuntime(command: string[] | null): {nodePath: string; cliPath: string; signature: string} | null {
  if (!command?.[0]) return null;
  try {
    if (command[1] === '-e') {
      const signature = command.at(-1)!;
      const payload = JSON.parse(Buffer.from(signature, 'base64url').toString('utf8')) as {args?: unknown};
      if (!Array.isArray(payload.args) || typeof payload.args[0] !== 'string' || payload.args[1] !== 'alarm') return null;
      return {nodePath: command[0], cliPath: payload.args[0], signature};
    }
    if (command[2] === 'alarm' && command[1]) return {nodePath: command[0], cliPath: command[1], signature: command[1]};
  } catch { /* Unknown registration formats are repairable, never healthy. */ }
  return null;
}

function decodeXml(value: string): string {
  return value.replace(/&(lt|gt|quot|apos|amp);/g, (_, entity: string) => ({lt: '<', gt: '>', quot: '"', apos: "'", amp: '&'})[entity]!);
}
