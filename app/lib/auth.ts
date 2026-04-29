export interface User {
  id: string;
  username: string;
}

export interface AuthResponse {
  user: User | null;
  error: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Helper to construct API endpoints - prevents double /api/ issue
const getApiUrl = (endpoint: string): string => {
  if (!API_URL) {
    // Use relative paths for same-origin requests
    return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  }
  // Remove trailing slash from API_URL if present
  const baseUrl = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
  // Remove leading slash from endpoint if present
  const path = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${baseUrl}/${path}`;
};

export const authUtils = {
  async login(username: string, password: string): Promise<AuthResponse> {
    try {
      const url = getApiUrl('api/auth');
      const response = await fetch(url, {
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
      const url = getApiUrl('api/auth');
      const response = await fetch(url, {
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
