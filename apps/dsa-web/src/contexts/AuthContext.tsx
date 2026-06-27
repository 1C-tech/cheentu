import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createParsedApiError, getParsedApiError, type ParsedApiError } from '../api/error';
import { authApi } from '../api/auth';
import { useStockPoolStore } from '../stores';

type LoginFn = (
  usernameOrPassword: string,
  passwordOrConfirm?: string,
  forAdminSetup?: string
) => Promise<{ success: boolean; error?: ParsedApiError }>;

type RegisterFn = (
  username: string,
  email: string,
  password: string
) => Promise<{ success: boolean; error?: ParsedApiError }>;

type AuthContextValue = {
  authEnabled: boolean;
  loggedIn: boolean;
  passwordSet: boolean;
  passwordChangeable: boolean;
  setupState: 'enabled' | 'password_retained' | 'no_password';
  isLoading: boolean;
  loadError: ParsedApiError | null;
  multiUser: boolean;
  currentUsername: string | null;
  login: LoginFn;
  register: RegisterFn;
  changePassword: (
    currentPassword: string,
    newPassword: string,
    newPasswordConfirm: string
  ) => Promise<{ success: boolean; error?: ParsedApiError }>;
  logout: () => Promise<void>;
  refreshStatus: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function extractLoginError(err: unknown): ParsedApiError {
  const parsed = getParsedApiError(err);
  if (parsed.status === 429) {
    return createParsedApiError({
      title: 'Too many attempts',
      message: 'Too many failed attempts. Please try again later.',
      rawMessage: parsed.rawMessage,
      status: parsed.status,
      category: parsed.category,
    });
  }
  return parsed;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authEnabled, setAuthEnabled] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);
  const [passwordChangeable, setPasswordChangeable] = useState(false);
  const [setupState, setSetupState] = useState<'enabled' | 'password_retained' | 'no_password'>('no_password');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<ParsedApiError | null>(null);
  const [multiUser, setMultiUser] = useState(false);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const status = await authApi.getStatus();
      setAuthEnabled(status.authEnabled);
      setLoggedIn(status.loggedIn);
      setPasswordSet(status.passwordSet ?? false);
      setPasswordChangeable(status.passwordChangeable ?? false);
      setSetupState(status.setupState);
      setMultiUser(status.multiUser ?? false);
      setCurrentUsername(status.username ?? null);
      if (status.authEnabled && !status.loggedIn) {
        useStockPoolStore.getState().resetDashboardState();
      }
    } catch (err) {
      setLoadError(getParsedApiError(err));
      setAuthEnabled(false);
      setLoggedIn(false);
      setPasswordSet(false);
      setPasswordChangeable(false);
      setSetupState('no_password');
      setMultiUser(false);
      setCurrentUsername(null);
      useStockPoolStore.getState().resetDashboardState();
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Multi-user login: login(username, password)
  // Admin setup: login(password, passwordConfirm)
  const login = useCallback<LoginFn>(
    async (arg1, arg2, arg3) => {
      try {
        if (setupState === 'no_password' || (!passwordSet && !multiUser)) {
          // Admin first-time setup: password + confirm
          await authApi.login('admin', arg1, arg2);
        } else if (multiUser) {
          // Multi-user: username + password
          await authApi.login(arg1, arg2!);
        } else {
          // Legacy single-admin: password
          await authApi.login('admin', arg1, arg2);
        }
        await fetchStatus();
        return { success: true };
      } catch (err: unknown) {
        return { success: false, error: extractLoginError(err) };
      }
    },
    [fetchStatus, setupState, passwordSet, multiUser]
  );

  const register = useCallback<RegisterFn>(
    async (username, email, password) => {
      try {
        await authApi.register(username, email, password);
        return { success: true };
      } catch (err: unknown) {
        return { success: false, error: extractLoginError(err) };
      }
    },
    []
  );

  const changePassword = useCallback(
    async (
      currentPassword: string,
      newPassword: string,
      newPasswordConfirm: string
    ): Promise<{ success: boolean; error?: ParsedApiError }> => {
      try {
        await authApi.changePassword(currentPassword, newPassword, newPasswordConfirm);
        return { success: true };
      } catch (err: unknown) {
        return { success: false, error: getParsedApiError(err) };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    let logoutError: unknown = null;
    try {
      await authApi.logout();
    } catch (err) {
      logoutError = err;
    } finally {
      await fetchStatus();
    }

    if (logoutError && getParsedApiError(logoutError).status !== 401) {
      throw logoutError;
    }
  }, [fetchStatus]);

  return (
    <AuthContext.Provider
      value={{
        authEnabled,
        loggedIn,
        passwordSet,
        passwordChangeable,
        setupState,
        isLoading,
        loadError,
        multiUser,
        currentUsername,
        login,
        register,
        changePassword,
        logout,
        refreshStatus: fetchStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}