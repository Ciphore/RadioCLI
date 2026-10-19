import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

// The same relative location works from src/player and the packaged dist/player.
export const airPlaySenderPackageJson = fileURLToPath(new URL('../../vendor/node-airtunes2/package.json', import.meta.url));
export const airPlaySenderRoot = dirname(airPlaySenderPackageJson);
