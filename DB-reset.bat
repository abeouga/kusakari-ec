@echo off
setlocal
rem Keep this launcher ASCII-only so cmd.exe code pages do not affect startup.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\reset-database.ps1" %*
set "KUSAKARI_EC_EXIT_CODE=%ERRORLEVEL%"
if "%KUSAKARI_EC_EXIT_CODE%"=="2" (
  echo Database reset was cancelled. Nothing was changed.
  pause
  exit /b 2
)
if not "%KUSAKARI_EC_EXIT_CODE%"=="0" (
  echo Database reset failed. Check the message above.
  pause
)
exit /b %KUSAKARI_EC_EXIT_CODE%
