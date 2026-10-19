import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.117.2';

import { HttpError } from './http.ts';

/** A database client that acts as the signed-in caller, so row-level security applies. */
export async function caller(req: Request): Promise<{ db: SupabaseClient; user: User }> {
  const authorization = req.headers.get('Authorization');
  if (!authorization) throw new HttpError(401, 'Sign in first');
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) throw new HttpError(500, 'Supabase environment is missing');
  const db = createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await db.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
  if (error || !data.user) throw new HttpError(401, 'Sign in first');
  return { db, user: data.user };
}
