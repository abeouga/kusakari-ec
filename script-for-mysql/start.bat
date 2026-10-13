@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
set "KUSAKARI_EC_EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%KUSAKARI_EC_EXIT_CODE%"=="0" echo Existing MySQL start failed. Check the message above.
if "%KUSAKARI_EC_EXIT_CODE%"=="0" echo Existing MySQL start completed.
if not "%KUSAKARI_EC_NO_PAUSE%"=="1" pause
exit /b %KUSAKARI_EC_EXIT_CODE%
