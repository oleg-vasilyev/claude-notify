# Claude Code -> Telegram notifications: self-contained installer.
# Copy the built dist\setup.ps1 to any Windows machine and run it:
#   powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1
# It writes the notifier scripts, asks for the bot token, resolves your chat id,
# registers the Claude Code hooks (Telegram + sound) and adds the CLAUDE.md rule.
#
# Do not edit dist\setup.ps1 by hand - it is generated from src\ by build.ps1.
param(
  [string]$Token,
  [string]$MachineLabel,
  [int]$MinIdleMinutes = 0,
  [switch]$NonInteractive,
  [switch]$SkipTest
)
$ErrorActionPreference = 'Stop'

$utf8Bom = New-Object System.Text.UTF8Encoding($true)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$claudeDir = Join-Path $env:USERPROFILE '.claude'
$dir = Join-Path $claudeDir 'scripts\telegram-notify'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

function Write-Script([string]$Name, [string]$Body) {
  [IO.File]::WriteAllText((Join-Path $dir $Name), $Body, $utf8Bom)
}

Write-Script 'notify-core.ps1' @'
# The pure core: every delivery decision, with all state passed in as arguments.
# No I/O, no clock reads, no win32 - which is what makes these functions testable
# without Telegram, without waiting three minutes, and without a keyboard to idle.
# The impure edges (HTTP, files, GetLastInputInfo, process spawning) live in
# notify.ps1 and watcher.ps1, which dot-source this file.

function Get-ProjectKey {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Message)
  if ($Message -match '^\[([^\]@]+)[\]@]') {
    return ($Matches[1] -replace '[^\w\-]', '_')
  }
  return 'global'
}

function Add-MachineLabel {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Message,
    [AllowEmptyString()][string]$Label
  )
  if (-not $Label) { return $Message }
  if ($Message -match '^\[([^\]@]+)\]') {
    return '[' + $Matches[1] + '@' + $Label + ']' + $Message.Substring($Matches[0].Length)
  }
  if ($Message -notmatch '^\[') {
    return '[' + $Label + '] ' + $Message
  }
  return $Message
}

function Get-DeliveryDecision {
  param(
    [Parameter(Mandatory = $true)][int]$IdleSeconds,
    [Parameter(Mandatory = $true)][int]$MinIdleMinutes,
    [Parameter(Mandatory = $true)][int]$RateLimitMinutes,
    $LastSentAt,
    [Parameter(Mandatory = $true)][datetime]$Now
  )
  if ($MinIdleMinutes -gt 0 -and $IdleSeconds -lt ($MinIdleMinutes * 60)) {
    return 'queue'
  }
  if ($RateLimitMinutes -gt 0 -and $null -ne $LastSentAt) {
    if (($Now - [datetime]$LastSentAt) -lt [timespan]::FromMinutes($RateLimitMinutes)) {
      return 'skip-rate-limit'
    }
  }
  return 'send'
}

function Select-PendingDelivery {
  param(
    [AllowEmptyCollection()][string[]]$Lines,
    [Parameter(Mandatory = $true)][datetime]$Now,
    [Parameter(Mandatory = $true)][int]$StaleMinutes
  )
  $dropped = @()
  $best = [ordered]@{}
  foreach ($line in @($Lines)) {
    if (-not $line -or -not $line.Trim()) { continue }
    $parts = $line -split '\|', 2
    if ($parts.Count -lt 2) { continue }
    $message = $parts[1]
    $queuedAt = $null
    try {
      $queuedAt = [datetime]::Parse($parts[0], [Globalization.CultureInfo]::InvariantCulture)
    } catch {
      $queuedAt = $null
    }
    if ($null -ne $queuedAt -and (($Now - $queuedAt) -gt [timespan]::FromMinutes($StaleMinutes))) {
      $dropped += [pscustomobject]@{ Message = $message; QueuedAt = $queuedAt }
      continue
    }
    $key = Get-ProjectKey $message
    if (-not $best.Contains($key) -or $best[$key].Length -lt $message.Length) {
      $best[$key] = $message
    }
  }
  return [pscustomobject]@{
    Deliver = @($best.Values)
    Dropped = @($dropped)
  }
}
'@

