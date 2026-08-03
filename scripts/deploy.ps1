$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$logDir = Join-Path $repoRoot 'logs'
$logFile = Join-Path $logDir 'deploy.log'
$apiPidFile = Join-Path $logDir 'api.pid'

if (!(Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Write-DeployLog([string]$message) {
  $timestamp = Get-Date -Format o
  Add-Content -Path $logFile -Value "[$timestamp] $message"
  Write-Host $message
}

function Invoke-CheckedCommand([string]$command, [string[]]$arguments, [string]$description) {
  Write-DeployLog "RUN: $description"
  & $command @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$description failed with exit code $LASTEXITCODE"
  }
}

function Test-Health([int]$timeoutSeconds = 20) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/health' -UseBasicParsing -TimeoutSec 10
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        return $true
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  return $false
}

Write-DeployLog "Starting deployment from $repoRoot"

Push-Location $repoRoot
try {
  Invoke-CheckedCommand -command 'git' -arguments @('pull', '--autostash') -description 'git pull --autostash'
  Invoke-CheckedCommand -command 'npm.cmd' -arguments @('run', 'build') -description 'npm run build'

  if (Test-Path $apiPidFile) {
    $rawPid = (Get-Content -Path $apiPidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    $pid = 0
    if ([int]::TryParse([string]$rawPid, [ref]$pid) -and $pid -gt 0) {
      $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
      if ($proc) {
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Write-DeployLog "Stopped previous managed API process PID=$pid"
      }
    }
    Remove-Item -Path $apiPidFile -ErrorAction SilentlyContinue
  }

  $apiOut = Join-Path $logDir 'api.out.log'
  $apiErr = Join-Path $logDir 'api.err.log'
  $apiProcess = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'api') -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru
  Set-Content -Path $apiPidFile -Value $apiProcess.Id
  Write-DeployLog "Started API process PID=$($apiProcess.Id)"

  if (Test-Health) {
    Write-DeployLog 'Deployment completed successfully. API health check passed.'
  } else {
    throw 'API health check failed after deployment.'
  }
}
finally {
  Pop-Location
}
