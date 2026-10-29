import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/dashboard', '/chatbots', '/conversations', '/billing', '/settings'];

export async function updateSession(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: { name: string; value: string; options?: any }[]) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path.startsWith(p))) {
    const url = req.nextUrl.clone(); url.pathname = '/login'; url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  if (user && (path === '/login' || path === '/signup')) {
    const url = req.nextUrl.clone(); url.pathname = '/dashboard'; url.search = '';
    return NextResponse.redirect(url);
  }
  return res;
}
