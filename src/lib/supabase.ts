import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_RUNTIME_CONFIG_STORAGE_KEY = 'borners_supabase_runtime_config_v1';

export const DEFAULT_PRODUCTION_SUPABASE_URL = 'https://ocdmyldosplufhhwrrwq.supabase.co';
export const DEFAULT_PRODUCTION_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_O2S9Pi4aswxjD5ShAhHQ_w_CnUvmZlR';

export interface SupabaseRuntimeConfig {
  url: string;
  anonKey: string;
}

export type BornersAuthRole = 'owner' | 'partner' | 'admin' | 'manager';

export interface BornersAuthProfile {
  userId: string;
  email: string;
  role: BornersAuthRole;
  displayName: string;
  companyCode: string;
}

export interface BornersAuthActionResult {
  ok: boolean;
  error?: string;
  profile?: BornersAuthProfile | null;
  unauthorized?: boolean;
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

const VALID_AUTH_ROLES = new Set<BornersAuthRole>(['owner', 'partner', 'admin', 'manager']);

function normalizeAuthRole(raw: unknown): BornersAuthRole | null {
  const val = String(raw || '')
    .trim()
    .toLowerCase() as BornersAuthRole;
  return VALID_AUTH_ROLES.has(val) ? val : null;
}

function translateSupabaseAuthError(rawMessage: string | undefined | null): string {
  const msg = (rawMessage || '').trim();
  const lower = msg.toLowerCase();
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid_credentials') ||
    lower.includes('invalid email or password')
  ) {
    return 'Неверный email или пароль. Проверьте учётные данные и попробуйте снова.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Email учётной записи не подтверждён. Обратитесь к администратору BORNERS GROUP.';
  }
  if (
    lower.includes('too many requests') ||
    lower.includes('rate limit') ||
    lower.includes('over_request_rate_limit')
  ) {
    return 'Слишком много попыток входа. Подождите минуту и повторите попытку.';
  }
  if (
    lower.includes('password should be at least') ||
    lower.includes('weak_password') ||
    lower.includes('password is too short')
  ) {
    return 'Пароль слишком короткий или ненадёжный. Используйте минимум 8 символов.';
  }
  if (lower.includes('new password should be different') || lower.includes('same_password')) {
    return 'Новый пароль должен отличаться от текущего.';
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed')
  ) {
    return 'Нет связи с сервером авторизации. Проверьте подключение к интернету.';
  }
  if (lower.includes('session missing') || lower.includes('auth session missing')) {
    return 'Сессия истекла. Войдите в систему повторно.';
  }
  return msg ? `Ошибка авторизации: ${msg}` : 'Не удалось выполнить авторизацию. Попробуйте ещё раз.';
}

export function isCloudAuthRequired(): boolean {
  if (
    typeof window !== 'undefined' &&
    (window as unknown as { __BORNERS_REQUIRE_AUTH__?: boolean }).__BORNERS_REQUIRE_AUTH__ === true
  ) {
    return true;
  }
  return getActiveSupabaseClient() !== null;
}

export async function fetchCurrentAuthProfile(): Promise<BornersAuthProfile | null> {
  const client = getActiveSupabaseClient();
  if (!client) return null;

  try {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData?.user?.id) {
      return null;
    }

    const user = userData.user;
    const { data: memberRow, error: memberError } = await client
      .from('company_members')
      .select('user_id, email, role, display_name, company_code')
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError || !memberRow) {
      return null;
    }

    const role = normalizeAuthRole((memberRow as { role?: unknown }).role);
    if (!role) {
      return null;
    }

    const email = String((memberRow as { email?: unknown }).email || user.email || '').trim();
    const displayName = String(
      (memberRow as { display_name?: unknown }).display_name || email || 'Участник'
    ).trim();
    const companyCode = String(
      (memberRow as { company_code?: unknown }).company_code || 'BORNERS_GROUP'
    ).trim();

    return {
      userId: String((memberRow as { user_id?: unknown }).user_id || user.id),
      email,
      role,
      displayName,
      companyCode,
    };
  } catch {
    return null;
  }
}

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<BornersAuthActionResult> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !password) {
    return {
      ok: false,
      error: 'Укажите рабочий email и пароль.',
      profile: null,
    };
  }

  const client = getActiveSupabaseClient();
  if (!client) {
    return {
      ok: false,
      error: 'Облачное подключение Supabase не активно в текущем окружении.',
      profile: null,
    };
  }

  try {
    const { error } = await client.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error) {
      return {
        ok: false,
        error: translateSupabaseAuthError(error.message),
        profile: null,
      };
    }

    const profile = await fetchCurrentAuthProfile();
    if (!profile) {
      try {
        await client.auth.signOut();
      } catch {
        // ignore signOut failure
      }
      return {
        ok: false,
        unauthorized: true,
        error:
          'Доступ запрещён: аккаунт не числится среди авторизованных участников BORNERS GROUP (RLS). Обратитесь к администратору.',
        profile: null,
      };
    }

    return {
      ok: true,
      profile,
    };
  } catch (err) {
    return {
      ok: false,
      error: translateSupabaseAuthError(err instanceof Error ? err.message : undefined),
      profile: null,
    };
  }
}

export async function signOutFromCloud(): Promise<{ ok: boolean; error?: string }> {
  const client = getActiveSupabaseClient();
  if (!client) {
    return { ok: true };
  }
  try {
    const { error } = await client.auth.signOut();
    if (error) {
      return { ok: false, error: translateSupabaseAuthError(error.message) };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: translateSupabaseAuthError(err instanceof Error ? err.message : undefined),
    };
  }
}

export async function updateCurrentUserPassword(
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 8) {
    return {
      ok: false,
      error: 'Новый пароль должен содержать не менее 8 символов.',
    };
  }

  const client = getActiveSupabaseClient();
  if (!client) {
    return {
      ok: false,
      error: 'Смена облачного пароля недоступна в локальном офлайн-режиме.',
    };
  }

  try {
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) {
      return {
        ok: false,
        error: translateSupabaseAuthError(error.message),
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: translateSupabaseAuthError(err instanceof Error ? err.message : undefined),
    };
  }
}
