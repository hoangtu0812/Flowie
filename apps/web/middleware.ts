import { NextResponse, type NextRequest } from 'next/server';

const publicPaths = ['/auth/login', '/auth/register', '/manifest.webmanifest', '/flowie-icon.svg'];

export function middleware(request: NextRequest) {
   const { pathname } = request.nextUrl;
   const hasSession = Boolean(request.cookies.get('flowie_access')?.value);
   const legacyTeamRoute = pathname.match(/^\/([^/]+)\/team\/CORE(?:\/|$)/);

   // CORE was the hard-coded team ID in the original UI. Preserve old bookmarks without
   // sending users to a team that cannot exist in the database.
   if (legacyTeamRoute) {
      return NextResponse.redirect(new URL(`/${legacyTeamRoute[1]}/teams`, request.url));
   }

   if (publicPaths.includes(pathname)) {
      if (!hasSession) return NextResponse.next();
      return NextResponse.redirect(new URL('/', request.url));
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
