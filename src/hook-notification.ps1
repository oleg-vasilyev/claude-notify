# Claude Code "Notification" hook: permission prompts and idle waiting.
$raw = [Console]::In.ReadToEnd()
$logPath = Join-Path $PSScriptRoot 'log.txt'
"$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) HOOK Notification | $($raw -replace '\s+', ' ')" | Add-Content $logPath -Encoding utf8

try { $data = $raw | ConvertFrom-Json } catch { exit 0 }
$msg = $data.message
if (-not $msg) { $msg = 'ждёт твоего ввода' }
$proj = ''
if ($data.cwd) { $proj = '[' + (Split-Path -Leaf $data.cwd) + '] ' }

& (Join-Path $PSScriptRoot 'notify.ps1') -Message ($proj + $msg) -RateLimitMinutes 10
exit 0
