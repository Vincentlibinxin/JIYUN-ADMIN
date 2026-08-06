@echo off
setlocal EnableExtensions
chcp 65001 >nul
title 跨境物流系统 - 一键启动程序
set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"
set "PS_SCRIPT=%ROOT_DIR%scripts\start-all.ps1"

:menu
cls
echo.
echo  ============================================================
echo             跨境物流系统 - 一键启动程序
echo  ============================================================
echo.
echo     [A] 自动检测   按本机自动判断开发/生产（直接回车默认此项）
echo.
echo     [1] 开发环境   热更新，改代码即时生效，不打包
echo                    后端 tsx watch 自动重载 + 前端 Vite HMR
echo.
echo     [2] 生产环境   重构建并重启服务
echo                    build + api + preview + 健康检查
echo                    访问地址 http://127.0.0.1:3001 / http://127.0.0.1:3002
echo                    适用于上线前验证或代码变更后的完整重启
echo.
echo     [3] 停止服务   释放 3001 / 3002 端口
echo.
echo     [4] 重启后端API 仅重启 3001（排查 500 推荐）
echo                    不重新构建前端，速度更快
echo.
echo     [0] 退出
echo.
echo  ------------------------------------------------------------
set "choice="
set /p choice=  请输入选项编号后回车（默认 A 自动）: 

if not defined choice goto auto
if /i "%choice%"=="A" goto auto
if "%choice%"=="1" goto dev
if "%choice%"=="2" goto prod
if "%choice%"=="3" goto stop
if "%choice%"=="4" goto api
if "%choice%"=="0" goto end
echo.
echo  无效选项，请重新输入。
timeout /t 1 >nul
goto menu

:auto
echo.
echo  正在【自动检测环境】并启动……
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -Mode auto
goto afterrun

:dev
echo.
echo  正在启动【开发环境】…… （按 Ctrl+C 可停止并返回菜单）
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -Mode dev
goto afterrun

:prod
echo.
echo  正在启动【生产环境】……
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -Mode prod
goto afterrun

:stop
echo.
echo  正在停止所有服务……
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -Mode stop
goto afterrun

:api
echo.
echo  正在【仅重启后端 API】……
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -Mode api
goto afterrun

:afterrun
echo.
echo  操作结束。按任意键返回菜单……
pause >nul
goto menu

:end
echo.
echo  已退出。
timeout /t 1 >nul