Write-Script 'notify.ps1' @'
param(
  [Parameter(Mandatory = $true)][string]$Message,
  [int]$RateLimitMinutes = 0,
  # -1 = use min_idle_minutes from config.json; 0 = send regardless of activity
  [int]$MinIdleMinutes = -1
)
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'notify-core.ps1')

$logPath = Join-Path $PSScriptRoot 'log.txt'
function Write-Log([string]$Text) {
  "$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) $Text" | Add-Content $logPath -Encoding utf8
}

$cfgPath = Join-Path $PSScriptRoot 'config.json'
if (-not (Test-Path $cfgPath)) { exit 0 }
$cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $cfg.token -or -not $cfg.chat_id) { exit 0 }

$stampKey = Get-ProjectKey $Message
$stampPath = Join-Path $PSScriptRoot ('last-sent-' + $stampKey + '.txt')

$label = if ($cfg.PSObject.Properties['machine_label']) { $cfg.machine_label } else { '' }
$Message = Add-MachineLabel $Message $label

if ($MinIdleMinutes -lt 0) {
  $MinIdleMinutes = 3
  if ($cfg.PSObject.Properties['min_idle_minutes']) { $MinIdleMinutes = [int]$cfg.min_idle_minutes }
}

# Idle seconds via win32; a failed check counts as "away" so a real ping is
# never lost to a broken presence probe.
$idleSec = [int]::MaxValue
if ($MinIdleMinutes -gt 0) {
  try {
    Add-Type -Namespace TgNotify -Name IdleTime -MemberDefinition '[StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; } [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii); public static uint GetIdleSeconds() { LASTINPUTINFO lii = new LASTINPUTINFO(); lii.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO)); if (!GetLastInputInfo(ref lii)) { return 0; } return ((uint)Environment.TickCount - lii.dwTime) / 1000; }'
    $idleSec = [TgNotify.IdleTime]::GetIdleSeconds()
  } catch {
    Write-Log ("WARN idle check failed: " + $_)
  }
}

$lastSentAt = $null
if (Test-Path $stampPath) {
  try {
    $lastSentAt = [datetime]::Parse((Get-Content $stampPath -Raw).Trim(), [Globalization.CultureInfo]::InvariantCulture)
  } catch {
    $lastSentAt = $null
  }
}

$decision = Get-DeliveryDecision -IdleSeconds $idleSec -MinIdleMinutes $MinIdleMinutes `
  -RateLimitMinutes $RateLimitMinutes -LastSentAt $lastSentAt -Now (Get-Date)

if ($decision -eq 'queue') {
  ((Get-Date).ToString('o') + '|' + $Message) | Add-Content (Join-Path $PSScriptRoot 'pending.txt') -Encoding utf8
  Write-Log ("QUEUED idle=" + $idleSec + "s | " + $Message)
  $lockPath = Join-Path $PSScriptRoot 'watcher.lock'
  $alive = $false
  if (Test-Path $lockPath) {
    try {
      $watcherPid = [int](Get-Content $lockPath -Raw).Trim()
      $p = Get-Process -Id $watcherPid -ErrorAction Stop
      if ($p.ProcessName -like 'powershell*') { $alive = $true }
    } catch {
      $alive = $false
    }
  }
  if (-not $alive) {
    Start-Process powershell -WindowStyle Hidden -ArgumentList @(
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', (Join-Path $PSScriptRoot 'watcher.ps1'))
  }
  exit 0
}

if ($decision -eq 'skip-rate-limit') {
  Write-Log ("SKIP rate-limit [" + $stampKey + "] | " + $Message)
  exit 0
}

try {
  $body = @{ chat_id = $cfg.chat_id; text = $Message } | ConvertTo-Json
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  Invoke-RestMethod -Uri ("https://api.telegram.org/bot" + $cfg.token + "/sendMessage") `
    -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes | Out-Null
  (Get-Date).ToString('o') | Set-Content $stampPath -Encoding ascii
  Write-Log ("SENT | " + $Message)
} catch {
  Write-Log ("ERROR send failed: " + $_ + " | " + $Message)
  exit 1
}
'@

