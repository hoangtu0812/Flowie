import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: { root: __dirname },
  // Badge dev-tools của Next mặc định nằm góc dưới TRÁI, đúng chỗ nút thu gọn
  // của SideNav (x=8, y=đáy) nên nuốt mất click khi chạy dev.
  devIndicators: { position: "bottom-right" },
  // Gói server + đúng những dependency thực sự dùng vào .next/standalone, để
  // image Docker không phải mang theo cả node_modules. Không ảnh hưởng `next
  // dev` / `next start` khi chạy trên host.
  output: "standalone",
  env: {
    NEXT_PUBLIC_API_BASE:
      process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080",
  },
};

export default nextConfig;
