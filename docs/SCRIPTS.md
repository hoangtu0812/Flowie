# Script & lệnh chạy dự án

Tài liệu mô tả mọi script dùng để chạy Flowie ở môi trường dev.

Điểm vào chính là **`dev.ps1`** ở thư mục gốc. Các script còn lại
(`backend/run.ps1`, `backend/Makefile`, `cmd/devtoken`) vẫn giữ nguyên và dùng
được, nhưng ở mức thấp hơn — `dev.ps1` gói chúng lại thành một lệnh.

---

## Chọn nhanh

| Muốn gì | Chạy |
|---|---|
| Code hằng ngày, không cần Azure | `.\dev.ps1` |
| Kiểm thử luồng SSO thật | `.\dev.ps1 -Mode azure` |
| Chạy giống production, mọi thứ trong container | `.\dev.ps1 -Docker` |
| Chỉ cần DB để chạy test | `.\dev.ps1 -DbOnly` |
| Làm sạch dữ liệu bẩn | `.\dev.ps1 -ResetData` |
| Dựng lại DB từ số 0 | `.\dev.ps1 -Reset` |
| Dừng hết | `.\dev.ps1 -Stop` |

---

## `dev.ps1` — điểm vào chính

Dựng Postgres (Docker) + backend (Go) + frontend (Next.js), rồi in ra link đăng
nhập. Chạy ở thư mục gốc repo.

```powershell
.\dev.ps1 [-Mode mock|azure] [-Docker] [-Rebuild] [-Reset] [-ResetData]
          [-Force] [-DbPort <int>] [-DbOnly] [-NoBackend] [-NoFrontend]
          [-AdminEmail <string>] [-AdminName <string>] [-Stop]
```

Script có comment-based help, nên xem trực tiếp cũng được:

```powershell
Get-Help .\dev.ps1 -Detailed
```

### Hai chế độ xác thực

| `-Mode` | Hành vi |
|---|---|
| `mock` *(mặc định)* | **Xoá sạch** các biến `AZURE_AD_*` trong process env. Backend thấy rỗng → `h.Azure == nil` → route `/auth/azure/login` trả **503**. Không thể vô tình gọi ra tenant thật. Đăng nhập bằng "admin ảo" qua `/api/v1/auth/dev-login`. |
| `azure` | Dùng nguyên cấu hình Azure AD trong `.env`. Script kiểm tra đủ 4 biến `TENANT_ID` / `CLIENT_ID` / `CLIENT_SECRET` / `REDIRECT_URL` trước khi chạy, thiếu thì dừng ngay thay vì để lỗi lúc bấm đăng nhập. |

**Admin ảo hoạt động thế nào.** `handlers.DevLogin` chỉ cấp quyền system admin
khi email nằm trong `SYSTEM_ADMIN_EMAILS`. Script tự thêm `-AdminEmail` vào
biến đó, sau đó gọi `dev-login` một lần để tạo user. Link in ra cuối màn hình
có `&redirect=1` — mở trong trình duyệt sẽ set cookie phiên rồi chuyển về
frontend.

Endpoint `dev-login` tự trả 404 khi `APP_ENV != development`, nên không phải là
cửa hậu ở production.

> **Lưu ý:** admin ảo vẫn phải qua 2FA nếu user đó đã bật. Đây là chủ ý —
> `dev-login` không được phép trở thành đường vòng qua MFA.

### Chạy ở đâu: host hay Docker

| | `-Docker` **không** có *(mặc định)* | `-Docker` |
|---|---|---|
| db | Docker | Docker |
| redis | không bật | Docker (backend chưa dùng đến) |
| backend | host, `go run ./cmd/api` | Docker |
| frontend | host, `npm run dev` | Docker |
| Sửa code | thấy ngay | **phải `-Rebuild`** |
| Cần trên máy | Go + Node | chỉ Docker |

Mặc định chạy host vì vòng lặp sửa–xem nhanh hơn hẳn. Dùng `-Docker` khi muốn
kiểm tra môi trường giống production, hoặc trên máy chưa cài Go/Node.

`-Docker` dùng `docker compose --profile full up -d --build`. Thêm `-Rebuild`
để bỏ cache và `--force-recreate`.

