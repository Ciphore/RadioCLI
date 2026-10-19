export async function renderTui(printHelp: () => void, encodedCommand?: string): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error('The interactive TUI needs terminal input. Use radiocli commands in a headless session, or connect with a terminal (for example, ssh -t).');
    printHelp();
    process.exitCode = 1;
    return;
  }
  const {configureTerminalRenderer} = await import('../ui/terminal-renderer.js');
  const terminal = await configureTerminalRenderer(process.env, {isTTY: Boolean(process.stdout.isTTY), colorDepth: process.stdout.getColorDepth?.()});
  const {rtlSafeOutput} = await import('../ui/rtl-output.js');
  const [{render}, {App}, {decodeAgentCommand}, {openTuiSession}] = await Promise.all([import('ink'), import('../ui/App.js'), import('../agent/service.js'), import('../agent/tui-session.js')]);
  const initialAgentCommand = encodedCommand ? decodeAgentCommand(encodedCommand) : undefined;
  const {session: playbackSession, warning: playbackRecoveryWarning} = await openTuiSession();
  try {
    const app = render(<App playbackSession={playbackSession} playbackRecoveryWarning={playbackRecoveryWarning} initialAgentCommand={initialAgentCommand} />, {
      stdout: terminal.interactive && process.stdout.isTTY && !terminal.screenReader ? rtlSafeOutput(process.stdout) : process.stdout,
      // App owns Ctrl+C so it can confirm before performing a clean shutdown.
      exitOnCtrlC: false,
      isScreenReaderEnabled: terminal.screenReader,
      interactive: terminal.interactive ? undefined : false,
      debug: !terminal.interactive,
      kittyKeyboard: {mode: terminal.interactive ? 'auto' : 'disabled', flags: ['disambiguateEscapeCodes', 'reportEventTypes', 'reportAllKeysAsEscapeCodes']}
    });
    await app.waitUntilExit();
  } catch (error) {
    playbackSession?.disconnect();
    if (playbackSession) console.error('The TUI closed unexpectedly. Playback continues; reopen radiocli to reconnect, or run radiocli stop.');
    throw error;
  }
  await playbackSession?.close();
}
