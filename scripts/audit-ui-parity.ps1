[CmdletBinding()]
param(
   [Parameter(Mandatory)]
   [string]$BaselineRoot,

   [Parameter(Mandatory)]
   [string]$CurrentRoot,

   [ValidateSet('Markdown', 'Json')]
   [string]$Format = 'Markdown',

   [switch]$SummaryOnly,

   [string[]]$AllowedChanged = @(
      'app/auth/**',
      'app/admin/**',
      'components/layout/app-sidebar.tsx'
   )
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$baselinePath = (Resolve-Path -LiteralPath $BaselineRoot -ErrorAction Stop).Path
$currentPath = (Resolve-Path -LiteralPath $CurrentRoot -ErrorAction Stop).Path
$areas = @('app', 'components', 'hooks', 'lib', 'store', 'public')

function Convert-ToForwardSlash([string]$Path) {
   return $Path.Replace('\', '/')
}

function Test-AllowedPath([string]$RelativePath) {
   $normalizedPath = Convert-ToForwardSlash $RelativePath
   foreach ($pattern in $AllowedChanged) {
      $normalizedPattern = Convert-ToForwardSlash $pattern
      if ([Management.Automation.WildcardPattern]::new(
            $normalizedPattern,
            [Management.Automation.WildcardOptions]::IgnoreCase
         ).IsMatch($normalizedPath)) {
         return $true
      }
   }
   return $false
}

function Get-RelativeFileMap([string]$Root) {
   $map = @{}
   $normalizedRoot = $Root.TrimEnd('\', '/')
   foreach ($area in $areas) {
      $areaPath = Join-Path $Root $area
      if (-not (Test-Path -LiteralPath $areaPath -PathType Container)) {
         continue
      }
      Get-ChildItem -LiteralPath $areaPath -Recurse -File | ForEach-Object {
         if (-not $_.FullName.StartsWith($normalizedRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw "File '$($_.FullName)' is outside root '$normalizedRoot'."
         }
         $relative = Convert-ToForwardSlash ($_.FullName.Substring($normalizedRoot.Length) -replace '^[\\/]+', '')
         $map[$relative] = $_.FullName
      }
   }
   return $map
}

$baselineFiles = Get-RelativeFileMap $baselinePath
$currentFiles = Get-RelativeFileMap $currentPath
$results = [System.Collections.Generic.List[object]]::new()

foreach ($relativePath in ($baselineFiles.Keys | Sort-Object)) {
   $baselineFile = $baselineFiles[$relativePath]
   if (-not $currentFiles.ContainsKey($relativePath)) {
      $status = if (Test-AllowedPath $relativePath) { 'ALLOWED' } else { 'MISSING' }
      $results.Add([pscustomobject]@{ status = $status; path = $relativePath })
      continue
   }

   $sameContent = (Get-FileHash -LiteralPath $baselineFile -Algorithm SHA256).Hash -eq
      (Get-FileHash -LiteralPath $currentFiles[$relativePath] -Algorithm SHA256).Hash
   if ($sameContent) {
      $results.Add([pscustomobject]@{ status = 'IDENTICAL'; path = $relativePath })
      continue
   }
   $status = if (Test-AllowedPath $relativePath) { 'ALLOWED' } else { 'CHANGED' }
   $results.Add([pscustomobject]@{ status = $status; path = $relativePath })
}

foreach ($relativePath in ($currentFiles.Keys | Sort-Object)) {
   if ($baselineFiles.ContainsKey($relativePath)) {
      continue
   }
   $status = if (Test-AllowedPath $relativePath) { 'ALLOWED' } else { 'EXTRA' }
   $results.Add([pscustomobject]@{ status = $status; path = $relativePath })
}

$summary = [ordered]@{
   baselineRoot = $baselinePath
   currentRoot = $currentPath
   files = $results.Count
   identical = @($results | Where-Object status -eq 'IDENTICAL').Count
   allowed = @($results | Where-Object status -eq 'ALLOWED').Count
   changed = @($results | Where-Object status -eq 'CHANGED').Count
   missing = @($results | Where-Object status -eq 'MISSING').Count
   extra = @($results | Where-Object status -eq 'EXTRA').Count
}

if ($Format -eq 'Json') {
   [ordered]@{
      summary = $summary
      results = if ($SummaryOnly) { @() } else { @($results | Sort-Object status, path) }
   } | ConvertTo-Json -Depth 4
   return
}

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add('# Circle UI parity audit')
$lines.Add('')
$lines.Add(('- Baseline: `{0}`' -f $summary.baselineRoot))
$lines.Add(('- Current: `{0}`' -f $summary.currentRoot))
$lines.Add("- Files compared: $($summary.files)")
$lines.Add('')
$lines.Add('| Status | Count |')
$lines.Add('| --- | ---: |')
foreach ($status in @('IDENTICAL', 'ALLOWED', 'CHANGED', 'MISSING', 'EXTRA')) {
   $count = @($results | Where-Object status -eq $status).Count
   $lines.Add("| $status | $count |")
}

if (-not $SummaryOnly) {
   foreach ($status in @('CHANGED', 'MISSING', 'EXTRA', 'ALLOWED')) {
      $matches = @($results | Where-Object status -eq $status | Sort-Object path)
      if ($matches.Count -eq 0) {
         continue
      }
      $lines.Add('')
      $lines.Add("## $status")
      foreach ($entry in $matches) {
         $lines.Add(('- `{0}`' -f $entry.path))
      }
   }
}

$lines -join "`n"
