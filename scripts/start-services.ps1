$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$nodeDir = 'C:\Program Files\nodejs'
$npmCmd = Join-Path $nodeDir 'npm.cmd'
$logDir = Join-Path $repoRoot 'logs'
$logFile = Join-Path $logDir 'autostart.log'

if (!(Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

if (!(Test-Path $npmCmd)) {
  Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] ERROR: npm.cmd not found at $npmCmd"
  throw "npm.cmd not found at $npmCmd"
}

function Stop-PortListeners([int[]]$ports) {
  foreach ($port in $ports) {
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
    }
  }
}

Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] Starting services from $repoRoot"

Stop-PortListeners -ports @(3001, 3002)

$apiOut = Join-Path $logDir 'api.out.log'
$apiErr = Join-Path $logDir 'api.err.log'
$webOut = Join-Path $logDir 'web.out.log'
$webErr = Join-Path $logDir 'web.err.log'

Start-Process -FilePath $npmCmd -ArgumentList @('run', 'api') -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr
Start-Sleep -Seconds 1
Start-Process -FilePath $npmCmd -ArgumentList @('run', 'preview', '--', '--host', '0.0.0.0', '--port', '3002') -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $webOut -RedirectStandardError $webErr

Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] Start commands launched"
