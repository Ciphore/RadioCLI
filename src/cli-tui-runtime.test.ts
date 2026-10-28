import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {describe, expect, it} from 'vitest';

describe('TUI runtime bootstrap', () => {
  for (const args of [[], ['agent-ui', 'fixture']]) {
    it.each([undefined, 'development'])('selects React before importing JSX with NODE_ENV=%s', async nodeEnv => {
      const env = {...process.env};
      if (nodeEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = nodeEnv;
      const cli = fileURLToPath(new URL('./cli.tsx', import.meta.url));
      // Non-TTY input stops before playback or storage opens. JSX still loads
      // React, making this sensitive to setting NODE_ENV too late in bootstrap.
      const code = `
        import {pathToFileURL} from 'node:url';
        process.argv = [process.execPath, ${JSON.stringify(cli)}, ...${JSON.stringify(args)}];
        await import(pathToFileURL(process.argv[1]).href);
        const React = await import('react');
        process.exitCode = 0;
        console.log('RUNTIME=' + JSON.stringify({env: process.env.NODE_ENV, development: typeof React.act === 'function'}));
      `;
      const {stdout} = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {env});
      const runtime = JSON.parse(stdout.split('RUNTIME=')[1]!.trim());
      expect(runtime).toEqual({env: nodeEnv ?? 'production', development: nodeEnv === 'development'});
    });
  }
});
