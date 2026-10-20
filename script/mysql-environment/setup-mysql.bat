@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-mysql.ps1" %*
set "KUSAKARI_EC_EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%KUSAKARI_EC_EXIT_CODE%"=="0" echo MySQL setup failed. Check the message above.
if "%KUSAKARI_EC_EXIT_CODE%"=="0" echo MySQL setup verified. See README.md in this folder for next steps.
if not "%KUSAKARI_EC_NO_PAUSE%"=="1" pause
exit /b %KUSAKARI_EC_EXIT_CODE%
