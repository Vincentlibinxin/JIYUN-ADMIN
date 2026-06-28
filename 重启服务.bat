@echo off
chcp 65001 >nul
title 跨境物流系统 - 一键重构建并重启服务
cd /d "%~dp0"

echo.
echo  正在启动「一键重构建并重启服务」……
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\rebuild-restart.ps1"
set EXITCODE=%ERRORLEVEL%

echo.
if "%EXITCODE%"=="0" (
  echo  操作完成。按任意键关闭本窗口。
) else (
  echo  操作未成功完成（错误码 %EXITCODE%）。请查看上方信息或 logs 目录日志。
)
pause >nul
