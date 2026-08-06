# Claude Code "PermissionRequest" hook: fires when a tool call is about to show
# a permission prompt - the one mid-turn wait neither Stop nor hook-ask can see.
# Passive on purpose: it prints no JSON, so the prompt itself is untouched.
. (Join-Path $PSScriptRoot 'hook-common.ps1')

$data = Read-HookPayload -EventName 'PermissionRequest'
if (-not $data) { exit 0 }
$proj = Get-ProjectPrefix $data.cwd
$tool = if ($data.tool_name) { $data.tool_name } else { 'tool' }

& (Join-Path $PSScriptRoot 'notify.ps1') -Message ($proj + 'просит разрешение: ' + $tool) -RateLimitMinutes 10
exit 0
