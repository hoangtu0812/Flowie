<#
.SYNOPSIS
    Flowie — dev environment runner (Windows / PowerShell).

.DESCRIPTION
    Khởi động toàn bộ môi trường dev: Postgres (docker) + backend Go + frontend Next.js.

    Hai chế độ xác thực:
      mock  (mặc định) — tắt Azure AD, đăng nhập bằng "admin ảo" qua endpoint
                         /api/v1/auth/dev-login. Không gọi ra tenant thật.
      azure            — dùng nguyên cấu hình Azure AD trong .env (SSO thật).

.PARAMETER Mode
    'mock' (admin ảo, mặc định) hoặc 'azure' (SSO thật).

.PARAMETER Reset
    XOÁ SẠCH database: gỡ volume Postgres rồi tạo lại. Migration chạy lại từ đầu.

.PARAMETER ResetData
    Giữ schema, TRUNCATE toàn bộ bảng nghiệp vụ (trừ schema_migrations).

.PARAMETER Force
    Bỏ qua bước xác nhận cho -Reset / -ResetData.

.PARAMETER DbPort
    Cổng host map vào Postgres. Mặc định lấy POSTGRES_PORT trong .env (5432).
    Dùng khi 5432 đã bị project khác chiếm — script tự đồng bộ cổng vào DATABASE_URL.

.PARAMETER DbOnly
    Chỉ dựng Postgres, không chạy backend/frontend.

.PARAMETER NoBackend
    Không chạy backend.

.PARAMETER NoFrontend
    Không chạy frontend.

.PARAMETER AdminEmail
    Email của admin ảo (chỉ dùng ở -Mode mock). Mặc định admin@flowie.local.

.PARAMETER AdminName
    Tên hiển thị của admin ảo.

.PARAMETER Stop
    Dừng backend/frontend đã bật bởi script và stop container db.

.EXAMPLE
    .\dev.ps1
    Dev với admin ảo (không đụng Azure).

.EXAMPLE
    .\dev.ps1 -Mode azure
    Dev với Azure AD thật như cấu hình .env hiện tại.

.EXAMPLE
    .\dev.ps1 -Reset -Force
    Xoá sạch DB rồi khởi động lại với admin ảo.
#>
[CmdletBinding()]
param(
    [ValidateSet('mock', 'azure')]
    [string]$Mode = 'mock',

    [switch]$Reset,
    [switch]$ResetData,
    [switch]$Force,

    [int]$DbPort = 0,

    [switch]$DbOnly,
    [switch]$NoBackend,
    [switch]$NoFrontend,
    [switch]$Stop,

    [string]$AdminEmail = 'admin@flowie.local',
    [string]$AdminName = 'Admin Ao'
)

# 'Continue' (không phải 'Stop'): script gọi nhiều native command (docker, go,
# npm) hay ghi ra stderr khi vẫn thành công. Mọi bước quan trọng kiểm tra
# $LASTEXITCODE tường minh — không dùng $?, vì PowerShell 5.1 đặt $? = $false
# khi stderr của native command bị bắt, kể cả lúc lệnh trả về 0.
$ErrorActionPreference = 'Continue'

$RepoRoot    = $PSScriptRoot
$BackendDir  = Join-Path $RepoRoot 'backend'
$FrontendDir = Join-Path $RepoRoot 'frontend'
$EnvFile     = Join-Path $RepoRoot '.env'
$PidFile     = Join-Path $RepoRoot '.dev.pids.json'

# ── Console helpers ──────────────────────────────────────────
function Write-Step { param([string]$m) Write-Host "`n▶ $m" -ForegroundColor Cyan }
function Write-Ok   { param([string]$m) Write-Host "  ✓ $m" -ForegroundColor Green }
function Write-Note { param([string]$m) Write-Host "  · $m" -ForegroundColor DarkGray }
function Write-Warn { param([string]$m) Write-Host "  ! $m" -ForegroundColor Yellow }
function Fail       { param([string]$m) Write-Host "`n✗ $m" -ForegroundColor Red; exit 1 }

