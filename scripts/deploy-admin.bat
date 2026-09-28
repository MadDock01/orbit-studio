@echo off
setlocal
cd /d "%~dp0.."

net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c ""%~f0""' -Verb RunAs"
    exit /b
)

echo ========================================================
echo Updating CompX Orbit Studio in Program Files (x86)...
echo ========================================================

robocopy "%cd%" "C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\com.compxorbit.studio" /E /XD .git tests design-mockups tools node_modules /XF deploy-admin.bat *.tmp /NFL /NDL /NJH /NJS
robocopy "%cd%" "C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\CompX-Orbit-Studio" /E /XD .git tests design-mockups tools node_modules /XF deploy-admin.bat *.tmp /NFL /NDL /NJH /NJS

echo.
echo [SUCCESS] CompX Orbit Studio updated in Program Files (x86)!
echo Please close and reopen After Effects or reload the panel.
echo ========================================================
timeout /t 4
