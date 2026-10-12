import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  function handleLogout() {
    logout();
    navigate('/login');
  }
  return (
    <nav className="nav">
      <Link to="/sessions" className="brand">
        🏋️ Gym Booking
      </Link>
      <div className="nav-links">
        {user ? (
          <>
            <NavLink to="/sessions">Sessions</NavLink>
            <NavLink to="/my-bookings">My bookings</NavLink>
            {user.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
            <span className="muted hide-sm">· {user.name}</span>
            <button type="button" onClick={handleLogout} className="btn-link">
              Log out
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login">Log in</NavLink>
            <NavLink to="/register">Sign up</NavLink>
          </>
        )}
      </div>
    </nav>
  );
}