# ── Nạp .env vào process environment ─────────────────────────
function Import-DotEnv {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        Fail ".env không tồn tại. Chạy: Copy-Item .env.example .env  rồi điền cấu hình."
    }
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
            $idx = $line.IndexOf('=')
            $key = $line.Substring(0, $idx).Trim()
            $val = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
            [Environment]::SetEnvironmentVariable($key, $val, 'Process')
        }
    }
    Write-Ok "Đã nạp env từ .env"
}

function Get-EnvOr {
    param([string]$Key, [string]$Default)
    $v = [Environment]::GetEnvironmentVariable($Key, 'Process')
    if ([string]::IsNullOrWhiteSpace($v)) { return $Default }
    return $v
}

# ── Dừng môi trường ──────────────────────────────────────────

# Giết cả cây tiến trình, con trước cha. Bắt buộc phải vậy: cửa sổ ta mở ra là
# powershell -> go.exe -> api.exe (go run build ra binary tạm trong %TEMP% rồi
# spawn nó). Chỉ Stop-Process cửa sổ ngoài cùng sẽ để api.exe mồ côi và tiếp
# tục giữ cổng 8080, lần chạy sau sẽ lỗi "address already in use".
function Stop-ProcessTree {
    param([int]$ProcId)
    $count = 0
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcId" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        $count += Stop-ProcessTree -ProcId $child.ProcessId
    }
    try {
        Stop-Process -Id $ProcId -Force -ErrorAction Stop
        $count++
    } catch {
        # đã thoát trước đó
    }
    return $count
}

function Stop-DevEnv {
    Write-Step 'Dừng môi trường dev'
    if (Test-Path $PidFile) {
        $saved = Get-Content $PidFile -Raw | ConvertFrom-Json
        foreach ($entry in $saved) {
            $alive = Get-Process -Id $entry.Pid -ErrorAction SilentlyContinue
            if ($null -eq $alive) {
                Write-Note "$($entry.Name) (PID $($entry.Pid)) không còn chạy"
                continue
            }
            $killed = Stop-ProcessTree -ProcId $entry.Pid
            Write-Ok "Đã dừng $($entry.Name) — $killed tiến trình (gồm cả con)"
        }
        Remove-Item $PidFile -Force
    } else {
        Write-Note 'Không có tiến trình nào do script này khởi động'
    }
    docker compose -f (Join-Path $RepoRoot 'docker-compose.yml') stop db
    if ($LASTEXITCODE -eq 0) { Write-Ok 'Đã stop container db' }
    exit 0
}

if ($Stop) { Stop-DevEnv }

# ── Kiểm tra công cụ ─────────────────────────────────────────
function Assert-Command {
    param([string]$Name, [string]$Hint)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $cmd) { Fail "Thiếu '$Name'. $Hint" }
}

Write-Host ''
Write-Host '  Flowie — dev environment' -ForegroundColor White
Write-Host '  ────────────────────────' -ForegroundColor DarkGray

Write-Step 'Kiểm tra công cụ'
Assert-Command 'docker' 'Cài Docker Desktop.'
if (-not $NoBackend -and -not $DbOnly)  { Assert-Command 'go' 'Cài Go 1.22+.' }
if (-not $NoFrontend -and -not $DbOnly) { Assert-Command 'npm' 'Cài Node.js 20+.' }
Write-Ok 'Đủ công cụ'

Write-Step 'Nạp cấu hình'
Import-DotEnv -Path $EnvFile

# ── Áp cấu hình theo Mode ────────────────────────────────────
[Environment]::SetEnvironmentVariable('APP_ENV', 'development', 'Process')

