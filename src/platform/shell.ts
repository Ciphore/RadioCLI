/**
 * Keep values out of PowerShell source when a native tool or script shim must
 * run there. Native argument conversion still belongs to the target command;
 * terminal launches use an encoded Node bootstrap for arbitrary argv values.
 */
export function powershellCommand(
  values: readonly string[],
  environment: Record<string, string> = {},
  options: {keepOpen?: boolean} = {}
): string[] {
  if (!values[0]) throw new Error('A PowerShell command is required.');
  if ([...values, ...Object.keys(environment), ...Object.values(environment)].some(value => value.includes('\0'))) {
    throw new Error('PowerShell command values cannot contain NUL bytes.');
  }
  const payload = Buffer.from(JSON.stringify({command: values[0], args: values.slice(1), environment}), 'utf8').toString('base64');
  const script = [
    "$ErrorActionPreference='Stop'",
    "$ProgressPreference='SilentlyContinue'",
    `$radiocliInvocation=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json`,
    "foreach($radiocliVariable in $radiocliInvocation.environment.PSObject.Properties){[Environment]::SetEnvironmentVariable($radiocliVariable.Name,[string]$radiocliVariable.Value,'Process')}",
    '$radiocliArguments=@($radiocliInvocation.args | ForEach-Object {[string]$_})',
    '$global:LASTEXITCODE=0',
    '& ([string]$radiocliInvocation.command) @radiocliArguments',
    ...(options.keepOpen ? [] : ['$radiocliSucceeded=$?', 'if(-not $radiocliSucceeded -and $LASTEXITCODE -eq 0){exit 1}', 'exit $LASTEXITCODE'])
  ].join(';');
  return ['-NoLogo', '-NoProfile', ...(options.keepOpen ? ['-NoExit'] : ['-NonInteractive']), '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];
}
