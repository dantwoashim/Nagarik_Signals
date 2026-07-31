import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import { getServerEnvironment } from '@/lib/env/server';

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  return { configured: Boolean(url && anonKey), url, anonKey };
}

export function requireSupabaseConfig() {
  const config = getSupabaseConfig();
  if (!config.configured) throw new Error('nagarik_supabase_not_configured');
  return config;
}

export function createOperatorSupabaseClient(accessToken: string): SupabaseClient {
  const { url, anonKey } = requireSupabaseConfig();
  if (!accessToken) throw new Error('nagarik_operator_access_token_missing');
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const { url, anonKey } = requireSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(values) {
        try {
          for (const value of values) {
            cookieStore.set(value.name, value.value, value.options);
          }
        } catch {
          // Server Components cannot write cookies. The proxy performs refresh writes.
        }
      },
    },
  });
}

export function createServiceSupabaseClient(): SupabaseClient {
  const env = getServerEnvironment();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
