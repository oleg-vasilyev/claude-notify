# Assembles src\installer.ps1 + the notifier scripts into one standalone dist\setup.ps1.
# Run after changing anything under src\:
#   powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1
param(
  [string]$OutFile = (Join-Path $PSScriptRoot 'dist\setup.ps1')
)
$ErrorActionPreference = 'Stop'

$src = Join-Path $PSScriptRoot 'src'
$payloadFiles = @('notify-core.ps1', 'notify.ps1', 'watcher.ps1', 'hook-notification.ps1', 'hook-stop.ps1', 'hook-ask.ps1', 'hook-permission-request.ps1')

$sb = New-Object System.Text.StringBuilder
foreach ($name in $payloadFiles) {
  $path = Join-Path $src $name
  if (-not (Test-Path $path)) { throw "missing payload file: $path" }
  $body = (Get-Content $path -Raw -Encoding UTF8).TrimEnd()
  # The payload is embedded in a single-quoted here-string, so a line starting
  # with '@ inside it would terminate that here-string early.
  if ($body -match "(?m)^'@") { throw "$name contains a here-string terminator at column 0 - rewrite it without here-strings" }
  [void]$sb.AppendLine("Write-Script '$name' @'")
  [void]$sb.AppendLine($body)
  [void]$sb.AppendLine("'@")
  [void]$sb.AppendLine('')
}

$installerPath = Join-Path $src 'installer.ps1'
$installer = Get-Content $installerPath -Raw -Encoding UTF8
if ($installer -notmatch '(?m)^#__PAYLOAD__') { throw "marker #__PAYLOAD__ not found in $installerPath" }
# Literal replace: the payload contains $ and backtick sequences that -replace would eat.
$out = $installer.Replace('#__PAYLOAD__', $sb.ToString().TrimEnd())

$outDir = Split-Path -Parent $OutFile
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
# UTF-8 with BOM: Windows PowerShell 5.1 reads BOM-less files as ANSI and would
# mangle the Cyrillic message strings.
[IO.File]::WriteAllText($OutFile, $out, (New-Object System.Text.UTF8Encoding($true)))

# Fail the build on a syntax error rather than shipping a broken installer.
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($OutFile, [ref]$null, [ref]$errors)
if ($errors -and $errors.Count) {
  $errors | ForEach-Object { Write-Host $_.Message -ForegroundColor Red }
  throw "$OutFile has $($errors.Count) syntax error(s)"
}

Write-Host ("built {0} ({1:N0} bytes, {2} embedded scripts)" -f $OutFile, (Get-Item $OutFile).Length, $payloadFiles.Count) -ForegroundColor Green
