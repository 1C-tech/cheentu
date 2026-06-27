import apiClient from './index';

export type AuthStatusResponse = {
  authEnabled: boolean;
  loggedIn: boolean;
  passwordSet?: boolean;
  passwordChangeable?: boolean;
  setupState: 'enabled' | 'password_retained' | 'no_password';
  multiUser?: boolean;
  username?: string;
};

export const authApi = {
  async getStatus(): Promise<AuthStatusResponse> {
    const { data } = await apiClient.get<AuthStatusResponse>('/api/v1/auth/status');
    return data;
  },

  async updateSettings(
    authEnabled: boolean,
    password?: string,
    passwordConfirm?: string,
    currentPassword?: string
  ): Promise<AuthStatusResponse> {
    const body: {
      authEnabled: boolean;
      password?: string;
      passwordConfirm?: string;
      currentPassword?: string;
    } = { authEnabled };
    if (password !== undefined) {
      body.password = password;
    }
    if (passwordConfirm !== undefined) {
      body.passwordConfirm = passwordConfirm;
    }
    if (currentPassword !== undefined) {
      body.currentPassword = currentPassword;
    }
    const { data } = await apiClient.post<AuthStatusResponse>('/api/v1/auth/settings', body);
    return data;
  },

  // Multi-user login
  async login(username: string, password: string, passwordConfirm?: string): Promise<{ token?: string }> {
    const body: { username: string; password: string; passwordConfirm?: string } = {
      username,
      password,
    };
    if (passwordConfirm !== undefined) {
      body.passwordConfirm = passwordConfirm;
    }
    const { data } = await apiClient.post<{ token?: string }>('/api/v1/auth/login', body);
    if (data.token) {
      localStorage.setItem('cheentu_token', data.token);
    }
    return data;
  },

  // Multi-user register
  async register(username: string, email: string, password: string): Promise<{ token?: string }> {
    const { data } = await apiClient.post<{ token?: string }>('/api/v1/auth/register', {
      username,
      email,
      password,
    });
    if (data.token) {
      localStorage.setItem('cheentu_token', data.token);
    }
    return data;
  },

  async changePassword(
    currentPassword: string,
    newPassword: string,
    newPasswordConfirm: string
  ): Promise<void> {
    await apiClient.post('/api/v1/auth/change-password', {
      currentPassword,
      newPassword,
      newPasswordConfirm,
    });
  },

  async logout(): Promise<void> {
    localStorage.removeItem('cheentu_token');
    await apiClient.post('/api/v1/auth/logout');
  },

  getToken(): string | null {
    return localStorage.getItem('cheentu_token');
  },
};