if ($Mode -eq 'mock') {
    # Xoá sạch Azure vars => handlers.Azure == nil => route SSO trả 503.
    # Đảm bảo dev không vô tình gọi ra tenant thật.
    foreach ($k in @('AZURE_AD_TENANT_ID', 'AZURE_AD_CLIENT_ID', 'AZURE_AD_CLIENT_SECRET', 'AZURE_AD_REDIRECT_URL')) {
        [Environment]::SetEnvironmentVariable($k, '', 'Process')
    }
    # Admin ảo phải nằm trong SYSTEM_ADMIN_EMAILS thì dev-login mới cấp quyền
    # system admin (xem handlers.DevLogin).
    $admins = Get-EnvOr 'SYSTEM_ADMIN_EMAILS' ''
    if ($admins -notmatch [regex]::Escape($AdminEmail)) {
        if ([string]::IsNullOrWhiteSpace($admins)) {
            $admins = $AdminEmail
        } else {
            $admins = "$admins,$AdminEmail"
        }
    }
    [Environment]::SetEnvironmentVariable('SYSTEM_ADMIN_EMAILS', $admins, 'Process')
    Write-Ok "Chế độ MOCK — Azure AD tắt, admin ảo: $AdminEmail"
} else {
    $tenant = Get-EnvOr 'AZURE_AD_TENANT_ID' ''
    $client = Get-EnvOr 'AZURE_AD_CLIENT_ID' ''
    $secret = Get-EnvOr 'AZURE_AD_CLIENT_SECRET' ''
    $redir  = Get-EnvOr 'AZURE_AD_REDIRECT_URL' ''
    if (-not $tenant -or -not $client -or -not $secret -or -not $redir) {
        Fail 'Chế độ azure cần đủ AZURE_AD_TENANT_ID / CLIENT_ID / CLIENT_SECRET / REDIRECT_URL trong .env'
    }
    Write-Ok "Chế độ AZURE — SSO thật (tenant $($tenant.Substring(0, [Math]::Min(8, $tenant.Length)))…)"
}

# ── Cổng Postgres + đồng bộ vào DATABASE_URL ─────────────────
# docker-compose map "${POSTGRES_PORT:-5432}:5432". Backend chạy ở host nên
# DATABASE_URL phải trỏ đúng cổng đã map, nếu không sẽ nối nhầm sang DB khác.
if ($DbPort -eq 0) { $DbPort = [int](Get-EnvOr 'POSTGRES_PORT' '5432') }
[Environment]::SetEnvironmentVariable('POSTGRES_PORT', "$DbPort", 'Process')

$dbUrl = Get-EnvOr 'DATABASE_URL' ''
if ($dbUrl) {
    $syncedUrl = [regex]::Replace($dbUrl, '(@[^/:@]+):\d+/', "`${1}:$DbPort/")
    if ($syncedUrl -ne $dbUrl) {
        Write-Note "DATABASE_URL đổi cổng -> $DbPort"
    }
    [Environment]::SetEnvironmentVariable('DATABASE_URL', $syncedUrl, 'Process')
}

$AppPort     = Get-EnvOr 'APP_PORT' '8080'
$ApiBase     = Get-EnvOr 'APP_BASE_URL' "http://localhost:$AppPort"
$FrontendUrl = Get-EnvOr 'FRONTEND_URL' 'http://localhost:3000'
$PgUser      = Get-EnvOr 'POSTGRES_USER' 'flowie'
$PgDb        = Get-EnvOr 'POSTGRES_DB' 'flowie'
$ComposeFile = Join-Path $RepoRoot 'docker-compose.yml'

# ── Reset dữ liệu (nếu được yêu cầu) ─────────────────────────
function Confirm-Destructive {
    param([string]$Message)
    if ($Force) { return $true }
    Write-Warn $Message
    $answer = Read-Host '  Gõ "yes" để xác nhận'
    return ($answer -eq 'yes')
}

if ($Reset -and $ResetData) {
    Fail 'Chỉ dùng một trong hai: -Reset (xoá volume) hoặc -ResetData (truncate bảng).'
}

