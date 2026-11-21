$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Сначала установите Node.js 22 LTS: https://nodejs.org/' -ForegroundColor Yellow
  exit 1
}
Write-Host 'Устанавливаю зависимости Sona...' -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { throw 'Не удалось установить зависимости.' }
Write-Host 'Собираю установщик Windows...' -ForegroundColor Cyan
npm run dist:win
if ($LASTEXITCODE -ne 0) { throw 'Сборка установщика завершилась с ошибкой.' }
Write-Host 'Готово! Установщик находится в папке release.' -ForegroundColor Green
