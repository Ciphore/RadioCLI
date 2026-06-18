import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

let cachedVersion: string | null = null;

export function appVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  try {
    const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {version?: string};
    cachedVersion = parsed.version ?? '0.0.0';
  } catch {
    cachedVersion = '0.0.0';
  }

  return cachedVersion;
}

export function userAgent(suffix = ''): string {
  return `radiocli/${appVersion()}${suffix}`;
}
