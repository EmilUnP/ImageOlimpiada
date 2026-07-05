@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo   Vision AI - Start Frontend + Backend
echo ========================================
echo.
echo   Frontend: http://localhost:8080
echo   Backend:  http://localhost:3001
echo.
echo   Press Ctrl+C to stop, or run stop.bat
echo ========================================
echo.

if not exist "package.json" (
    echo [ERROR] package.json not found. Run this file from the project folder.
    pause
    exit /b 1
)

call npm run dev

endlocal
