[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
   throw 'Docker Desktop is required. Start Docker Desktop, then run this script again.'
}

Write-Host 'Starting Flowie from existing local images (no build, pull, or package install)...' -ForegroundColor Cyan
& docker compose --profile app up -d --no-build --pull never
if ($LASTEXITCODE -ne 0) {
   throw @"
Flowie could not start from local images.
If the source or dependencies changed, switch to 5G and rebuild intentionally with:
  pnpm docker:build
Then run this script again.
"@
}

& docker compose ps

$apiReady = $false
for ($attempt = 1; $attempt -le 12; $attempt++) {
   try {
      $health = Invoke-WebRequest -UseBasicParsing 'http://localhost:4000/api/v1/health' -TimeoutSec 2
      if ($health.StatusCode -eq 200) {
         $apiReady = $true
         break
      }
   } catch {
      Start-Sleep -Seconds 2
   }
}

if ($apiReady) {
   Write-Host 'Flowie is ready:' -ForegroundColor Green
   Write-Host '  Web:    http://localhost:3000'
   Write-Host '  API:    http://localhost:4000/api/v1/health'
   Write-Host '  Swagger: http://localhost:4000/api/docs'
} else {
   Write-Warning 'Containers started, but the API health check is not ready yet. Run: pnpm docker:logs'
}
