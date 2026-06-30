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
        📍 PinPoint
      </Link>
      <div className='navbar-links'>
        {user ? (
          <>
            <Link to='/my-pins' className='nav-link'>
              My Pins
            </Link>
            <Link to='/alerts' className='nav-link'>
              Alerts
            </Link>
            <AlertsToggle />
            <span className='nav-user'>{user.display_name}</span>
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