Write-Script 'watcher.ps1' @'
# Delivers pings that were suppressed because the user was at the laptop.
# Polls every 30s; once they have been idle long enough it flushes the queue and exits.
$ErrorActionPreference = 'SilentlyContinue'

. (Join-Path $PSScriptRoot 'notify-core.ps1')

$lockPath = Join-Path $PSScriptRoot 'watcher.lock'
$pendingPath = Join-Path $PSScriptRoot 'pending.txt'
$logPath = Join-Path $PSScriptRoot 'log.txt'
function Write-Log([string]$Text) {
  "$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) $Text" | Add-Content $logPath -Encoding utf8
}

if (Test-Path $lockPath) {
  try {
    $other = [int](Get-Content $lockPath -Raw).Trim()
    if (Get-Process -Id $other -ErrorAction Stop) { exit 0 }
  } catch {
    $null = $_
  }
}
$PID | Set-Content $lockPath -Encoding ascii
Write-Log ("WATCHER started (pid " + $PID + ")")

Add-Type -Namespace TgNotify -Name IdleTime -MemberDefinition '[StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; } [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii); public static uint GetIdleSeconds() { LASTINPUTINFO lii = new LASTINPUTINFO(); lii.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO)); if (!GetLastInputInfo(ref lii)) { return 0; } return ((uint)Environment.TickCount - lii.dwTime) / 1000; }'

