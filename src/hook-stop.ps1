# Claude Code "Stop" hook: fires when Claude finishes a turn, i.e. the ball is
# back in the user's court. Fallback for turns where the model did not ping itself.
$raw = [Console]::In.ReadToEnd()
$logPath = Join-Path $PSScriptRoot 'log.txt'
"$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) HOOK Stop | $($raw -replace '\s+', ' ')" | Add-Content $logPath -Encoding utf8

try { $data = $raw | ConvertFrom-Json } catch { $data = $null }
$proj = ''
if ($data -and $data.cwd) { $proj = '[' + (Split-Path -Leaf $data.cwd) + '] ' }

& (Join-Path $PSScriptRoot 'notify.ps1') -Message ($proj + 'закончил ход, ждёт тебя') -RateLimitMinutes 10
exit 0
