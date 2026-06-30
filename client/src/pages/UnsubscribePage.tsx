import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { pinsApi } from '../api/pins.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useAuthModal } from '../contexts/AuthModalContext.js';

export function UnsubscribePage() {
  const { user } = useAuth();
  const { openAuth } = useAuthModal();
  const [searchParams] = useSearchParams();
  const areaId = searchParams.get('area');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    'idle',
  );
  const [errorMsg, setErrorMsg] = useState('');

  if (!areaId) {
    return (
      <div className='auth-page'>
        <div className='auth-card'>
          <h2>Manage Alerts</h2>
          <p>
            No alert area specified.{' '}
            <Link to='/alerts'>Manage your alert areas →</Link>
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className='auth-page'>
        <div className='auth-card'>
          <h2>Unsubscribe from alerts</h2>
          <p>Sign in to manage your alert areas.</p>
          <button
            type='button'
            className='btn btn-primary'
            onClick={() => openAuth('login')}
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  async function handleUnsubscribe() {
    setStatus('loading');
    try {
      await pinsApi.delete(areaId!);
      setStatus('done');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to remove alert area',
      );
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <div className='auth-page'>
        <div className='auth-card'>
          <h2>✅ Unsubscribed</h2>
          <p>You've been removed from that alert area.</p>
          <Link to='/alerts' className='btn btn-primary'>
            Manage all alert areas
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className='auth-page'>
      <div className='auth-card'>
        <h2>Unsubscribe from alerts</h2>
        <p>Remove this alert area from your account?</p>
        {status === 'error' && <p className='error-msg'>{errorMsg}</p>}
        <div className='form-actions'>
          <button
            className='btn btn-danger'
            onClick={handleUnsubscribe}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? 'Removing…' : 'Yes, remove it'}
          </button>
          <Link to='/alerts' className='btn btn-ghost'>
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
