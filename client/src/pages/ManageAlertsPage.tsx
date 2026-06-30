import { useEffect, useState } from 'react';
import { pinsApi } from '../api/pins.js';
import { PinAreaForm } from '../components/PinAreaForm.js';
import { useGeolocation } from '../hooks/useGeolocation.js';
import type { Pin } from '../types/domain.js';

const SEVERITY_LABEL: Record<string, string> = {
  Low: '🟢 Low',
  Medium: '🟠 Medium',
  High: '🔴 High',
};

export function ManageAlertsPage() {
  const [pins, setPins] = useState<Pin[]>([]);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const { position } = useGeolocation();

  useEffect(() => {
    if (!position) {
      return;
    }

    pinsApi
      .list({ lat: position.lat, lng: position.lng, radius: 5000 })
      .then(setPins)
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : 'Failed to load pins'),
      );
  }, [position]);

  async function handleDelete(id: string) {
    try {
      await pinsApi.delete(id);
      setPins((prev) => prev.filter((pin) => pin.id !== id));
    } catch {
      // silent — the item stays in the list so the user can retry
    }
  }

  function handleCreated(pin: Pin) {
    setPins((prev) => [pin, ...prev]);
    setShowForm(false);
  }

  return (
    <div className="alerts-page">
      <div className="alerts-header">
        <h2>My Alert Areas</h2>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + Add alert area
          </button>
        )}
      </div>

      {showForm && (
        <PinAreaForm
          defaultLat={position?.lat}
          defaultLng={position?.lng}
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loadError && <p className="error-msg">{loadError}</p>}

      {pins.length === 0 && !loadError && !showForm && (
        <p className="empty-state">
          No pins yet. Add one to report a nearby issue.
        </p>
      )}

      <ul className="watch-area-list">
        {pins.map((pin) => (
          <li key={pin.id} className="watch-area-card">
            <div className="watch-area-info">
              <span className="watch-area-radius">{pin.radius_m}m radius</span>
              <span className="watch-area-severity">{SEVERITY_LABEL[pin.severity]}</span>
              <span className="watch-area-email">
                {pin.reporter_id ? '👤 Account pin' : '🕶 Anonymous pin'}
              </span>
              <span className="watch-area-coords">
                {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
              </span>
            </div>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => handleDelete(pin.id)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
