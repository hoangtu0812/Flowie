[CmdletBinding()]
param(
   [switch]$AllowNetwork
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
   throw 'Docker Desktop is required. Start Docker Desktop, then run this script again.'
}

if (-not $AllowNetwork) {
   $networkRequiredMessage = @(
      'This script can download a missing base image and pinned Python packages on its first run.'
      'Connect to 5G, then run explicitly:'
      ''
      '  .\scripts\build-and-test.ps1 -AllowNetwork'
      ''
      'For normal internal-network starts after a successful build, use:'
      ''
      '  .\scripts\start-local.ps1'
   ) -join [Environment]::NewLine
   throw $networkRequiredMessage
}

Write-Host 'Building Flowie images. Network access is explicitly enabled for this run...' -ForegroundColor Cyan
& docker compose --profile app build migrate api web worker
if ($LASTEXITCODE -ne 0) {
   throw 'Docker build failed. Check the network or Docker output above; no offline start was attempted.'
}

Write-Host 'Applying migrations, then starting the newly built containers without pulling images...' -ForegroundColor Cyan
& docker compose --profile app up -d --no-build --pull never --force-recreate migrate api web worker
if ($LASTEXITCODE -ne 0) {
   throw 'Docker containers could not be started from the newly built images.'
}

function Wait-ForHttpOk {
   param(
      [Parameter(Mandatory = $true)][string]$Name,
      [Parameter(Mandatory = $true)][string]$Url
   )

   for ($attempt = 1; $attempt -le 20; $attempt++) {
      try {
         $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 3
         if ($response.StatusCode -eq 200) {
            Write-Host "  [ok] $Name - $Url" -ForegroundColor Green
            return
         }
      } catch {
         Start-Sleep -Seconds 2
      }
   }

   & docker compose logs --tail=80 migrate api web
   throw "Smoke test failed: $Name did not return HTTP 200."
}

Write-Host 'Running smoke tests...' -ForegroundColor Cyan
Wait-ForHttpOk -Name 'FastAPI readiness' -Url 'http://localhost:4000/readyz'
Wait-ForHttpOk -Name 'Legacy API through FastAPI facade' -Url 'http://localhost:4000/api/v1/health'
Wait-ForHttpOk -Name 'Flowie login page' -Url 'http://localhost:3000/auth/login'

& docker compose ps
$summary = @(
   ''
   'Build and smoke test completed.'
   'Normal internal-network start (no build, pull, or package install):'
   '  .\scripts\start-local.ps1'
) -join [Environment]::NewLine
Write-Host $summary -ForegroundColor Green
