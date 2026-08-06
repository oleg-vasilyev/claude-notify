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

function Get-ProjectPrefix {
  param([AllowEmptyString()][AllowNull()][string]$Cwd)
  if (-not $Cwd) { return '' }
  return '[' + (Split-Path -Leaf $Cwd) + '] '
}

function Format-LogPayload {
  param(
    [AllowEmptyString()][AllowNull()][string]$Raw,
    [int]$MaxChars = 400
  )
  if (-not $Raw) { return '' }
  $flat = ($Raw -replace '\s+', ' ').Trim()
  if ($flat.Length -le $MaxChars) { return $flat }
  return $flat.Substring(0, $MaxChars) + '... (' + $flat.Length + ' chars)'
}

function Format-Duration {
  param([Parameter(Mandatory = $true)][timespan]$Span)
  if ($Span.TotalMinutes -lt 1) { return 'меньше минуты' }
  $hours = [int][Math]::Floor($Span.TotalHours)
  $minutes = $Span.Minutes
  if ($hours -lt 1) { return ('' + $minutes + ' мин') }
  if ($minutes -eq 0) { return ('' + $hours + ' ч') }
  return ('' + $hours + ' ч ' + $minutes + ' мин')
}

function Select-UsageWindow {
  param($Usage)
  $session = $null
  $weekly = $null
  foreach ($limit in @($Usage.limits)) {
    if (-not $limit) { continue }
    if ($limit.group -eq 'session') {
      if ($null -eq $session -or $limit.percent -gt $session.percent) { $session = $limit }
    } elseif ($limit.group -eq 'weekly') {
      if ($null -eq $weekly -or $limit.percent -gt $weekly.percent) { $weekly = $limit }
    }
  }
  # Older shape, and the fallback if limits[] ever disappears.
  if ($null -eq $session -and $Usage.five_hour) {
    $session = [pscustomobject]@{ percent = $Usage.five_hour.utilization; resets_at = $Usage.five_hour.resets_at; scope = $null }
  }
  if ($null -eq $weekly -and $Usage.seven_day) {
    $weekly = [pscustomobject]@{ percent = $Usage.seven_day.utilization; resets_at = $Usage.seven_day.resets_at; scope = $null }
  }
  return [pscustomobject]@{ Session = $session; Weekly = $weekly }
}

function Format-UsageLine {
  param(
    $Usage,
    [Parameter(Mandatory = $true)][datetime]$Now,
    # Below this a reset time is noise; above it, it is the whole point.
    [int]$WarnAtPercent = 80
  )
  if ($null -eq $Usage) { return '' }
  $windows = Select-UsageWindow -Usage $Usage

  $parts = @()
  foreach ($pair in @(@{ Label = '5ч'; Window = $windows.Session }, @{ Label = 'нед'; Window = $windows.Weekly })) {
    $window = $pair.Window
    if ($null -eq $window -or $null -eq $window.percent) { continue }
    $label = $pair.Label
    if ($window.scope -and $window.scope.model -and $window.scope.model.display_name) {
      $label = $label + '/' + $window.scope.model.display_name
    }
    $percent = [int][Math]::Round([double]$window.percent)
    $text = $label + ' ' + $percent + '%'
    if ($percent -ge $WarnAtPercent -and $window.resets_at) {
      try {
        $resetsAt = [datetimeoffset]::Parse($window.resets_at, [Globalization.CultureInfo]::InvariantCulture)
        $left = $resetsAt.UtcDateTime - $Now.ToUniversalTime()
        if ($left.Ticks -gt 0) { $text = $text + ' (сброс через ' + (Format-Duration $left) + ')' }
      } catch {
        $null = $_
      }
    }
    $parts += $text
  }
  return ($parts -join ' · ')
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
