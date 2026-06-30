import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthModal, type AuthMode } from '../components/AuthModal.js';

interface AuthModalContextValue {
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

/**
 * Hosts the global auth modal and exposes openAuth/closeAuth so any component
 * (nav bar, vote card, protected routes) can prompt sign-in without navigating.
 */
export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>('login');

  const openAuth = useCallback((nextMode: AuthMode = 'login') => {
    setMode(nextMode);
    setOpen(true);
  }, []);

  const closeAuth = useCallback(() => setOpen(false), []);

  return (
    <AuthModalContext.Provider value={{ openAuth, closeAuth }}>
      {children}
      <AuthModal
        open={open}
        mode={mode}
        onModeChange={setMode}
        onClose={closeAuth}
      />
    </AuthModalContext.Provider>
  );
}

export function useAuthModal(): AuthModalContextValue {
  const ctx = useContext(AuthModalContext);
  if (!ctx) {
    throw new Error('useAuthModal must be used inside AuthModalProvider');
  }
  return ctx;
}
