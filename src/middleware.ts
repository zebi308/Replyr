import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
export function middleware(req: NextRequest) { return updateSession(req); }
export const config = { matcher: ['/((?!api|_next/static|_next/image|widget.js|logo.svg|favicon.ico).*)'] };
