@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ========================================
echo   Vision AI - Stop Dev Servers
echo ========================================
echo.

set STOPPED=0

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
    echo Stopping backend on port 3001 ^(PID %%P^)...
    taskkill /F /PID %%P >nul 2>&1
    set STOPPED=1
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do (
    echo Stopping frontend on port 8080 ^(PID %%P^)...
    taskkill /F /PID %%P >nul 2>&1
    set STOPPED=1
)

if !STOPPED!==0 (
    echo No servers found on ports 3001 or 8080.
) else (
    echo.
    echo Done. Servers stopped.
)

echo.
pause
endlocal
