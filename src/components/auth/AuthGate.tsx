'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  type BornersAuthActionResult,
  type BornersAuthProfile,
  fetchCurrentAuthProfile,
  getActiveSupabaseClient,
  isCloudAuthRequired,
  signInWithEmailPassword,
  signOutFromCloud,
  updateCurrentUserPassword,
} from '@/lib/supabase';

export interface AuthContextValue {
  authRequired: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  profile: BornersAuthProfile | null;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ ok: boolean; error?: string }>;
}

interface InternalAuthContextValue extends AuthContextValue {
  isProvided: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signIn: (email: string, password: string) => Promise<BornersAuthActionResult>;
}

const DEFAULT_AUTH_CONTEXT: InternalAuthContextValue = {
  isProvided: false,
  authRequired: false,
  isAuthenticated: true,
  isLoading: false,
  profile: null,
  authError: null,
  clearAuthError: () => {},
  signIn: async () => ({ ok: false, error: 'AuthProvider не смонтирован', profile: null }),
  signOut: async () => {},
  changePassword: async () => ({
    ok: false,
    error: 'Смена пароля недоступна вне AuthProvider',
  }),
};

const AuthContext = createContext<InternalAuthContextValue>(DEFAULT_AUTH_CONTEXT);

function dispatchAuthSignedInEvent(profile: BornersAuthProfile): void {
  if (
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function' &&
    typeof CustomEvent === 'function'
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent('borners-auth-signed-in', {
          detail: { profile, atIso: new Date().toISOString() },
        })
      );
    } catch {
      // ignore in minimal environments
    }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authRequired, setAuthRequired] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [profile, setProfile] = useState<BornersAuthProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const checkSeqRef = useRef<number>(0);
  const lastDispatchedUserIdRef = useRef<string | null>(null);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const verifyCurrentSession = useCallback(async (forceDispatchSignedIn = false) => {
    const seq = ++checkSeqRef.current;
    const client = getActiveSupabaseClient();
    if (!client) {
      if (seq !== checkSeqRef.current) return;
      setProfile(null);
      setIsAuthenticated(false);
      setIsLoading(false);
      lastDispatchedUserIdRef.current = null;
      return;
    }

    try {
      const { data: sessionData, error: sessionErr } = await client.auth.getSession();
      if (seq !== checkSeqRef.current) return;

      if (sessionErr || !sessionData?.session) {
        setProfile(null);
        setIsAuthenticated(false);
        setIsLoading(false);
        lastDispatchedUserIdRef.current = null;
        return;
      }

      const memberProfile = await fetchCurrentAuthProfile();
      if (seq !== checkSeqRef.current) return;

      if (!memberProfile) {
        setProfile(null);
        setIsAuthenticated(false);
        setIsLoading(false);
        lastDispatchedUserIdRef.current = null;
        setAuthError(
          'Доступ запрещён: аккаунт не числится среди авторизованных участников BORNERS GROUP (RLS). Обратитесь к администратору.'
        );
        void signOutFromCloud();
        return;
      }

      const isNewSignIn = lastDispatchedUserIdRef.current !== memberProfile.userId;
      setAuthError(null);
      setProfile(memberProfile);
      setIsAuthenticated(true);
      setIsLoading(false);

      if (forceDispatchSignedIn || isNewSignIn) {
        lastDispatchedUserIdRef.current = memberProfile.userId;
        dispatchAuthSignedInEvent(memberProfile);
      }
    } catch {
      if (seq !== checkSeqRef.current) return;
      setProfile(null);
      setIsAuthenticated(false);
      setIsLoading(false);
      lastDispatchedUserIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    const required = isCloudAuthRequired();
    setAuthRequired(required);

    if (!required) {
      setProfile(null);
      setAuthError(null);
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    const client = getActiveSupabaseClient();
    if (!client) {
      setProfile(null);
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    void verifyCurrentSession(false);

    const { data: authSubscription } = client.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT' || !session) {
        checkSeqRef.current += 1;
        lastDispatchedUserIdRef.current = null;
        setProfile(null);
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        // Откладываем асинхронный запрос за пределы колбэка onAuthStateChange, чтобы избежать блокировки клиента supabase-js v2
        setTimeout(() => {
          if (!cancelled) {
            void verifyCurrentSession(event === 'SIGNED_IN');
          }
        }, 0);
      }
    });

    return () => {
      cancelled = true;
      authSubscription.subscription.unsubscribe();
    };
  }, [verifyCurrentSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    const res = await signInWithEmailPassword(email, password);
    if (!res.ok || !res.profile) {
      setAuthError(res.error || 'Не удалось выполнить вход. Проверьте email и пароль.');
      setProfile(null);
      setIsAuthenticated(false);
      lastDispatchedUserIdRef.current = null;
      return res;
    }

    checkSeqRef.current += 1;
    setAuthError(null);
    setProfile(res.profile);
    setIsAuthenticated(true);
    setIsLoading(false);
    lastDispatchedUserIdRef.current = res.profile.userId;
    dispatchAuthSignedInEvent(res.profile);
    return res;
  }, []);

  const signOut = useCallback(async () => {
    checkSeqRef.current += 1;
    lastDispatchedUserIdRef.current = null;
    setProfile(null);
    setAuthError(null);
    if (authRequired) {
      setIsAuthenticated(false);
    }
    await signOutFromCloud();
  }, [authRequired]);

  const changePassword = useCallback(async (newPassword: string) => {
    return updateCurrentUserPassword(newPassword);
  }, []);

  const contextValue = useMemo<InternalAuthContextValue>(
    () => ({
      isProvided: true,
      authRequired,
      isAuthenticated,
      isLoading,
      profile,
      authError,
      clearAuthError,
      signIn,
      signOut,
      changePassword,
    }),
    [
      authRequired,
      isAuthenticated,
      isLoading,
      profile,
      authError,
      clearAuthError,
      signIn,
      signOut,
      changePassword,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  return {
    authRequired: ctx.authRequired,
    isAuthenticated: ctx.isAuthenticated,
    isLoading: ctx.isLoading,
    profile: ctx.profile,
    signOut: ctx.signOut,
    changePassword: ctx.changePassword,
  };
}

const AUTH_BRAND_MARKS = [
  { label: 'BORNERS / FUKAI', accentVar: 'var(--accent-borners, #1C1B18)' },
  { label: 'AKUSHA', accentVar: 'var(--accent-akusha, #D95D39)' },
  { label: 'LISKANI', accentVar: 'var(--accent-liskani, #0F766E)' },
  { label: 'НА ТЕЛЕ', accentVar: 'var(--accent-natele, #B07D4F)' },
] as const;

function AuthLoadingScreen() {
  return (
    <div
      data-testid="borners-auth-loading"
      className="relative min-h-screen w-full overflow-hidden bg-[#F6F5F2] text-[#141413] flex items-center justify-center px-4 py-10"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(15, 118, 110, 0.05), transparent 55%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(rgba(20, 20, 19, 0.14) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div className="relative z-10 w-full max-w-[400px] rounded-2xl bg-white border border-[#141413]/[0.08] dark:border-white/[0.09] shadow-[0_1px_3px_rgba(20,20,19,0.04),0_20px_50px_-20px_rgba(20,20,19,0.14)] p-8 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#141413] dark:bg-[#22211E] text-[#FAF9F6] shadow-[0_2px_10px_rgba(20,20,19,0.18)] ring-1 ring-inset ring-white/10 dark:ring-white/15">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#78756E]">
          BORNERS GROUP
        </p>
        <h1 className="mt-1.5 text-[18px] font-semibold tracking-[-0.02em] text-[#141413]">
          Проверка доступа
        </h1>
        <p className="mt-1.5 text-[13.5px] text-[#5C5953]">
          Сверяем сессию и права участника компании...
        </p>
      </div>
    </div>
  );
}

function AuthLoginScreen() {
  const { signIn, authError, clearAuthError } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const visibleError = localError || authError;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setLocalError(null);
    clearAuthError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setLocalError('Введите корпоративный email и пароль.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await signIn(trimmedEmail, password);
      if (!res.ok) {
        setLocalError(res.error || 'Неверный email или пароль.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="borners-auth-gate"
      className="relative min-h-screen w-full overflow-hidden bg-[#F6F5F2] text-[#141413] flex items-center justify-center px-4 py-10"
    >
      {/* Архитектурное верхнее свечение и едва заметная сетка точек */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(15, 118, 110, 0.05), transparent 55%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(rgba(20, 20, 19, 0.14) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10 w-full max-w-[440px] rounded-2xl bg-white border border-[#141413]/[0.08] dark:border-white/[0.09] shadow-[0_1px_3px_rgba(20,20,19,0.04),0_20px_50px_-20px_rgba(20,20,19,0.14)] p-8 sm:p-9">
        {/* Верхняя бренд-панель с монограммой */}
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#141413] dark:bg-[#22211E] text-[#FAF9F6] shadow-[0_2px_10px_rgba(20,20,19,0.18)] ring-1 ring-inset ring-white/10 dark:ring-white/15">
            <span className="text-[19px] font-semibold tracking-[-0.03em] leading-none select-none">
              B
            </span>
            <span
              aria-hidden="true"
              className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-white ring-1 ring-[#141413]/10 shadow-2xs"
            >
              <ShieldCheck className="h-3 w-3 text-[#0F766E]" />
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold tracking-[0.08em] text-[#141413] leading-tight">
              BORNERS GROUP
            </div>
            <p className="mt-0.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#78756E] whitespace-nowrap">
              STRATEGY PLATFORM · 2027–2028
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h1 className="text-[22px] sm:text-[24px] font-semibold tracking-[-0.028em] text-[#141413] leading-tight whitespace-nowrap">
            Вход в платформу
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#5C5953]">
            Единая система продаж, закупок и инвестиций
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label
              htmlFor="borners-auth-email"
              className="block text-[12px] font-medium text-[#3F3E3B] mb-1.5"
            >
              Корпоративный email
            </label>
            <input
              id="borners-auth-email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              disabled={submitting}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (visibleError) {
                  setLocalError(null);
                  clearAuthError();
                }
              }}
              placeholder="name@borners.ru"
              className="w-full h-11 rounded-xl bg-[#FAF9F6] border border-[#E4E1DA] px-3.5 text-[14px] text-[#141413] placeholder:text-[#9E9A91] outline-none transition focus:bg-white focus:border-[#141413]/45 focus:ring-4 focus:ring-[#141413]/[0.06] disabled:opacity-60"
            />
          </div>

          <div>
            <label
              htmlFor="borners-auth-password"
              className="block text-[12px] font-medium text-[#3F3E3B] mb-1.5"
            >
              Пароль
            </label>
            <div className="relative">
              <input
                id="borners-auth-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                disabled={submitting}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (visibleError) {
                    setLocalError(null);
                    clearAuthError();
                  }
                }}
                placeholder="••••••••"
                className="w-full h-11 rounded-xl bg-[#FAF9F6] border border-[#E4E1DA] pl-3.5 pr-11 text-[14px] text-[#141413] placeholder:text-[#9E9A91] outline-none transition focus:bg-white focus:border-[#141413]/45 focus:ring-4 focus:ring-[#141413]/[0.06] disabled:opacity-60"
              />
              <button
                type="button"
                tabIndex={0}
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-[#8D8A84] hover:bg-[#EFEDE8] hover:text-[#141413] transition cursor-pointer"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {visibleError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-200/90 bg-red-50/80 px-3.5 py-2.5 text-xs leading-relaxed text-red-800"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
              <span>{visibleError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-[#141413] hover:bg-[#262522] px-4 text-[14px] font-medium text-white shadow-sm transition active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Проверка доступа...</span>
              </>
            ) : (
              <span>Войти в платформу</span>
            )}
          </button>
        </form>

        <div className="mt-7 pt-5 border-t border-[#E4E1DA] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            {AUTH_BRAND_MARKS.map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#5C5953] whitespace-nowrap"
              >
                <span
                  aria-hidden="true"
                  className="h-[6px] w-[6px] rounded-full shrink-0"
                  style={{ backgroundColor: item.accentVar }}
                />
                <span>{item.label}</span>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[11.5px] text-[#6E6C66]">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[#15803D]" />
            <span>Защищённый контур BORNERS GROUP (RLS)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthGateInner({ children }: { children: React.ReactNode }) {
  const { authRequired, isAuthenticated, isLoading } = useContext(AuthContext);

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (!authRequired) {
    return <>{children}</>;
  }

  if (!isAuthenticated) {
    return <AuthLoginScreen />;
  }

  return <>{children}</>;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const ctx = useContext(AuthContext);
  if (!ctx.isProvided) {
    return (
      <AuthProvider>
        <AuthGateInner>{children}</AuthGateInner>
      </AuthProvider>
    );
  }
  return <AuthGateInner>{children}</AuthGateInner>;
}

export interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ChangePasswordModal({
  open,
  onClose,
  onSuccess,
}: ChangePasswordModalProps) {
  const { profile, changePassword } = useAuthContext();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      setNewPassword('');
      setConfirmPassword('');
      setShowNew(false);
      setShowConfirm(false);
      setError(null);
      setSuccess(false);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (newPassword.length < 8) {
      setError('Новый пароль должен содержать не менее 8 символов.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают. Проверьте ввод.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await changePassword(newPassword);
      if (!res.ok) {
        setError(res.error || 'Не удалось обновить пароль.');
        return;
      }
      setSuccess(true);
      onSuccess?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="borners-change-password-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-[400px] rounded-2xl border border-neutral-200/80 bg-white p-6 text-[#141413] shadow-[0_20px_60px_rgba(20,20,19,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F6F5F2] text-[#141413] border border-neutral-200/80">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="borners-change-password-title"
                className="text-sm font-semibold text-[#141413]"
              >
                Смена пароля
              </h2>
              {profile?.email && (
                <p className="text-xs text-[#6E6C66] truncate max-w-[240px]">
                  {profile.email}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Закрыть"
            className="rounded-lg p-1.5 text-[#8D8A84] hover:bg-neutral-100 hover:text-[#141413] transition disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          <div className="mt-5 space-y-4">
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200/90 bg-emerald-50/80 px-3.5 py-3 text-xs leading-relaxed text-emerald-900">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-700" />
              <span>Пароль успешно обновлён. Текущая сессия остаётся активной.</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-[#141413] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2A2A28] transition"
            >
              Готово
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5" noValidate>
            <div>
              <label
                htmlFor="borners-new-password"
                className="block text-xs font-medium text-[#3F3E3B] mb-1"
              >
                Новый пароль
              </label>
              <div className="relative">
                <input
                  id="borners-new-password"
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  disabled={submitting}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Минимум 8 символов"
                  className="w-full rounded-xl border border-neutral-200/90 bg-[#FAFAF8] pl-3.5 pr-10 py-2 text-sm text-[#141413] placeholder:text-[#A3A09A] outline-none transition focus:border-[#141413] focus:bg-white focus:ring-2 focus:ring-[#141413]/10"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  aria-label={showNew ? 'Скрыть пароль' : 'Показать пароль'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#8D8A84] hover:bg-neutral-100 hover:text-[#141413]"
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="borners-confirm-password"
                className="block text-xs font-medium text-[#3F3E3B] mb-1"
              >
                Подтвердите новый пароль
              </label>
              <div className="relative">
                <input
                  id="borners-confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  disabled={submitting}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Повторите пароль"
                  className="w-full rounded-xl border border-neutral-200/90 bg-[#FAFAF8] pl-3.5 pr-10 py-2 text-sm text-[#141413] placeholder:text-[#A3A09A] outline-none transition focus:border-[#141413] focus:bg-white focus:ring-2 focus:ring-[#141413]/10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'Скрыть пароль' : 'Показать пароль'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#8D8A84] hover:bg-neutral-100 hover:text-[#141413]"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-red-200/90 bg-red-50/80 px-3 py-2 text-xs text-red-800"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl border border-neutral-200/90 bg-white px-3.5 py-2 text-xs font-medium text-[#3F3E3B] hover:bg-[#F6F5F2] transition disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-[#141413] px-4 py-2 text-xs font-medium text-white hover:bg-[#2A2A28] transition disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{submitting ? 'Сохранение...' : 'Сохранить пароль'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
