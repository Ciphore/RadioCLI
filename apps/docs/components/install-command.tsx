'use client';

import { useEffect, useRef, useState } from 'react';

export function InstallCommand({ label, command }: { label: string; command: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timeout.current), []);

  async function copy() {
    clearTimeout(timeout.current);
    try {
      await navigator.clipboard.writeText(command);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
    timeout.current = setTimeout(() => setStatus('idle'), 2000);
  }

  return <div className="rc-code-block">
    <div className="rc-code-header"><span>{label}</span>
      <button type="button" onClick={copy} aria-label={`Copy ${label} commands`}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          {status === 'copied' ? <path d="m4 10 4 4 8-8" /> : <><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M13 7V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3" /></>}
        </svg>
      </button>
      <span role="status" className="sr-only">{status === 'copied' ? 'Commands copied' : status === 'failed' ? 'Unable to copy. Select the commands to copy manually.' : ''}</span>
    </div>
    <pre><code>{command}</code></pre>
  </div>;
}
