import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import { useAuthModal } from '../contexts/AuthModalContext.js';
import { AlertsToggle } from './AlertsToggle.js';

export function NavBar() {
  const { user, logout } = useAuth();
  const { openAuth } = useAuthModal();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <nav className='navbar'>
      <Link to='/' className='navbar-brand'>
        <img src='/logo.png' alt='' className='navbar-logo' />
        PinPoint
      </Link>
      <div className='navbar-links'>
        {user ? (
          <>
            <AlertsToggle />
            <button onClick={handleLogout} className='btn btn-ghost'>
              Logout
            </button>
          </>
        ) : (
          <button onClick={() => openAuth('login')} className='btn btn-primary'>
            Sign in
          </button>
        )}
      </div>
    </nav>
  );
}
