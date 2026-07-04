$ErrorActionPreference = 'Stop'

# ============================================================
#  一键重构建并重启服务
#  - 停止占用 3001 / 3002 端口的旧进程
#  - 重新构建前端产物 (npm run build)
#  - 启动后端 API 服务 (端口 3001)
#  - 启动前端预览服务 (端口 3002)
#  - 健康检查，确认两个服务均已就绪
# ============================================================

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$logDir = Join-Path $repoRoot 'logs'
$logFile = Join-Path $logDir 'autostart.log'

if (!(Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

function Write-Step([string]$message) {
  Write-Host ''
  Write-Host "==> $message" -ForegroundColor Cyan
  Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] $message"
}

function Write-Ok([string]$message) {
  Write-Host "    [OK] $message" -ForegroundColor Green
}

function Write-Warn2([string]$message) {
  Write-Host "    [警告] $message" -ForegroundColor Yellow
  Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] WARN: $message"
}

function Write-Err([string]$message) {
  Write-Host "    [错误] $message" -ForegroundColor Red
  Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] ERROR: $message"
}

Write-Host '============================================================' -ForegroundColor DarkCyan
Write-Host '            跨境物流系统 - 一键重构建并重启服务' -ForegroundColor White
Write-Host '============================================================' -ForegroundColor DarkCyan

# --- 解析 npm 路径 ---
$npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if (-not $npmCmd) {
  $npmCmd = (Get-Command npm -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
}
if (-not $npmCmd -or !(Test-Path $npmCmd)) {
  Write-Err 'npm 未在 PATH 中找到，请先安装 Node.js / npm。'
  throw 'npm command not found in PATH'
}

# --- 1. 停止旧进程 ---
Write-Step '1/4 停止占用端口 3001 / 3002 的旧进程'
$stoppedAny = $false
foreach ($port in @(3001, 3002)) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listeners) {
    $ids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($id in $ids) {
      try {
        Stop-Process -Id $id -Force -ErrorAction Stop
        Write-Ok "已停止端口 $port 上的进程 PID=$id"
        Add-Content -Path $logFile -Value "[$(Get-Date -Format o)] Stopped PID=$id on port $port"
        $stoppedAny = $true
      } catch {
        Write-Warn2 "无法停止端口 $port 上的进程 PID=$id：$($_.Exception.Message)"
      }
    }
  }
}
if (-not $stoppedAny) {
  Write-Ok '没有正在运行的旧服务，跳过。'
}

# --- 2. 重新构建前端 ---
Write-Step '2/4 重新构建前端产物 (npm run build)'
Write-Host '    构建中，请稍候……' -ForegroundColor Gray
$buildProcess = Start-Process -FilePath $npmCmd -ArgumentList @('run', 'build') -WorkingDirectory $repoRoot -NoNewWindow -PassThru -Wait
if ($buildProcess.ExitCode -ne 0) {
  Write-Err "构建失败 (ExitCode=$($buildProcess.ExitCode))，已中止重启。请检查上方报错信息。"
  throw 'Build failed. Restart aborted.'
}
Write-Ok '前端构建成功。'

# --- 3. 启动服务 ---
Write-Step '3/4 启动后端 API 与前端预览服务'
$apiOut = Join-Path $logDir 'api.out.log'
$apiErr = Join-Path $logDir 'api.err.log'
$webOut = Join-Path $logDir 'web.out.log'
$webErr = Join-Path $logDir 'web.err.log'

Start-Process -FilePath $npmCmd -ArgumentList @('run', 'api') -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr
Write-Ok '后端 API 服务已启动 (端口 3001)。'
Start-Sleep -Seconds 1
Start-Process -FilePath $npmCmd -ArgumentList @('run', 'preview', '--', '--host', '0.0.0.0', '--port', '3002') -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $webOut -RedirectStandardError $webErr
Write-Ok '前端预览服务已启动 (端口 3002)。'

# --- 4. 健康检查 ---
Write-Step '4/4 健康检查（最多等待约 30 秒）'

function Test-ServiceReady([int]$port, [int]$timeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      try {
        $asyncResult = $client.BeginConnect('127.0.0.1', $port, $null, $null)
        if ($asyncResult.AsyncWaitHandle.WaitOne(3000, $false) -and $client.Connected) {
          $client.EndConnect($asyncResult)
          return 1
        }
      } finally {
        $client.Close()
      }
    } catch {
      Start-Sleep -Milliseconds 800
    }
  }
  return $null
}

$apiStatus = Test-ServiceReady -port 3001
if ($apiStatus) {
  Write-Ok '后端 API (3001) 已就绪，端口监听正常。'
} else {
  Write-Warn2 '后端 API (3001) 未在预期时间内响应，请查看 logs\api.err.log。'
}

$webStatus = Test-ServiceReady -port 3002
if ($webStatus) {
  Write-Ok '前端预览 (3002) 已就绪，端口监听正常。'
} else {
  Write-Warn2 '前端预览 (3002) 未在预期时间内响应，请查看 logs\web.err.log。'
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor DarkCyan
if ($apiStatus -and $webStatus) {
  Write-Host '            全部服务已重构建并重启完成！' -ForegroundColor Green
  Write-Host '            后端 API : http://127.0.0.1:3001' -ForegroundColor White
  Write-Host '            前端页面 : http://127.0.0.1:3002' -ForegroundColor White
} else {
  Write-Host '            重启完成，但部分服务健康检查未通过。' -ForegroundColor Yellow
  Write-Host '            请查看 logs 目录下的日志文件排查。' -ForegroundColor Yellow
}
Write-Host '============================================================' -ForegroundColor DarkCyan
