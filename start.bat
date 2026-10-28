@echo off
setlocal
if not exist "%~dp0.env" (
  echo Kusakariの初回セットアップを開始します。
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1"
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
if errorlevel 1 (
  pause
  exit /b 1
)
exit /b 0
