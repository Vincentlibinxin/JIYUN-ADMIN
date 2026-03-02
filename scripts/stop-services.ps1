$ErrorActionPreference = 'Continue'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$logDir = Join-Path $repoRoot 'logs'
$logFile = Join-Path $logDir 'autostart.log'

if (!(Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

foreach ($port in @(3001, 3002)) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listeners) {
    $ids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($id in $ids) {
      try {
        Stop-Process -Id $id -Force -ErrorAction Stop
        Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] Stopped PID=$id on port $port"
      } catch {
        Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] WARN: failed to stop PID=$id on port $port. $($_.Exception.Message)"
      }
    }
  } else {
    Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] No listener on port $port"
  }
}
