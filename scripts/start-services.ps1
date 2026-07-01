$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if (-not $npmCmd) {
  $npmCmd = (Get-Command npm -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
}
$logDir = Join-Path $repoRoot 'logs'
$logFile = Join-Path $logDir 'autostart.log'
$apiPidFile = Join-Path $logDir 'api.pid'

if (!(Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

if (-not $npmCmd -or !(Test-Path $npmCmd)) {
  Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] ERROR: npm command not found in PATH"
  throw 'npm command not found in PATH'
}

function Stop-ManagedApiProcess() {
  if (!(Test-Path $apiPidFile)) {
    return
  }

  $rawPid = (Get-Content -Path $apiPidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  $pid = 0
  if ([int]::TryParse([string]$rawPid, [ref]$pid) -and $pid -gt 0) {
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($proc) {
      try {
        Stop-Process -Id $pid -Force -ErrorAction Stop
        Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] Stopped managed API process PID=$pid"
      } catch {
        Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] WARN: failed to stop managed API PID=$pid. $($_.Exception.Message)"
      }
    }
  }

  Remove-Item -Path $apiPidFile -ErrorAction SilentlyContinue
}

function Assert-ApiPortAvailable([int]$port) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (!$listeners) {
    return
  }

  $ids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
  $details = @()
  foreach ($id in $ids) {
    $process = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($process) {
      $details += "$($process.ProcessName)#$id"
    } else {
      $details += "unknown#$id"
    }
  }

  $detailText = if ($details.Count -gt 0) { $details -join ', ' } else { 'unknown process' }
  Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] ERROR: API port $port is occupied by $detailText"
  throw "Port $port is already in use by $detailText. To avoid cross-project conflicts, start-services.ps1 only manages this project's API process."
}

Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] Starting services from $repoRoot"

Stop-ManagedApiProcess
Assert-ApiPortAvailable -port 3001

Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] Building frontend assets before start"
$buildOut = Join-Path $logDir 'build.out.log'
$buildErr = Join-Path $logDir 'build.err.log'
$buildProcess = Start-Process -FilePath $npmCmd -ArgumentList @('run', 'build') -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $buildOut -RedirectStandardError $buildErr -PassThru -Wait
if ($buildProcess.ExitCode -ne 0) {
  Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] ERROR: build failed, startup aborted"
  throw "Build failed. Startup aborted."
}
Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] Build finished successfully"

$apiOut = Join-Path $logDir 'api.out.log'
$apiErr = Join-Path $logDir 'api.err.log'

 # Start API service for this project only
$apiProcess = Start-Process -FilePath $npmCmd -ArgumentList @('run', 'api') -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru
Set-Content -Path $apiPidFile -Value $apiProcess.Id
Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] API service launched (port 3001, PID=$($apiProcess.Id))"

Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] NOTE: nginx is not started/stopped by this script. Manage shared nginx/portproxy globally to avoid conflicts with other projects."

Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] Start commands launched"
