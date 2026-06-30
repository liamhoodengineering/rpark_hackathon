import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { pinsApi } from '../api/pins.js';
import { useAuth } from '../contexts/AuthContext.js';
import type { Pin, Severity } from '../types/domain.js';

const SEVERITY_COLOR: Record<Severity, string> = {
  Low: '#22c55e',
  Medium: '#f97316',
  High: '#ef4444',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function MyPinsPage() {
  const { user } = useAuth();
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    pinsApi
      .list()
      .then((all) => {
        if (!active) return;
        setPins(all.filter((p) => p.reporter_id && p.reporter_id === user?.id));
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load pins');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  async function handleDelete(id: string) {
    setError('');
    try {
      await pinsApi.delete(id);
      setPins((current) => current.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete pin');
    }
  }

  return (
    <div className='mypins-page'>
      <div className='mypins-header'>
        <div>
          <h1>My Pins</h1>
          <p className='mypins-sub'>Hazards you’ve reported on PinPoint.</p>
        </div>
        <Link to='/' className='btn btn-ghost'>
          ← Back to map
        </Link>
      </div>

      {error && <p className='error-msg'>{error}</p>}

      {loading ? (
        <div className='loading-spinner'>Loading…</div>
      ) : pins.length === 0 ? (
        <div className='mypins-empty'>
          <div className='empty-emoji'>📍</div>
          <p>You haven’t reported any active hazards yet.</p>
          <Link to='/' className='btn btn-primary'>
            Report a hazard
          </Link>
        </div>
      ) : (
        <div className='mypins-grid'>
          {pins.map((pin) => (
            <article key={pin.id} className='pin-card'>
              <div className='pin-card-top'>
                <h3>{pin.name || 'Untitled hazard'}</h3>
                <span
                  className='severity-badge'
                  style={{ backgroundColor: SEVERITY_COLOR[pin.severity] }}
                >
                  {pin.severity}
                </span>
              </div>

              {pin.description && <p className='pin-desc'>{pin.description}</p>}

              <div className='pin-card-meta'>
                <span>
                  📍 {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
                </span>
                <span>🕒 {formatDate(pin.created_at)}</span>
                <span>📏 {pin.radius_m} m radius</span>
                <span>
                  👍 {pin.upvotes} · 👎 {pin.downvotes}
                </span>
              </div>

              <div className='pin-card-actions'>
                <button
                  className='btn btn-danger btn-sm'
                  onClick={() => handleDelete(pin.id)}
                >
                  🗑 Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
