import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_RUNTIME_CONFIG_STORAGE_KEY = 'borners_supabase_runtime_config_v1';

export interface SupabaseRuntimeConfig {
  url: string;
  anonKey: string;
}

const envSupabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const envSupabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

export function readRuntimeSupabaseConfig(): SupabaseRuntimeConfig | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(SUPABASE_RUNTIME_CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SupabaseRuntimeConfig>;
        const url = (parsed.url || '').trim();
        const anonKey = (parsed.anonKey || '').trim();
        if (url && anonKey && !url.includes('your-project-ref')) {
          return { url, anonKey };
        }
      }
    } catch {
      // ignore
    }
  }
  if (
    envSupabaseUrl &&
    envSupabaseAnonKey &&
    !envSupabaseUrl.includes('your-project-ref')
  ) {
    return { url: envSupabaseUrl, anonKey: envSupabaseAnonKey };
  }
  return null;
}

export function saveRuntimeSupabaseConfig(config: SupabaseRuntimeConfig | null): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (!config || !config.url.trim() || !config.anonKey.trim()) {
      window.localStorage.removeItem(SUPABASE_RUNTIME_CONFIG_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        SUPABASE_RUNTIME_CONFIG_STORAGE_KEY,
        JSON.stringify({
          url: config.url.trim(),
          anonKey: config.anonKey.trim(),
        })
      );
    }
    cachedClient = null;
    cachedConfigKey = '';
  } catch {
    // ignore
  }
}

export const isSupabaseConfigured =
  Boolean(envSupabaseUrl) &&
  Boolean(envSupabaseAnonKey) &&
  !envSupabaseUrl.includes('your-project-ref');

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(envSupabaseUrl, envSupabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

let cachedClient: SupabaseClient | null = supabase;
let cachedConfigKey = isSupabaseConfigured
  ? `${envSupabaseUrl}::${envSupabaseAnonKey}`
  : '';

export function getActiveSupabaseClient(): SupabaseClient | null {
  const cfg = readRuntimeSupabaseConfig();
  if (!cfg) return null;
  const key = `${cfg.url}::${cfg.anonKey}`;
  if (cachedClient && cachedConfigKey === key) {
    return cachedClient;
  }
  cachedClient = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  cachedConfigKey = key;
  return cachedClient;
}
