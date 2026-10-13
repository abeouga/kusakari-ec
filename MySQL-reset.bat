@echo off
setlocal
rem Keep this launcher ASCII-only so cmd.exe code pages do not affect startup.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\mysql-reset.ps1" %*
set "KUSAKARI_EC_EXIT_CODE=%ERRORLEVEL%"
if not "%KUSAKARI_EC_EXIT_CODE%"=="0" (
  echo MySQL reset failed. Check the message above.
  pause
)
exit /b %KUSAKARI_EC_EXIT_CODE%
