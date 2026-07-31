import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const legacyMutationPrefixes = ['/api/reports', '/api/upload', '/api/reindex'];

function isLegacyMutation(request: NextRequest): boolean {
  return (
    request.method !== 'GET' &&
    request.method !== 'HEAD' &&
    legacyMutationPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix))
  );
}

export async function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === 'production' && isLegacyMutation(request)) {
    return NextResponse.json(
      {
        error: {
          code: 'legacy_endpoint_retired',
          message: 'This legacy mutation endpoint is unavailable.',
        },
      },
      { status: 410, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        for (const value of values) {
          request.cookies.set(value.name, value.value);
        }
        response = NextResponse.next({ request });
        for (const value of values) {
          response.cookies.set(value.name, value.value, value.options);
        }
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