if ($Reset) {
    Write-Step 'Reset toàn bộ database'
    if (-not (Confirm-Destructive "XOÁ VĨNH VIỄN volume Postgres '$PgDb' — toàn bộ dữ liệu dev sẽ mất.")) {
        Fail 'Đã huỷ.'
    }
    docker compose -f $ComposeFile down -v
    if ($LASTEXITCODE -ne 0) { Fail 'docker compose down -v thất bại' }
    Write-Ok 'Đã gỡ volume — migration sẽ chạy lại từ đầu khi backend khởi động'
}

# ── Dựng Postgres ────────────────────────────────────────────
Write-Step 'Khởi động Postgres'

# Nếu cổng đã bị chiếm bởi thứ khác (project khác, Postgres cài trên máy) thì
# `docker compose up` báo lỗi khá tối nghĩa — kiểm tra trước để báo rõ ràng.
$dbAlreadyRunning = $false
$runningDb = docker ps --filter 'name=flowie-db' --filter 'status=running' --format '{{.Names}}'
if ($runningDb -match 'flowie-db') { $dbAlreadyRunning = $true }

if (-not $dbAlreadyRunning) {
    $listener = Get-NetTCPConnection -LocalPort $DbPort -State Listen -ErrorAction SilentlyContinue
    if ($null -ne $listener) {
        $holder = docker ps --format '{{.Names}} -> {{.Ports}}' | Select-String ":$DbPort->"
        Write-Warn "Cổng $DbPort đã bị chiếm."
        if ($holder) { Write-Note "Đang giữ cổng: $($holder.Line.Trim())" }
        Fail "Chọn cổng khác, ví dụ:  .\dev.ps1 -DbPort 5433"
    }
}

docker compose -f $ComposeFile up -d db
# Dùng $LASTEXITCODE chứ KHÔNG dùng $?: docker compose ghi tiến trình ra stderr
# ngay cả khi thành công, và PowerShell 5.1 đặt $? = $false khi stderr của native
# command bị bắt — sẽ báo lỗi giả dù container đã Started.
if ($LASTEXITCODE -ne 0) { Fail 'Không khởi động được container db' }

Write-Note 'Đợi Postgres sẵn sàng…'
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    docker compose -f $ComposeFile exec -T db pg_isready -U $PgUser -d $PgDb 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) { Fail 'Postgres không sẵn sàng sau 60s' }
Write-Ok "Postgres sẵn sàng (db=$PgDb, user=$PgUser)"

# ── Truncate dữ liệu (giữ schema) ────────────────────────────
if ($ResetData) {
    Write-Step 'Xoá dữ liệu nghiệp vụ (giữ schema)'
    if (-not (Confirm-Destructive "TRUNCATE toàn bộ bảng trong '$PgDb' (giữ lại schema_migrations).")) {
        Fail 'Đã huỷ.'
    }
    # Single-quoted here-string: PowerShell không nội suy $$ / $r của plpgsql.
    $truncateSql = @'
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
  LOOP
    EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', r.tablename);
  END LOOP;
END $$;
'@
    $truncateSql | docker compose -f $ComposeFile exec -T db psql -U $PgUser -d $PgDb -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) { Fail 'TRUNCATE thất bại' }
    Write-Ok 'Đã xoá sạch dữ liệu, schema giữ nguyên'
}

if ($DbOnly) {
    Write-Host ''
    Write-Ok 'Chỉ dựng DB theo yêu cầu (-DbOnly). Xong.'
    exit 0
}

# ── Khởi động backend ────────────────────────────────────────
$started = @()

