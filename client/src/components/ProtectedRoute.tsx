import { Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { useAuthModal } from '../contexts/AuthModalContext.js';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const { openAuth } = useAuthModal();

  useEffect(() => {
    if (!isLoading && !user) openAuth('login');
  }, [isLoading, user, openAuth]);

  if (isLoading) {
    return <div className='loading-spinner'>Loading…</div>;
  }

  if (!user) {
    return <Navigate to='/' replace />;
  }

  return <>{children}</>;
}
