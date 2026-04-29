export interface User {
  id: string;
  username: string;
}

export interface AuthResponse {
  user: User | null;
  error: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const authUtils = {
  async login(username: string, password: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'login',
          username,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { user: null, error: data.error || 'Login failed' };
      }

      const user: User = { id: data.id, username: data.username };
      localStorage.setItem('user', JSON.stringify(user));
      return { user, error: null };
    } catch (error) {
      return {
        user: null,
        error: error instanceof Error ? error.message : 'An error occurred',
      };
    }
  },

  async register(username: string, password: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_URL}/api/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'register',
          username,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { user: null, error: data.error || 'Registration failed' };
      }

      const user: User = { id: data.id, username: data.username };
      localStorage.setItem('user', JSON.stringify(user));
      return { user, error: null };
    } catch (error) {
      return {
        user: null,
        error: error instanceof Error ? error.message : 'An error occurred',
      };
    }
  },

  logout() {
    localStorage.removeItem('user');
  },

  getCurrentUser(): User | null {
    if (typeof window !== 'undefined') {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user) : null;
    }
    return null;
  },

  isAuthenticated(): boolean {
    return this.getCurrentUser() !== null;
  },
};
