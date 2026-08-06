# Reads the current limit windows from the account Claude Code is signed into.
#
# The only source that exists: the CLI itself calls GET /api/oauth/usage with the
# OAuth token it maintains, and neither the status line nor any local file carries
# consumption. Three rules make borrowing that token acceptable:
#   - it is read at send time, never logged, never written anywhere;
#   - the request is a GET to the token's own issuer and changes nothing;
#   - the token is never refreshed - that is the CLI's job, and racing it could
#     break the session that owns it. An expired token simply yields no line.
# A failure here must never fail a ping, so every path returns $null instead.

function Get-UsageSnapshot {
  param([int]$TimeoutSec = 6)

  $credentialsPath = Join-Path $env:USERPROFILE '.claude\.credentials.json'
  if (-not (Test-Path $credentialsPath)) { return $null }

  $token = $null
  try {
    $credentials = Get-Content $credentialsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($property in $credentials.PSObject.Properties) {
      if ($property.Value -is [pscustomobject] -and $property.Value.PSObject.Properties['accessToken']) {
        $token = $property.Value.accessToken
        break
      }
    }
  } catch {
    return $null
  }
  if (-not $token) { return $null }

  try {
    return Invoke-RestMethod -Uri 'https://api.anthropic.com/api/oauth/usage' `
      -Headers @{ Authorization = "Bearer $token" } -TimeoutSec $TimeoutSec
  } catch {
    return $null
  } finally {
    $token = $null
  }
}
