"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();

  // Nếu đã đăng nhập thì chuyển thẳng vào dashboard.
  useEffect(() => {
    api.me().then(() => router.replace("/")).catch(() => {});
  }, [router]);

  return (
    <div className="min-h-screen flex w-full bg-white">
      {/* Left Column: Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 lg:p-24 relative">
        <div className="w-full max-w-sm mx-auto">
          {/* Header */}
          <div className="mb-10 text-center lg:text-left">
            <h1 className="text-[32px] font-bold text-gray-900 mb-2 tracking-tight">Đăng nhập</h1>
            <p className="text-gray-500 text-[15px]">Nền tảng quản lý dự án doanh nghiệp Flowie</p>
          </div>

          {/* Login Button */}
          <a href={api.loginUrl()} className="block w-full">
            <button className="w-full flex items-center justify-center gap-3 px-4 py-3.5 border border-gray-200 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Đăng nhập với Microsoft
            </button>
          </a>

          {/* Footer Note */}
          <p className="text-center text-gray-400 text-[13px] mt-8">
            Hệ thống chỉ hỗ trợ xác thực qua hệ sinh thái Azure Active Directory nội bộ.
          </p>
        </div>
      </div>

      {/* Right Column: Hero Image with Glassmorphism Cards */}
      <div className="hidden lg:flex w-1/2 relative bg-gray-100 overflow-hidden items-center justify-center p-12">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1497366216548-37526070297c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        
        {/* Floating Glass Cards to mimic the design */}
        <div className="relative z-10 w-full max-w-lg">
          <h2 className="text-white text-3xl font-bold mb-8">Tính năng nổi bật</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/70 backdrop-blur-md border border-white/20 p-6 rounded-2xl shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[13px] font-bold text-gray-700">Tổng công việc</span>
                <span className="text-gray-400">•••</span>
              </div>
              <div className="text-[32px] font-black text-gray-900">425</div>
              <div className="text-[12px] font-bold text-green-600 mt-1 flex items-center gap-1">
                ↗ +2.45%
              </div>
            </div>

            <div className="bg-white/70 backdrop-blur-md border border-white/20 p-6 rounded-2xl shadow-xl">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[13px] font-bold text-gray-700">Hoàn thành</span>
                <span className="text-gray-400">•••</span>
              </div>
              <div className="text-[32px] font-black text-gray-900">87</div>
              <div className="text-[12px] font-bold text-green-600 mt-1 flex items-center gap-1">
                ↗ +21%
              </div>
            </div>

            <div className="bg-white/70 backdrop-blur-md border border-white/20 p-6 rounded-2xl shadow-xl col-span-2 flex items-center justify-between">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[13px] font-bold text-gray-700">Tiến độ dự án</span>
                </div>
                <div className="text-[32px] font-black text-gray-900">72,550 <span className="text-sm font-medium text-gray-500">giờ</span></div>
              </div>
              <div className="w-16 h-16 rounded-full border-4 border-blue-600 border-r-gray-200 flex items-center justify-center text-sm font-bold text-blue-600">
                64%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
