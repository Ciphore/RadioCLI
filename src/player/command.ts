// Keep the existing playback import path stable; executable discovery is shared
// by every platform integration.
export {clearCommandCache, commandExists, resolveCommand, resolveCommandDetails} from '../platform/executables.js';
export type {CommandDiscovery} from '../platform/executables.js';
