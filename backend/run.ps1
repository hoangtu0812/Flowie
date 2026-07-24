# Flowie backend dev runner (Windows / PowerShell alternative to "make run").
# Loads env vars from ..\.env then runs the API server (auto-migrates on boot).
#
# Usage:  .\run.ps1            run the server
#         .\run.ps1 build      build bin\api.exe
#         .\run.ps1 devtoken   print a dev session token

param([string]$cmd = "run")

$envFile = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $idx = $line.IndexOf("=")
            $key = $line.Substring(0, $idx).Trim()
            $val = $line.Substring($idx + 1).Trim()
            [Environment]::SetEnvironmentVariable($key, $val, "Process")
        }
    }
    Write-Host "Loaded env from $envFile" -ForegroundColor DarkGray
} else {
    Write-Host "WARNING: ..\.env not found - copy .env.example to .env first" -ForegroundColor Yellow
}

Set-Location $PSScriptRoot
switch ($cmd) {
    "run"      { go run ./cmd/api }
    "devtoken" { go run ./cmd/devtoken @args }
    "build"    { go build -o bin/api.exe ./cmd/api; Write-Host "built bin/api.exe" }
    default    { Write-Host "unknown command: $cmd" }
}
