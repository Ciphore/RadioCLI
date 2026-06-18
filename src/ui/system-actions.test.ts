import {describe, expect, it} from 'vitest';
import {clipboardCommands, openExternalCommand} from './system-actions.js';

describe('system actions', () => {
  it('opens URLs with the platform default handler', () => {
    expect(openExternalCommand('darwin')).toEqual({command: 'open', args: []});
    expect(openExternalCommand('win32')).toEqual({command: 'cmd', args: ['/c', 'start', '']});
    expect(openExternalCommand('linux')).toEqual({command: 'xdg-open', args: []});
  });

  it('lists platform clipboard tools in priority order', () => {
    expect(clipboardCommands('darwin').map(entry => entry.command)).toEqual(['pbcopy']);
    expect(clipboardCommands('win32').map(entry => entry.command)).toEqual(['clip']);
    expect(clipboardCommands('linux').map(entry => entry.command)).toEqual(['wl-copy', 'xclip', 'xsel']);
  });
});
