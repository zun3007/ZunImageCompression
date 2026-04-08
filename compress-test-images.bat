@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
  echo [compress] Installing dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

if not exist "Backend\.env" (
  copy /Y "Backend\.env.example" "Backend\.env" >nul
)

echo [compress] Running automatic compression for images in "test"...
node "scripts\compress-test-images.mjs"
if errorlevel 1 goto :fail

echo.
echo [compress] Finished successfully.
echo [compress] Outputs: "%~dp0test\compressed"
pause
exit /b 0

:fail
echo.
echo [compress] Failed. Check ".runlogs" for details.
pause
exit /b 1
