import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '../api/auth.js';
import { getToken, setToken } from '../api/client.js';
import type { PublicUser } from '../types/domain.js';

interface AuthContextValue {
  user: PublicUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  updateLocation: (lat: number, lng: number) => Promise<void>;
  setTracking: (enabled: boolean) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    authApi
      .me()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { token, user } = await authApi.login(email, password);
    setToken(token);
    setUser(user);
  }

  async function register(
    email: string,
    password: string,
    displayName: string,
  ) {
    const { token, user } = await authApi.register(
      email,
      password,
      displayName,
    );
    setToken(token);
    setUser(user);
  }

  async function updateLocation(lat: number, lng: number) {
    const updated = await authApi.setLocation(lat, lng);
    setUser(updated);
  }

  async function setTracking(enabled: boolean) {
    const updated = await authApi.setTracking(enabled);
    setUser(updated);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        updateLocation,
        setTracking,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
