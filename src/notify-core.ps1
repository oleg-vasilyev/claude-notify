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
