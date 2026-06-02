# Alib CRM - build single exe (backend + frontend)
# Usage: .\build.ps1
# Output: backend\crm-server.exe

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "=== 1/2  Building frontend ===" -ForegroundColor Cyan
Set-Location "$root\frontend"

$lockFile    = "$root\frontend\package-lock.json"
$installedMark = "$root\frontend\node_modules\.package-lock.json"
if (-not (Test-Path $installedMark) -or
    (Get-Item $lockFile).LastWriteTime -gt (Get-Item $installedMark).LastWriteTime) {
    Write-Host "  Installing npm dependencies..." -ForegroundColor DarkCyan
    npm ci --silent
} else {
    Write-Host "  npm deps up-to-date, skipping install" -ForegroundColor DarkGray
}

npm run build
Write-Host "Frontend built -> backend\cmd\server\dist\" -ForegroundColor Green

Write-Host "=== 2/2  Compiling binary ===" -ForegroundColor Cyan
Set-Location "$root\backend"
go build -tags embed -o crm-server.exe .\cmd\server
Write-Host "Done: backend\crm-server.exe" -ForegroundColor Green

Remove-Item "$root\backend\cmd\server\dist" -Recurse -Force

Set-Location $root
Write-Host ""
Write-Host "Run: cd backend && .\crm-server.exe" -ForegroundColor Yellow
