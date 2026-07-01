$ErrorActionPreference = 'Continue'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$logDir = Join-Path $repoRoot 'logs'
$logFile = Join-Path $logDir 'autostart.log'
$apiPidFile = Join-Path $logDir 'api.pid'

if (!(Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

if (Test-Path $apiPidFile) {
  $rawPid = (Get-Content -Path $apiPidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  $apiPid = 0
  if ([int]::TryParse([string]$rawPid, [ref]$apiPid) -and $apiPid -gt 0) {
    try {
      Stop-Process -Id $apiPid -Force -ErrorAction Stop
      Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] Stopped managed API PID=$apiPid"
    } catch {
      Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] WARN: failed to stop managed API PID=$apiPid. $($_.Exception.Message)"
    }
  }
  Remove-Item -Path $apiPidFile -ErrorAction SilentlyContinue
} else {
  Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] No managed api.pid found; nothing to stop"
}