> **Bắt buộc `-Rebuild` khi đổi `APP_BASE_URL`.** `NEXT_PUBLIC_API_BASE` được
> Next nhúng thẳng vào bundle **lúc build**, không đọc lúc chạy. Đổi biến môi
> trường rồi restart container là vô ích.

### Hai lệnh xoá dữ liệu

| Cờ | Làm gì | Giữ lại |
|---|---|---|
| `-ResetData` | `TRUNCATE ... RESTART IDENTITY CASCADE` mọi bảng | schema + `schema_migrations` |
| `-Reset` | `docker compose down -v`, gỡ hẳn volume Postgres | không gì cả |

Cả hai đều hỏi xác nhận (gõ `yes`) trừ khi thêm `-Force`. Không dùng đồng thời
hai cờ — script sẽ báo lỗi.

Sau `-Reset`, migration chạy lại từ đầu khi backend khởi động: `db.Migrate`
đọc `internal/db/migrations/*.sql` theo thứ tự tên file, mỗi file một
transaction, ghi nhận vào bảng `schema_migrations`. **Không có target
`make migrate` riêng** — migration luôn tự áp dụng lúc boot.

### Cổng

`-DbPort` đổi cổng host map vào Postgres và **tự đồng bộ vào `DATABASE_URL`**.
Cần khi 5432 đã bị project khác chiếm:

```powershell
.\dev.ps1 -DbPort 5433
```

Script kiểm tra xung đột cổng trước khi gọi `docker compose`, vì lỗi gốc của
Docker (`Bind for 127.0.0.1:5432 failed`) khá tối nghĩa.

Trong chế độ `-Docker`, backend nối tới `db:5432` qua mạng nội bộ của compose,
nên `-DbPort` chỉ ảnh hưởng cổng nhìn từ host (ví dụ khi bạn muốn cắm DBeaver).

### Chạy từng phần

```powershell
.\dev.ps1 -DbOnly        # chỉ Postgres — hợp khi chạy test tích hợp
.\dev.ps1 -NoFrontend    # db + backend
.\dev.ps1 -NoBackend     # db + frontend
```

### Dừng

```powershell
.\dev.ps1 -Stop
```

