// Build-time settings. Expo inlines EXPO_PUBLIC_* variables into the bundle,
// so only public values belong here (the Supabase anon key is public by design;
// the AI keys live in the edge functions, never in the app).

export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** Preview builds start with a sample fridge and run the AI features offline. */
  preview: process.env.EXPO_PUBLIC_PREVIEW === '1',
};

export const cloudConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