if (-not $NoBackend) {
    Write-Step 'Khởi động backend (go run ./cmd/api)'
    $backendProc = Start-Process -FilePath 'powershell' -PassThru -ArgumentList @(
        '-NoExit', '-Command',
        "Set-Location '$BackendDir'; Write-Host 'Flowie backend — $Mode mode' -ForegroundColor Cyan; go run ./cmd/api"
    )
    $started += [pscustomobject]@{ Name = 'backend'; Pid = $backendProc.Id }
    Write-Ok "Backend đang khởi động (PID $($backendProc.Id))"

    Write-Note 'Đợi /healthz…'
    $healthy = $false
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri "$ApiBase/healthz" -UseBasicParsing -TimeoutSec 2
            if ($resp.StatusCode -eq 200) { $healthy = $true; break }
        } catch {
            # backend chưa lên — thử lại
        }
        Start-Sleep -Seconds 1
    }
    if ($healthy) {
        Write-Ok "Backend sẵn sàng tại $ApiBase (migration đã áp dụng)"
    } else {
        Write-Warn "Backend chưa trả lời /healthz sau 60s — xem cửa sổ backend để biết lỗi"
    }

    # ── Cấp admin ảo ─────────────────────────────────────────
    if ($Mode -eq 'mock' -and $healthy) {
        Write-Step 'Tạo admin ảo'
        $q = "email=$([uri]::EscapeDataString($AdminEmail))&name=$([uri]::EscapeDataString($AdminName))"
        try {
            $r = Invoke-WebRequest -Uri "$ApiBase/api/v1/auth/dev-login?$q" -UseBasicParsing -TimeoutSec 10
            $user = $r.Content | ConvertFrom-Json
            if ($user.mfaRequired) {
                Write-Warn "User $AdminEmail đã bật 2FA — cần mã TOTP khi đăng nhập"
            } else {
                Write-Ok "Đã provision $AdminEmail (system admin)"
            }
        } catch {
            Write-Warn "Không provision được admin ảo: $($_.Exception.Message)"
        }
    }
}

# ── Khởi động frontend ───────────────────────────────────────
if (-not $NoFrontend) {
    Write-Step 'Khởi động frontend (npm run dev)'
    if (-not (Test-Path (Join-Path $FrontendDir 'node_modules'))) {
        Write-Note 'Chưa có node_modules — chạy npm install…'
        Push-Location $FrontendDir
        npm install
        Pop-Location
    }
    $frontendProc = Start-Process -FilePath 'powershell' -PassThru -ArgumentList @(
        '-NoExit', '-Command',
        "Set-Location '$FrontendDir'; Write-Host 'Flowie frontend' -ForegroundColor Cyan; npm run dev"
    )
    $started += [pscustomobject]@{ Name = 'frontend'; Pid = $frontendProc.Id }
    Write-Ok "Frontend đang khởi động (PID $($frontendProc.Id))"
}

if ($started.Count -gt 0) {
    $started | ConvertTo-Json -Depth 3 | Out-File -FilePath $PidFile -Encoding utf8
}

# ── Tóm tắt ──────────────────────────────────────────────────
Write-Host ''
Write-Host '  ────────────────────────' -ForegroundColor DarkGray
Write-Host '  Môi trường dev đã sẵn sàng' -ForegroundColor White
Write-Host ''
Write-Host "  API       $ApiBase" -ForegroundColor Gray
Write-Host "  Frontend  $FrontendUrl" -ForegroundColor Gray

if ($Mode -eq 'mock') {
    $loginUrl = "$ApiBase/api/v1/auth/dev-login?email=$([uri]::EscapeDataString($AdminEmail))&name=$([uri]::EscapeDataString($AdminName))&redirect=1"
    Write-Host ''
    Write-Host '  Đăng nhập admin ảo — mở link này trong trình duyệt:' -ForegroundColor Yellow
    Write-Host "  $loginUrl" -ForegroundColor White
    Write-Host ''
    Write-Host '  (Link set cookie phiên rồi redirect về frontend.)' -ForegroundColor DarkGray
} else {
    Write-Host ''
    Write-Host "  Đăng nhập Azure AD: mở $FrontendUrl/login" -ForegroundColor Yellow
}

Write-Host ''
Write-Host '  Dừng tất cả:  .\dev.ps1 -Stop' -ForegroundColor DarkGray
Write-Host ''
