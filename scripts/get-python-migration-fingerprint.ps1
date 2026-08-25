[CmdletBinding()]
param(
   [string]$SchemaPath = 'packages/database/prisma/schema.prisma',
   [string]$MigrationsPath = 'packages/database/prisma/migrations'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $SchemaPath -PathType Leaf)) {
   throw "Prisma schema was not found: $SchemaPath"
}
if (-not (Test-Path -LiteralPath $MigrationsPath -PathType Container)) {
   throw "Prisma migrations directory was not found: $MigrationsPath"
}

$migrationFiles = Get-ChildItem -LiteralPath $MigrationsPath -Recurse -File -Filter 'migration.sql' |
   Sort-Object FullName

$migrationEntries = foreach ($migration in $migrationFiles) {
   $relativePath = [IO.Path]::GetRelativePath((Resolve-Path -LiteralPath $MigrationsPath), $migration.FullName)
   [ordered]@{
      path = $relativePath.Replace('\', '/')
      sha256 = (Get-FileHash -LiteralPath $migration.FullName -Algorithm SHA256).Hash
   }
}

$migrationManifest = $migrationEntries |
   ForEach-Object { "$($_.path) $($_.sha256)" }
$migrationBytes = [Text.Encoding]::UTF8.GetBytes(($migrationManifest -join "`n"))
$migrationHash = [Security.Cryptography.SHA256]::HashData($migrationBytes)

[ordered]@{
   schema = [ordered]@{
      path = $SchemaPath.Replace('\', '/')
      sha256 = (Get-FileHash -LiteralPath $SchemaPath -Algorithm SHA256).Hash
   }
   migrations = [ordered]@{
      count = @($migrationEntries).Count
      manifestSha256 = [Convert]::ToHexString($migrationHash)
      entries = @($migrationEntries)
   }
} | ConvertTo-Json -Depth 4
