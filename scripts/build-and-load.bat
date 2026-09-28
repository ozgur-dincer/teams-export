@echo off
setlocal

set "ROOT_DIR=%~dp0.."
pushd "%ROOT_DIR%"
set "ROOT_DIR=%CD%"
set "EXTENSION_DIR=%ROOT_DIR%\extension-dist"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm ci || goto :error
)

node scripts\bundle.mjs || goto :error
node scripts\build-extension.mjs >nul || goto :error

popd

echo Build complete: %EXTENSION_DIR%
echo.
powershell -NoProfile -Command ^
    "Write-Host '- Open ' -NoNewline; Write-Host 'Manage Extensions' -NoNewline -ForegroundColor Green; Write-Host ' page in chrome';" ^
    "Write-Host '- To install, use ' -NoNewline; Write-Host 'Load unpacked' -NoNewline -ForegroundColor Green; Write-Host ' from ' -NoNewline; Write-Host '%EXTENSION_DIR%' -ForegroundColor Green;" ^
    "Write-Host '- To update, hit the ' -NoNewline; Write-Host 'Reload' -NoNewline -ForegroundColor Green; Write-Host ' button'; Write-Host"

pause
exit /b 0

:error
echo Build failed.
pause
exit /b 1
