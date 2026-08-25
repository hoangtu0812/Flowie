import { NextResponse } from 'next/server';

/**
 * Temporary Circle UI preview mode.
 *
 * Authentication is deliberately disabled while the original presentation is
 * verified. Re-enable the former session guard only after each domain is
 * connected through a non-visual feature adapter.
 */
export function middleware() {
   return NextResponse.next();
}

export const config = {
   matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
