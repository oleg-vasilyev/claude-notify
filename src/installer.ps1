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

#__PAYLOAD__

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
