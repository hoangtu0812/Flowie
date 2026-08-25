import { NextRequest, NextResponse } from 'next/server';

/**
 * A page request only needs a durable session cookie. The API validates the
 * JWT on protected operations and can rotate the short-lived access cookie
 * from the 30-day refresh cookie. Checking both here prevents a browser
 * refresh from sending a signed-in user back to login unnecessarily.
 *
 * This file deliberately does not alter any Circle presentation route.
 */
export function middleware(request: NextRequest) {
   const { pathname, search } = request.nextUrl;
   if (pathname.startsWith('/auth/')) return NextResponse.next();

   const hasSession = request.cookies.has('flowie_access') || request.cookies.has('flowie_refresh');
   if (hasSession) return NextResponse.next();

   const login = request.nextUrl.clone();
   login.pathname = '/auth/login';
   login.searchParams.set('next', `${pathname}${search}`);
   return NextResponse.redirect(login);
}

export const config = {
   matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
