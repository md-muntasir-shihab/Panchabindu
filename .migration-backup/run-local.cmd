@echo off
setlocal
cd /d "%~dp0"
set "SANDBOX="
for /f "delims=" %%I in ('node scripts\local\bootstrap.mjs') do set "SANDBOX=%%I"
if not defined SANDBOX (
  echo Local sandbox preparation failed. Install Node.js and inspect the error above.
  exit /b 1
)
cd /d "%SANDBOX%"
echo PRIVATE local-only sandbox: %SANDBOX%
echo Credentials and usage: %SANDBOX%\LOCAL-LOGIN.txt
echo Opening on http://127.0.0.1:3000 (stop with Ctrl+C)
node "%~dp0scripts\local\start.mjs"
exit /b %errorlevel%