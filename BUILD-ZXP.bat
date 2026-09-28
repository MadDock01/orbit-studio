@echo off
REM ============================================================
REM  Orbit Studio 2.6.0 - one-click release build
REM
REM  Runs scripts\build-release.ps1 with every path filled in:
REM    - jsxbin compiler : tools\node_modules\jsxbin\...\esdcorelibinterface.node
REM    - signer          : tools\ZXPSignCmd.exe
REM    - certificate     : tools\certs\compx-selfsigned.p12
REM    - password        : the DEFAULT_PASSWORD already in tools\build-zxp.js
REM
REM  Output lands in  dist\CompX-Orbit-Studio-v2.6.0\  and
REM                   dist\CompX-Orbit-Studio-v2.6.0.zxp
REM
REM  Just double-click this file.
REM ============================================================

cd /d "%~dp0"
echo.
echo   Orbit Studio - building release 2.6.0
echo   Folder: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Node.js was not found on PATH. Install Node, then run this again.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-release.ps1" ^
  -ExpectedVersion "2.6.0" ^
  -JsxbinCompiler "%~dp0tools\node_modules\jsxbin\esdebugger-core\win\x64\esdcorelibinterface.node" ^
  -ZxpSignCmd "%~dp0tools\ZXPSignCmd.exe" ^
  -Certificate "%~dp0tools\certs\compx-selfsigned.p12" ^
  -CertificatePassword "compx-orbit-sign-2026" ^
  -SkipValidation

echo.
if errorlevel 1 (
  echo   [X] Build failed - the error is above.
) else (
  echo   [OK] Done. Look in the dist folder for CompX-Orbit-Studio-v2.6.0.zxp
)
echo.
pause