Đọc `.dev.pids.json` rồi **giết cả cây tiến trình, con trước cha**. Bắt buộc
phải vậy: cửa sổ mở ra là `powershell → go.exe → api.exe` (`go run` build ra
binary tạm trong `%TEMP%\go-build*\` rồi spawn nó). Chỉ giết cửa sổ ngoài cùng
sẽ để `api.exe` mồ côi giữ cổng 8080, lần chạy sau lỗi "address already in use".

Sau đó `docker compose --profile full stop` để hạ container.

---

## `backend/run.ps1`

Chạy riêng backend trên Windows. Nạp `..\.env` rồi gọi Go.

```powershell
cd backend
.\run.ps1              # go run ./cmd/api
.\run.ps1 build        # build bin\api.exe
.\run.ps1 devtoken     # in ra session token
```

Khác `dev.ps1`: không dựng Postgres, không tạo admin ảo, không đụng biến Azure.
Dùng khi DB đã chạy sẵn và chỉ muốn restart backend.

## `backend/Makefile`

Cho Linux/macOS. Tự `include ../.env`.

| Target | Việc |
|---|---|
| `make run` | chạy API (migration tự áp dụng lúc boot) |
| `make build` | build `./bin/api` |
| `make test` | `go test ./...` |
| `make tidy` | đồng bộ `go.mod` / `go.sum` |
| `make fmt` | `go fmt ./...` |
| `make vet` | `go vet ./...` |
| `make docker` | build image `flowie-backend` |

> Không có `make migrate`. README hiện còn ghi `make migrate && make run` —
> lệnh đó sẽ lỗi, chỉ cần `make run`.

## `backend/cmd/devtoken`

In ra session token hợp lệ để gọi API bằng `curl` / Postman mà không cần trình
duyệt. Từ chối chạy khi `APP_ENV=production`.

```bash
cd backend
go run ./cmd/devtoken -email you@example.com -name "Your Name"
```

Khác `dev-login`: `devtoken` in token ra terminal (hợp cho script), còn
`dev-login` set cookie trong trình duyệt (hợp cho dùng UI). `devtoken` luôn
cấp system admin; `dev-login` thì phụ thuộc `SYSTEM_ADMIN_EMAILS`.

## Script frontend (`frontend/package.json`)

| Lệnh | Việc |
|---|---|
| `npm run dev` | dev server, cổng 3000 |
| `npm run build` | production build |
| `npm start` | chạy bản đã build |
| `npm run lint` | `next lint` |
| `npm test` | unit test (`node --test tests/*.test.mjs`) |
| `npm run e2e` | Playwright |
| `npm run e2e:ui` | Playwright ở chế độ UI |

Ngoài ra có CLI của design system — xem `frontend/AGENTS.md`:

```bash
npx astryx build "<mô tả trang>"    # gợi ý template/block/component
npx astryx component <Tên>          # props + ví dụ
npx astryx docs <chủ đề>            # layout, tokens, styling…
```

## Gọi thẳng docker compose

```bash
docker compose up -d db                      # chỉ database
docker compose --profile full up -d --build  # tất cả
docker compose --profile full logs -f        # xem log
docker compose --profile full down           # hạ, giữ dữ liệu
docker compose down -v                       # hạ và XOÁ volume
```

Service `backend` và `frontend` nằm sau `profiles: ["full"]`, nên
`docker compose up` không kèm profile sẽ **chỉ** dựng `db` và `redis`.

---

## Biến môi trường liên quan

Chép `.env.example` thành `.env` trước khi chạy bất cứ thứ gì.

| Biến | Ghi chú |
|---|---|
| `APP_ENV` | phải là `development` thì `dev-login` mới sống |
| `APP_PORT`, `APP_BASE_URL` | cổng và URL gốc của API |
| `FRONTEND_URL` | dùng cho CORS — sai thì trình duyệt chặn mọi request |
| `DATABASE_URL` | `dev.ps1` tự sửa cổng theo `-DbPort` |
| `SESSION_SECRET` | tối thiểu 32 byte, thiếu thì backend từ chối khởi động |
| `SYSTEM_ADMIN_EMAILS` | phân tách bằng dấu phẩy; quyết định ai là system admin |
| `AZURE_AD_*` | chỉ dùng ở `-Mode azure`; bị xoá rỗng ở `mock` |
| `GRAPH_*`, `SHAREPOINT_*` | tích hợp SharePoint |

`SYSTEM_ADMIN_EMAILS` **không có** trong `.env.example` dù `config.Load()` có
đọc. Nếu tự viết `.env` từ đầu, nhớ thêm.

---

## Sự cố hay gặp

**`Bind for 127.0.0.1:5432 failed: port is already allocated`**
Một project khác đang giữ 5432. Xem thủ phạm rồi đổi cổng:

```powershell
docker ps --format "{{.Names}} | {{.Ports}}"
.\dev.ps1 -DbPort 5433
```

**Backend không lên, cổng 8080 bận**
Còn `api.exe` mồ côi từ lần chạy trước (thường do đóng cửa sổ bằng tay thay vì
`-Stop`):

```powershell
Get-CimInstance Win32_Process -Filter "Name='api.exe'" | Select-Object ProcessId, CommandLine
```

**Sửa code frontend mà Docker không đổi**
Đúng như thiết kế — container chạy bản đã build. Dùng `.\dev.ps1 -Docker -Rebuild`,
hoặc chuyển sang chế độ host để có hot reload.

**Đăng nhập được nhưng không thấy Admin Panel**
Email đăng nhập không nằm trong `SYSTEM_ADMIN_EMAILS`. Ở chế độ `mock`,
`dev.ps1` tự thêm `-AdminEmail`; nếu bạn đăng nhập bằng email khác thì phải tự
thêm vào `.env`.

**Sửa `dev.ps1` xong bị lỗi parse, chữ tiếng Việt thành ký tự lạ**
Windows PowerShell 5.1 đọc file `.ps1` theo ANSI nếu **không có BOM**. Phải lưu
UTF-8 **có BOM**:

```powershell
$p = ".\dev.ps1"
$c = [System.IO.File]::ReadAllText($p, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($p, $c, [System.Text.UTF8Encoding]::new($true))
```

**Viết thêm bước dùng native command trong `dev.ps1`**
Kiểm tra `$LASTEXITCODE`, **đừng dùng `$?`**. `docker compose` ghi tiến trình ra
stderr ngay cả khi thành công, và PowerShell 5.1 đặt `$? = $false` khi stderr
của native command bị bắt — sẽ báo lỗi giả dù container đã chạy.
