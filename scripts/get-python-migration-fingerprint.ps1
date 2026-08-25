[CmdletBinding()]
param(
   [string]$SchemaPath = 'packages/database/prisma/schema.prisma',
   [string]$MigrationsPath = 'packages/database/prisma/migrations',
   [switch]$Detailed
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-RelativePathCompat {
   param(
      [Parameter(Mandatory)] [string]$Root,
      [Parameter(Mandatory)] [string]$Path
   )

   $normalizedRoot = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\', '/')
   $fullPath = (Resolve-Path -LiteralPath $Path).Path
   if (-not $fullPath.StartsWith($normalizedRoot, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Path '$fullPath' is outside root '$normalizedRoot'."
   }
   return ($fullPath.Substring($normalizedRoot.Length) -replace '^[\\/]+', '')
}

function ConvertTo-HexStringCompat {
   param([Parameter(Mandatory)] [byte[]]$Bytes)
   return ([BitConverter]::ToString($Bytes)).Replace('-', '')
}

if (-not (Test-Path -LiteralPath $SchemaPath -PathType Leaf)) {
   throw "Prisma schema was not found: $SchemaPath"
}
if (-not (Test-Path -LiteralPath $MigrationsPath -PathType Container)) {
   throw "Prisma migrations directory was not found: $MigrationsPath"
}

$migrationFiles = Get-ChildItem -LiteralPath $MigrationsPath -Recurse -File -Filter 'migration.sql' |
   Sort-Object FullName

$migrationEntries = foreach ($migration in $migrationFiles) {
   $relativePath = Get-RelativePathCompat -Root $MigrationsPath -Path $migration.FullName
   [ordered]@{
      path = $relativePath.Replace('\', '/')
      sha256 = (Get-FileHash -LiteralPath $migration.FullName -Algorithm SHA256).Hash
   }
}

$migrationManifest = $migrationEntries |
   ForEach-Object { "$($_.path) $($_.sha256)" }
$migrationBytes = [Text.Encoding]::UTF8.GetBytes(($migrationManifest -join "`n"))
$sha256 = [Security.Cryptography.SHA256]::Create()
try {
   $migrationHash = $sha256.ComputeHash($migrationBytes)
} finally {
   $sha256.Dispose()
}

$migrationSummary = [ordered]@{
   count = @($migrationEntries).Count
   manifestSha256 = ConvertTo-HexStringCompat $migrationHash
}
if ($Detailed) {
   $migrationSummary.entries = @($migrationEntries)
}

[ordered]@{
   schema = [ordered]@{
      path = $SchemaPath.Replace('\', '/')
      sha256 = (Get-FileHash -LiteralPath $SchemaPath -Algorithm SHA256).Hash
   }
   migrations = $migrationSummary
} | ConvertTo-Json -Depth 4
