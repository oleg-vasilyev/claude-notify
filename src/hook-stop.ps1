# Claude Code "Stop" hook: fires when Claude finishes a turn, i.e. the ball is
# back in the user's court. Fallback for turns where the model did not ping itself.
. (Join-Path $PSScriptRoot 'hook-common.ps1')

$data = Read-HookPayload -EventName 'Stop'
$proj = if ($data) { Get-ProjectPrefix $data.cwd } else { '' }

& (Join-Path $PSScriptRoot 'notify.ps1') -Message ($proj + 'закончил ход, ждёт тебя') -RateLimitMinutes 10
exit 0
