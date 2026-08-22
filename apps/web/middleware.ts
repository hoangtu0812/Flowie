import { NextResponse, type NextRequest } from 'next/server';

const publicPaths = ['/auth/login', '/auth/register'];

export function middleware(request: NextRequest) {
   const { pathname } = request.nextUrl;
   const hasSession = Boolean(request.cookies.get('flowie_access')?.value);

   if (publicPaths.includes(pathname)) {
      if (!hasSession) return NextResponse.next();
      return NextResponse.redirect(new URL('/lndev-ui/team/CORE/all', request.url));
   }

   if (!hasSession) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
   }

   return NextResponse.next();
}

export const config = {
   matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
