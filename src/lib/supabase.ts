import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_RUNTIME_CONFIG_STORAGE_KEY = 'borners_supabase_runtime_config_v1';

export const DEFAULT_PRODUCTION_SUPABASE_URL = 'https://ocdmyldosplufhhwrrwq.supabase.co';
export const DEFAULT_PRODUCTION_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_O2S9Pi4aswxjD5ShAhHQ_w_CnUvmZlR';

export interface SupabaseRuntimeConfig {
  url: string;
  anonKey: string;
}

const envSupabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const envSupabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

function isLocalSandboxOrAutomatedBrowser(): boolean {
  if (typeof window === 'undefined') return true;
  if (
    (window as unknown as { __BORNERS_ENABLE_CLOUD_IN_LOCAL__?: boolean })
      .__BORNERS_ENABLE_CLOUD_IN_LOCAL__ === true ||
    (globalThis as { __BORNERS_ALLOW_CLOUD_WRITE_IN_TEST__?: boolean })
      .__BORNERS_ALLOW_CLOUD_WRITE_IN_TEST__ === true
  ) {
    return false;
  }
  if (typeof navigator !== 'undefined' && navigator.webdriver === true) {
    return true;
  }
  const host = (window.location?.hostname || '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return true;
  }
  return false;
}

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

  // В локальном E2E / localhost и в Node-тестах не лезем в боевую базу без явного флага
  if (isLocalSandboxOrAutomatedBrowser()) {
    return null;
  }

  const effectiveUrl =
    envSupabaseUrl && !envSupabaseUrl.includes('your-project-ref')
      ? envSupabaseUrl
      : DEFAULT_PRODUCTION_SUPABASE_URL;
  const effectiveKey = envSupabaseAnonKey || DEFAULT_PRODUCTION_SUPABASE_PUBLISHABLE_KEY;

  if (effectiveUrl && effectiveKey) {
    return { url: effectiveUrl, anonKey: effectiveKey };
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

export const isSupabaseConfigured = true;

export const supabase: SupabaseClient | null = null;

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';

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
