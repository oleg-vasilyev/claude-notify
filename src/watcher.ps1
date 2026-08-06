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
