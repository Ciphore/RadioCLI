export function completionScript(shell: string): string {
  if (shell === 'bash') return `# RadioCLI Bash completion
_radiocli_complete() {
  local candidate
  COMPREPLY=()
  while IFS= read -r candidate; do
    COMPREPLY+=("$candidate")
  done < <(radiocli _complete "\${COMP_WORDS[@]:1:COMP_CWORD}" 2>/dev/null)
}
complete -F _radiocli_complete radiocli
`;
  if (shell === 'zsh') return `# RadioCLI Zsh completion (load after compinit)
_radiocli_complete() {
  local -a candidates
  candidates=("\${(@f)$(radiocli _complete "\${words[@]:1:$((CURRENT - 1))}" 2>/dev/null)}")
  compadd -- "\${candidates[@]}"
}
compdef _radiocli_complete radiocli
`;
  if (shell === 'fish') return `# RadioCLI Fish completion
function __radiocli_candidates
  set -l words (commandline -opc)
  set -e words[1]
  set -l current (commandline -ct)
  radiocli _complete $words "$current" 2>/dev/null
end
complete -c radiocli -f -a '(__radiocli_candidates)'
`;
  if (shell === 'powershell') return `# RadioCLI PowerShell completion
Register-ArgumentCompleter -Native -CommandName radiocli -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $words = @($commandAst.CommandElements | Select-Object -Skip 1 | Where-Object { $_.Extent.StartOffset -lt $cursorPosition } | ForEach-Object { $_.Extent.Text })
  if (!$wordToComplete) { $words += '' }
  & radiocli _complete @words 2>$null | ForEach-Object {
    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
  }
}
`;
  throw new Error('Choose a completion shell: bash, zsh, fish, or powershell. Run radiocli completion --help.');
}
