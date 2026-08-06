# Claude Code "PreToolUse" hook for the tools that hand control back to the user
# mid-turn: AskUserQuestion (interactive question) and ExitPlanMode (plan approval).
# The Stop hook cannot cover these - the turn has not ended when they run.
. (Join-Path $PSScriptRoot 'hook-common.ps1')

$data = Read-HookPayload -EventName 'PreToolUse'
if (-not $data) { exit 0 }
$proj = Get-ProjectPrefix $data.cwd

$text = 'ждёт твоего ответа'
if ($data.tool_name -eq 'ExitPlanMode') {
  $text = 'план готов, жду апрув'
} elseif ($data.tool_input -and $data.tool_input.questions) {
  $q = @($data.tool_input.questions)[0].question
  if ($q) { $text = 'вопрос: ' + $q }
}
if ($text.Length -gt 180) { $text = $text.Substring(0, 177) + '...' }

# Short rate limit: a direct question is high value, but a burst of them is not.
& (Join-Path $PSScriptRoot 'notify.ps1') -Message ($proj + $text) -RateLimitMinutes 2
exit 0