$minIdle = 3
$staleMinutes = 15
try {
  $cfg = Get-Content (Join-Path $PSScriptRoot 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($cfg.PSObject.Properties['min_idle_minutes']) { $minIdle = [int]$cfg.min_idle_minutes }
  if ($cfg.PSObject.Properties['stale_minutes']) { $staleMinutes = [int]$cfg.stale_minutes }
} catch {
  $null = $_
}

$deadline = (Get-Date).AddHours(8)
try {
  while ((Get-Date) -lt $deadline) {
    if (-not (Test-Path $pendingPath)) { break }
    if ([TgNotify.IdleTime]::GetIdleSeconds() -ge ($minIdle * 60)) {
      $lines = @(Get-Content $pendingPath -Encoding utf8)
      Remove-Item $pendingPath -Force
      $selection = Select-PendingDelivery -Lines $lines -Now (Get-Date) -StaleMinutes $staleMinutes
      foreach ($drop in $selection.Dropped) {
        Write-Log ("DROP stale (queued " + $drop.QueuedAt.ToString('HH:mm:ss') + ") | " + $drop.Message)
      }
      foreach ($message in $selection.Deliver) {
        & (Join-Path $PSScriptRoot 'notify.ps1') -Message $message -MinIdleMinutes 0
      }
      break
    }
    Start-Sleep -Seconds 30
  }
} finally {
  Remove-Item $lockPath -Force
  Write-Log ("WATCHER exit (pid " + $PID + ")")
}
'@

Write-Script 'hook-notification.ps1' @'
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
'@

Write-Script 'hook-stop.ps1' @'
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
'@

Write-Script 'hook-ask.ps1' @'
# Claude Code "PreToolUse" hook for the tools that hand control back to the user
# mid-turn: AskUserQuestion (interactive question) and ExitPlanMode (plan approval).
# The Stop hook cannot cover these - the turn has not ended when they run.
$raw = [Console]::In.ReadToEnd()
$logPath = Join-Path $PSScriptRoot 'log.txt'
"$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) HOOK PreToolUse | $($raw -replace '\s+', ' ')" | Add-Content $logPath -Encoding utf8

try { $data = $raw | ConvertFrom-Json } catch { exit 0 }
$proj = ''
if ($data.cwd) { $proj = '[' + (Split-Path -Leaf $data.cwd) + '] ' }

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
'@

Write-Script 'hook-permission-request.ps1' @'
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
'@

Write-Host "scripts written to $dir" -ForegroundColor Green

# ------------------------------------------------------------------- config
$cfgPath = Join-Path $dir 'config.json'
$cfg = if (Test-Path $cfgPath) { Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json } else { [pscustomobject]@{} }
function Get-Field($o, $n) { if ($o.PSObject.Properties[$n]) { $o.$n } else { $null } }

if (-not $Token) { $Token = Get-Field $cfg 'token' }
if (-not $Token) {
  if ($NonInteractive) { throw 'No token: pass -Token or run interactively.' }
  Write-Host ''
  Write-Host 'Telegram bot token. Create a bot in @BotFather (/newbot) if you have none.'
  $Token = (Read-Host 'Token').Trim()
}
if (-not $Token) { throw 'Token is required.' }

# Validate the token before doing anything else.
$me = Invoke-RestMethod -Uri "https://api.telegram.org/bot$Token/getMe"
Write-Host ("bot ok: @" + $me.result.username) -ForegroundColor Green

# Resolve chat id (reuse only if the token did not change).
$chatId = $null
if ((Get-Field $cfg 'token') -eq $Token) { $chatId = Get-Field $cfg 'chat_id' }
if (-not $chatId) {
  for ($i = 0; $i -lt 20; $i++) {
    $upd = Invoke-RestMethod -Uri "https://api.telegram.org/bot$Token/getUpdates"
    $chat = @($upd.result | ForEach-Object { $_.message.chat } | Where-Object { $_ }) | Select-Object -First 1
    if ($chat) { $chatId = $chat.id; Write-Host ("chat id: $chatId (" + $chat.first_name + ")") -ForegroundColor Green; break }
    if ($NonInteractive) { throw "No messages yet: write /start to @$($me.result.username) first." }
    Read-Host "Now write /start to @$($me.result.username) in Telegram, then press Enter"
  }
}
if (-not $chatId) { throw 'Could not resolve chat id.' }

if (-not $MachineLabel) { $MachineLabel = Get-Field $cfg 'machine_label' }
if (-not $MachineLabel -and -not $NonInteractive) {
  $suggest = $env:COMPUTERNAME
  $MachineLabel = (Read-Host "Machine label shown in pings, e.g. home / work [$suggest]").Trim()
  if (-not $MachineLabel) { $MachineLabel = $suggest }
}

$idle = if ($MinIdleMinutes -gt 0) { $MinIdleMinutes } else { $v = Get-Field $cfg 'min_idle_minutes'; if ($v) { [int]$v } else { 3 } }

[IO.File]::WriteAllText($cfgPath, ([pscustomobject]@{
  token            = $Token
  chat_id          = "$chatId"
  machine_label    = $MachineLabel
  min_idle_minutes = $idle
  stale_minutes    = 15
} | ConvertTo-Json), $utf8NoBom)
Write-Host "config written to $cfgPath" -ForegroundColor Green

# ------------------------------------------------------------ settings.json
$settingsPath = Join-Path $claudeDir 'settings.json'
$settings = if (Test-Path $settingsPath) { Get-Content $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json } else { [pscustomobject]@{} }

function ConvertTo-CompactJson($o) { $o | ConvertTo-Json -Depth 20 -Compress }

function Register-Hook($settings, [string]$EventName, [string]$ScriptFile, [string]$Wav, [string]$Matcher) {
  if (-not $settings.PSObject.Properties['hooks']) {
    $settings | Add-Member -NotePropertyName 'hooks' -NotePropertyValue ([pscustomobject]@{})
  }
  $h = $settings.hooks
  if (-not $h.PSObject.Properties[$EventName]) {
    $h | Add-Member -NotePropertyName $EventName -NotePropertyValue @()
  }
  # Drop our own previous entries; keep everything else untouched.
  $groups = @(@($h.$EventName) | Where-Object { (ConvertTo-CompactJson $_) -notlike '*telegram-notify*' })
  $hasSound = @($groups | Where-Object { (ConvertTo-CompactJson $_) -match 'SoundPlayer|PlaySync|afplay' }).Count -gt 0

  $entries = @()
  if (-not $hasSound -and $Wav) {
    $entries += [pscustomobject]@{
      type    = 'command'
      command = '(New-Object Media.SoundPlayer "' + $Wav + '").PlaySync()'
      shell   = 'powershell'
      timeout = 15
      async   = $true
    }
  }
  $entries += [pscustomobject]@{
    type    = 'command'
    command = 'powershell'
    args    = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $dir $ScriptFile))
    timeout = 30
    async   = $true
  }
  $group = [pscustomobject]@{ hooks = $entries }
  if ($Matcher) { $group | Add-Member -NotePropertyName 'matcher' -NotePropertyValue $Matcher }
  $groups += $group
  $h.$EventName = $groups
}

