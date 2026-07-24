"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Icon from "@/components/Icon";

export default function LoginPage() {
  const router = useRouter();

  // Nếu đã đăng nhập thì chuyển thẳng vào dashboard.
  useEffect(() => {
    api.me().then(() => router.replace("/")).catch(() => {});
  }, [router]);

  return (
    <div className="min-h-screen grid place-items-center bg-background px-md">
      <div className="w-full max-w-sm card shadow-modal p-xl text-center">
        <div className="w-14 h-14 rounded-xl bg-primary text-on-primary flex items-center justify-center text-headline-xl mx-auto mb-md">
          F
        </div>
        <h1 className="text-headline-lg text-on-surface">Flowie</h1>
        <p className="text-body-md text-on-surface-variant mt-1 mb-lg">
          Nền tảng quản lý dự án doanh nghiệp
        </p>
        <a href={api.loginUrl()} className="block">
          <button className="btn-primary w-full py-2.5">
            <Icon name="login" size={20} />
            Đăng nhập với Microsoft
          </button>
        </a>
        <p className="text-body-sm text-on-surface-variant/70 mt-md">
          Xác thực an toàn qua Azure Active Directory
        </p>
      </div>
    </div>
  );
}
