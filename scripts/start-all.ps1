param(
  [Parameter(Mandatory = $false)]
  [ValidateSet('auto', 'dev', 'prod', 'stop')]
  [string]$Mode = 'auto'
)

$ErrorActionPreference = 'Stop'

# ============================================================
#  一键启动调度脚本（开发 / 生产 通用）
#    -Mode dev   开发环境：后端 tsx watch 热重载 + 前端 Vite HMR
#    -Mode prod  生产环境：npm run build + 后台 api/preview + 健康检查
#    -Mode stop  停止占用 3001 / 3002 端口的服务
# ============================================================

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$logDir = Join-Path $repoRoot 'logs'
if (!(Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

function Write-Ok([string]$m) { Write-Host "    [OK] $m" -ForegroundColor Green }
function Write-Warn2([string]$m) { Write-Host "    [警告] $m" -ForegroundColor Yellow }
function Write-Err([string]$m) { Write-Host "    [错误] $m" -ForegroundColor Red }

function Resolve-Npm {
  $npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
  if (-not $npm) {
    $npm = (Get-Command npm -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
  }
  if (-not $npm -or !(Test-Path $npm)) {
    Write-Err 'npm 未在 PATH 中找到，请先安装 Node.js / npm。'
    throw 'npm command not found in PATH'
  }
  return $npm
}

function Stop-OldServices {
  Write-Host ''
  Write-Host '==> 停止占用端口 3001 / 3002 的旧进程' -ForegroundColor Cyan
  $stopped = $false
  foreach ($port in @(3001, 3002)) {
    $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listeners) {
      $ids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
      foreach ($id in $ids) {
        $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($proc -and $proc.ProcessName -eq 'Code') {
          Write-Warn2 "端口 $port 被 VS Code 进程 (PID=$id) 占用（端口自动转发），已跳过以免关闭编辑器。"
          Write-Warn2 '  如需释放：在 VS Code 底部 PORTS 面板删除该端口，或重载窗口 (Reload Window)。'
          continue
        }
        try {
          Stop-Process -Id $id -Force -ErrorAction Stop
          Write-Ok "已停止端口 $port 上的进程 PID=$id"
          $stopped = $true
        } catch {
          Write-Warn2 "无法停止端口 $port 上的进程 PID=$id：$($_.Exception.Message)"
        }
      }
    }
  }
  if (-not $stopped) {
    Write-Ok '没有正在运行的旧服务，跳过。'
  }
}

# --- 自动环境判断（本机=开发，其它机器=生产）---
# 开发机器名清单：如果你还有其它开发电脑，把它的计算机名追加到这里即可
$DevMachineNames = @('VINSHUAWEILAPTO')

function Resolve-AutoMode {
  # 1) 若显式设置了环境变量 APP_ENV，则优先按它判断（prod*=生产，其余=开发）
  if ($env:APP_ENV) {
    if ($env:APP_ENV -match '(?i)prod') { return 'prod' }
    return 'dev'
  }
  # 2) 否则按计算机名判断：在开发机清单里=开发，否则=生产
  if ($DevMachineNames -contains $env:COMPUTERNAME) { return 'dev' }
  return 'prod'
}

if ($Mode -eq 'auto') {
  $detected = Resolve-AutoMode
  Write-Host ''
  Write-Host "==> 自动检测环境：计算机名 = $($env:COMPUTERNAME) → 判定为【$detected】模式" -ForegroundColor Magenta
  $Mode = $detected
}

switch ($Mode) {
  'stop' {
    Write-Host '============================================================' -ForegroundColor DarkCyan
    Write-Host '            跨境物流系统 - 停止所有服务' -ForegroundColor White
    Write-Host '============================================================' -ForegroundColor DarkCyan
    Stop-OldServices
    Write-Host ''
    Write-Ok '已停止 3001 / 3002 端口上的服务。'
  }
  'prod' {
    # 生产环境：直接复用现有的重构建+重启脚本（build + 后台 api/preview + 健康检查）
    & (Join-Path $scriptDir 'rebuild-restart.ps1')
  }
  'dev' {
    $npmCmd = Resolve-Npm
    Write-Host '============================================================' -ForegroundColor DarkCyan
    Write-Host '            跨境物流系统 - 一键启动（开发环境）' -ForegroundColor White
    Write-Host '============================================================' -ForegroundColor DarkCyan
    Stop-OldServices
    Write-Host ''
    Write-Host '==> 启动开发环境（后端热重载 + 前端 HMR）' -ForegroundColor Cyan
    Write-Host '    后端 API : http://127.0.0.1:3001 （tsx watch，改后端代码自动重载）' -ForegroundColor Gray
    Write-Host '    前端页面 : http://127.0.0.1:3002 （Vite HMR，改前端代码即时刷新，无需打包）' -ForegroundColor Gray
    Write-Host '    提示：按 Ctrl+C 可停止开发服务并返回。' -ForegroundColor Yellow
    Write-Host ''
    # 前台运行 dev:all（concurrently 同时跑 api:dev 与 dev），实时输出日志
    & $npmCmd 'run' 'dev:all'
  }
}
