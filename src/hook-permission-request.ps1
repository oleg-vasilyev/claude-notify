# Claude Code "PermissionRequest" hook: fires when a tool call is about to show
# a permission prompt - the one mid-turn wait neither Stop nor hook-ask can see.
# Passive on purpose: it prints no JSON, so the prompt itself is untouched.
$raw = [Console]::In.ReadToEnd()
$logPath = Join-Path $PSScriptRoot 'log.txt'
"$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) HOOK PermissionRequest | $($raw -replace '\s+', ' ')" | Add-Content $logPath -Encoding utf8

try { $data = $raw | ConvertFrom-Json } catch { exit 0 }
$proj = ''
if ($data.cwd) { $proj = '[' + (Split-Path -Leaf $data.cwd) + '] ' }
$tool = if ($data.tool_name) { $data.tool_name } else { 'tool' }

& (Join-Path $PSScriptRoot 'notify.ps1') -Message ($proj + 'просит разрешение: ' + $tool) -RateLimitMinutes 10
exit 0
