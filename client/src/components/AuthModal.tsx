import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { Modal } from './Modal.js';

export type AuthMode = 'login' | 'register';

interface AuthModalProps {
  open: boolean;
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
}

/**
 * Login / register flow rendered inside a modal. Replaces the standalone
 * /login and /register pages so auth never navigates away from the map.
 */
export function AuthModal({
  open,
  mode,
  onModeChange,
  onClose,
}: AuthModalProps) {
  const { login, register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function reset() {
    setDisplayName('');
    setEmail('');
    setPassword('');
    setError('');
    setLoading(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function switchMode(next: AuthMode) {
    setError('');
    onModeChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, displayName);
      }
      reset();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === 'login'
            ? 'Login failed'
            : 'Registration failed',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title='📍 PinPoint Account'>
      <div className='auth-modal-body'>
        <div className={`auth-tabs auth-tabs-${mode}`}>
          <span className='auth-tabs-thumb' aria-hidden='true' />
          <button
            type='button'
            className={`auth-tab${mode === 'login' ? ' auth-tab-active' : ''}`}
            onClick={() => switchMode('login')}
          >
            Sign in
          </button>
          <button
            type='button'
            className={`auth-tab${mode === 'register' ? ' auth-tab-active' : ''}`}
            onClick={() => switchMode('register')}
          >
            Create account
          </button>
        </div>

        {error && <p className='error-msg'>{error}</p>}

        <form onSubmit={handleSubmit} className='auth-form'>
          {mode === 'register' && (
            <label>
              Display name
              <input
                type='text'
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                autoComplete='name'
              />
            </label>
          )}
          <label>
            Email
            <input
              type='email'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete='email'
            />
          </label>
          <label>
            Password
            <input
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              minLength={mode === 'register' ? 8 : undefined}
            />
          </label>
          <button type='submit' className='btn btn-primary' disabled={loading}>
            {loading
              ? mode === 'login'
                ? 'Signing in…'
                : 'Creating account…'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>

        <p className='auth-alt'>
          {mode === 'login' ? (
            <>
              No account?{' '}
              <button
                type='button'
                className='link-button'
                onClick={() => switchMode('register')}
              >
                Register
              </button>
            </>
          ) : (
            <>
              Have an account?{' '}
              <button
                type='button'
                className='link-button'
                onClick={() => switchMode('login')}
              >
                Log in
              </button>
            </>
          )}
        </p>
      </div>
    </Modal>
  );
}
