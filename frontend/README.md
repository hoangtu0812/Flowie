# Flowie Frontend (Next.js)

Giao diện web cho Flowie, dùng App Router + TypeScript. Gọi backend Go qua
REST và dùng session cookie (httpOnly) do luồng Azure AD SSO cấp.

## Chạy dev

```bash
cp .env.local.example .env.local   # trỏ NEXT_PUBLIC_API_BASE tới backend
npm install
npm run dev                        # http://localhost:3000
```

Backend phải chạy ở `http://localhost:8080` (xem `../backend`). Đăng nhập cần
Azure AD được cấu hình ở backend (xem `../docs/azure-sharepoint-setup.md`).

## Cấu trúc

```
src/
├── app/
│   ├── page.tsx                  # Login + danh sách workspace
│   ├── workspaces/[id]/page.tsx  # Danh sách + tạo project
│   └── projects/[id]/page.tsx    # Kanban board của task
├── components/TopBar.tsx
└── lib/api.ts                    # API client (credentials: include)
```

## Phiên bản & bảo mật

- Next.js 16 + React 19 (bản mới nhất tại thời điểm scaffold).
- `npm audit` còn 2 cảnh báo transitive từ `next`: `postcss` và `sharp`
  (CVE 2026 mới, chưa có bản vá trong Next mới nhất). Đây là dep build-time /
  image-optimization; `audit fix --force` sẽ downgrade Next và tái xuất hiện
  các CVE nặng hơn, nên **không** chạy nó. Theo dõi bản Next mới để nâng cấp.
