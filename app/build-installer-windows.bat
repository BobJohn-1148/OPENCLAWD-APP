@echo off
setlocal
cd /d %~dp0

echo [1/3] Installing dependencies...
call npm install
if errorlevel 1 goto :fail

echo [2/3] Building app + Windows installer...
call npm run installer:windows
if errorlevel 1 goto :fail

echo [3/3] Done.
echo Installer output is in .\release\
exit /b 0

:fail
echo Build failed. See output above.
exit /b 1
