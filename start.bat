@echo off
setlocal
if exist "%~dp0.env" (
  findstr /b /c:"KUSAKARI_EC_DATABASE_MODE=existing" "%~dp0.env" >nul
  if not errorlevel 1 goto existing_mysql
)
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

:existing_mysql
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-existing-mysql.ps1" %*
if errorlevel 1 (
  if not "%KUSAKARI_EC_NO_PAUSE%"=="1" pause
  exit /b 1
)
exit /b 0
