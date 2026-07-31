import { z } from 'zod';

const clientEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_RELEASE_ID: z.string().regex(/^[0-9a-f]{40}$/),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_NAGARIK_MAP_STYLE_URL: z.string().url().optional(),
});

export type ClientEnvironment = z.infer<typeof clientEnvironmentSchema>;

export function parseClientEnvironment(
  input: Record<string, string | undefined>,
): ClientEnvironment {
  return clientEnvironmentSchema.parse(input);
}