Register-Hook $settings 'Stop' 'hook-stop.ps1' 'C:\Windows\Media\Windows Notify.wav'
Register-Hook $settings 'Notification' 'hook-notification.ps1' 'C:\Windows\Media\chimes.wav'
# Questions, plan approvals and permission prompts happen mid-turn, where Stop
# never fires and Notification has never been seen to.
Register-Hook $settings 'PreToolUse' 'hook-ask.ps1' $null 'AskUserQuestion|ExitPlanMode'
Register-Hook $settings 'PermissionRequest' 'hook-permission-request.ps1' $null
[IO.File]::WriteAllText($settingsPath, (ConvertTo-Json $settings -Depth 20), $utf8NoBom)
Write-Host "hooks registered in $settingsPath" -ForegroundColor Green

# --------------------------------------------------------------- CLAUDE.md
$mdPath = Join-Path $claudeDir 'CLAUDE.md'
$marker = '# Telegram notifications when user action is needed'
$rule = @"
$marker

The user often steps away from the laptop during long tasks. Whenever you are about to end a turn that requires their action - you asked a question, finished a phase and are waiting for approval, or are blocked on their input - send a Telegram ping first:

``````
powershell -NoProfile -File $dir\notify.ps1 -Message "<message>"
``````

Message: short, in Russian, starts with the project name in brackets, says what is needed. Example: ``[job-finder] Закончил фазу 2, жду апрув на миграцию БД``. Keep under ~200 chars.

Do NOT send it for routine turn ends where nothing is needed from the user - only when you are actually waiting on them. Always just call the script and let it decide: it silently skips sending when the user has been active at the keyboard recently (they are at the laptop, the sound is enough), and queues the ping for delivery once they step away.
"@

$existing = if (Test-Path $mdPath) { Get-Content $mdPath -Raw -Encoding UTF8 } else { '' }
if ($existing -notlike "*$marker*") {
  $sep = if ($existing.Trim()) { "`r`n`r`n" } else { '' }
  [IO.File]::WriteAllText($mdPath, ($existing.TrimEnd() + $sep + $rule + "`r`n"), $utf8NoBom)
  Write-Host "rule added to $mdPath" -ForegroundColor Green
} else {
  Write-Host "rule already present in $mdPath" -ForegroundColor DarkGray
}

# ------------------------------------------------------------------- test
if (-not $SkipTest) {
  & (Join-Path $dir 'notify.ps1') -Message "[setup@$MachineLabel] Нотификации подключены на этой машине" -MinIdleMinutes 0
  Write-Host 'test message sent - check Telegram' -ForegroundColor Green
}

Write-Host ''
Write-Host 'Done. Restart Claude Code (close the app / exit the CLI) so the new hooks load.' -ForegroundColor Yellow
