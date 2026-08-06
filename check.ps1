# The gate: lint, tests, build, and dist drift. Run it before any commit:
#   powershell -NoProfile -ExecutionPolicy Bypass -File check.ps1
# Exits non-zero on the first failing gate. Installs its two dev dependencies
# (PSScriptAnalyzer, Pester 5+) into the current user profile when missing.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$failed = $false

function Write-Gate([string]$Name, [bool]$Ok, [string]$Detail) {
  $mark = if ($Ok) { 'PASS' } else { 'FAIL' }
  $color = if ($Ok) { 'Green' } else { 'Red' }
  Write-Host ("[{0}] {1} - {2}" -f $mark, $Name, $Detail) -ForegroundColor $color
}

function Confirm-Module([string]$Name, [version]$MinVersion) {
  $found = Get-Module -ListAvailable $Name | Where-Object { $_.Version -ge $MinVersion }
  if (-not $found) {
    Write-Host "installing $Name (>= $MinVersion) into the current user profile..." -ForegroundColor Yellow
    Install-Module $Name -MinimumVersion $MinVersion -Force -SkipPublisherCheck -Scope CurrentUser
  }
}

Confirm-Module 'PSScriptAnalyzer' '1.20.0'
Confirm-Module 'Pester' '5.0.0'
Import-Module PSScriptAnalyzer
Import-Module Pester -MinimumVersion 5.0.0

# ---- gate 1: lint --------------------------------------------------------
# Payload scripts run headless under hooks, so the full rule set applies.
# The CLI tools talk to a human in color, which is exactly what Write-Host is
# for - the one excluded rule, and only for them.
$payload = Get-ChildItem "$root\src\*.ps1" | Where-Object { $_.Name -ne 'installer.ps1' }
$findings = @()
foreach ($f in $payload) { $findings += Invoke-ScriptAnalyzer -Path $f.FullName -Severity Warning, Error }
foreach ($f in @("$root\src\installer.ps1", "$root\build.ps1", "$root\check.ps1")) {
  $findings += Invoke-ScriptAnalyzer -Path $f -Severity Warning, Error -ExcludeRule PSAvoidUsingWriteHost
}
$findings += Invoke-ScriptAnalyzer -Path "$root\tests" -Recurse -Severity Warning, Error
if ($findings.Count) {
  $findings | Select-Object ScriptName, Line, RuleName, Message | Format-List | Out-String | Write-Host
  Write-Gate 'lint' $false "$($findings.Count) finding(s)"
  $failed = $true
} else {
  Write-Gate 'lint' $true 'PSScriptAnalyzer clean'
}

# ---- gate 2: tests -------------------------------------------------------
$config = New-PesterConfiguration
$config.Run.Path = "$root\tests"
$config.Run.PassThru = $true
$config.Output.Verbosity = 'Normal'
$result = Invoke-Pester -Configuration $config
if ($result.FailedCount -gt 0 -or $result.PassedCount -eq 0) {
  Write-Gate 'tests' $false "$($result.FailedCount) failed of $($result.TotalCount)"
  $failed = $true
} else {
  Write-Gate 'tests' $true "$($result.PassedCount) passed"
}

# ---- gate 3: build + dist drift -----------------------------------------
# dist/setup.ps1 is a build artifact; editing it by hand, or editing src/ and
# forgetting to rebuild, are the same mistake seen from two sides.
$tmp = Join-Path $env:TEMP ("claude-notify-check-" + [guid]::NewGuid().ToString('n') + ".ps1")
try {
  & "$root\build.ps1" -OutFile $tmp | Out-Null
  $built = [IO.File]::ReadAllBytes($tmp)
  $dist = [IO.File]::ReadAllBytes("$root\dist\setup.ps1")
  $same = ($built.Length -eq $dist.Length)
  if ($same) {
    for ($i = 0; $i -lt $built.Length; $i++) {
      if ($built[$i] -ne $dist[$i]) { $same = $false; break }
    }
  }
  if ($same) {
    Write-Gate 'dist' $true 'dist/setup.ps1 matches src/'
  } else {
    Write-Gate 'dist' $false 'dist/setup.ps1 is stale - run build.ps1 and commit it'
    $failed = $true
  }
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}

Write-Host ''
if ($failed) {
  Write-Host 'check failed' -ForegroundColor Red
  exit 1
}
Write-Host 'check passed' -ForegroundColor Green
