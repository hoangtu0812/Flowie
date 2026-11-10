import { NextRequest, NextResponse } from 'next/server';

/**
 * A page request only needs a durable session cookie. The API validates the
 * JWT on protected operations and can rotate the short-lived access cookie
 * from the 30-day refresh cookie. Checking both here prevents a browser
 * refresh from sending a signed-in user back to login unnecessarily.
 *
 * This file deliberately does not alter any page route.
 *
 * VI: Request trang chỉ cần cookie phiên bền. API kiểm tra JWT ở thao tác được
 * bảo vệ và có thể làm mới cookie access ngắn hạn từ cookie refresh 30 ngày.
 * Kiểm tra cả hai ở đây tránh việc refresh trình duyệt đưa người đã đăng nhập
 * về trang login không cần thiết. File này cố ý không đổi route trang nào.
 */
export function middleware(request: NextRequest) {
   const { pathname, search } = request.nextUrl;
   // Public files are fetched before a user can have a session (for example
   // the manifest icon on the login page). Never turn those requests into the
   // login HTML document.
   if (
      pathname === '/flowie-icon.svg' ||
      pathname.startsWith('/images/') ||
      /\.(?:svg|png|jpe?g|gif|webp|ico)$/i.test(pathname)
   ) {
      return NextResponse.next();
   }
   if (pathname.startsWith('/auth/')) return NextResponse.next();

   const hasSession = request.cookies.has('flowie_access') || request.cookies.has('flowie_refresh');
   if (hasSession) return NextResponse.next();

   const login = request.nextUrl.clone();
   login.pathname = '/auth/login';
   login.searchParams.set('next', `${pathname}${search}`);
   return NextResponse.redirect(login);
}

export const config = {
   matcher: [
      '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|flowie-icon.svg).*)',
   ],
};
