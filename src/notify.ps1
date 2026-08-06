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

# Limits are read at send time, so a ping delivered from the queue carries
# current numbers rather than the ones from when it was suppressed.
$includeUsage = $true
if ($cfg.PSObject.Properties['include_usage']) { $includeUsage = [bool]$cfg.include_usage }
if ($includeUsage) {
  . (Join-Path $PSScriptRoot 'usage.ps1')
  $usageLine = Format-UsageLine -Usage (Get-UsageSnapshot) -Now (Get-Date)
  if ($usageLine) {
    $Message = $Message + "`n" + $usageLine
  } else {
    Write-Log 'WARN usage unavailable'
  }
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
