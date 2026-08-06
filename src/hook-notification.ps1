# Claude Code "Notification" hook: permission prompts and idle waiting, per the
# docs. It has never been observed to fire - see the tombstone in PLAN.md.
. (Join-Path $PSScriptRoot 'hook-common.ps1')

$data = Read-HookPayload -EventName 'Notification'
if (-not $data) { exit 0 }
$proj = Get-ProjectPrefix $data.cwd
$msg = if ($data.message) { $data.message } else { 'ждёт твоего ввода' }

& (Join-Path $PSScriptRoot 'notify.ps1') -Message ($proj + $msg) -RateLimitMinutes 10
exit 0
