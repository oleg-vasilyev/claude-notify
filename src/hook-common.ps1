# Shared plumbing for the hook scripts: read the payload, log it, name the project.
. (Join-Path $PSScriptRoot 'notify-core.ps1')

# Reading stdin needs a helper of its own. [Console]::In decodes with the console
# code page, so a payload carrying Cyrillic - a question's own text - arrives as
# mojibake; Claude Code writes UTF-8, so the stream is read as UTF-8 explicitly.
function Read-HookStdin {
  $stream = [Console]::OpenStandardInput()
  $reader = New-Object IO.StreamReader($stream, (New-Object Text.UTF8Encoding($false)))
  try {
    return $reader.ReadToEnd()
  } finally {
    $reader.Dispose()
  }
}

function Write-HookLog {
  param(
    [Parameter(Mandatory = $true)][string]$EventName,
    [AllowEmptyString()][AllowNull()][string]$Raw
  )
  $line = "$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) HOOK $EventName | $(Format-LogPayload $Raw)"
  $line | Add-Content (Join-Path $PSScriptRoot 'log.txt') -Encoding utf8
}

function Read-HookPayload {
  param([Parameter(Mandatory = $true)][string]$EventName)
  $raw = Read-HookStdin
  Write-HookLog -EventName $EventName -Raw $raw
  try {
    return $raw | ConvertFrom-Json
  } catch {
    return $null
  }
}
