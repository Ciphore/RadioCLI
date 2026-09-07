import {describe, expect, it} from 'vitest';
import {radioCliMcpInstructions} from './mcp-server.js';

describe('RadioCLI MCP host guidance', () => {
  it('routes common radio requests before the host truncates server guidance', () => {
    const routingPrefix = radioCliMcpInstructions.slice(0, 512);
    expect(routingPrefix).toContain('Never substitute a web browser');
    expect(routingPrefix).toContain('Play my most recent radio station');
    expect(routingPrefix).toContain('Play a station from New York');
    expect(routingPrefix).toContain('radio_search');
    expect(routingPrefix).toContain('radio_play');
  });

  it('keeps task-completion radio actions out of implicit goals and schedulers', () => {
    expect(radioCliMcpInstructions).toContain('do not delegate a radio-only operation');
    expect(radioCliMcpInstructions).toContain('normal completion action in the current task');
    expect(radioCliMcpInstructions).toContain('Do not create or set a goal');
    expect(radioCliMcpInstructions).toContain('only when the user explicitly requests it');
  });
});
