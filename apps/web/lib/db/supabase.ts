export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return {
    configured: Boolean(url && anonKey),
    url,
    anonKey,
  };
}

export function requireSupabaseConfig() {
  const config = getSupabaseConfig();
  if (!config.configured) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  return config;
}
