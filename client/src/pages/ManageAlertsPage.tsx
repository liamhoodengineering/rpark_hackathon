import { useEffect, useState } from 'react';
import { watchAreasApi } from '../api/watchAreas.js';
import { PinAreaForm } from '../components/PinAreaForm.js';
import { useGeolocation } from '../hooks/useGeolocation.js';
import type { WatchArea } from '../types/domain.js';

const SEVERITY_LABEL: Record<string, string> = {
  Low: '🟢 Low',
  Medium: '🟠 Medium',
  High: '🔴 High',
};

export function ManageAlertsPage() {
  const [watchAreas, setWatchAreas] = useState<WatchArea[]>([]);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const { position } = useGeolocation();

  useEffect(() => {
    watchAreasApi
      .list()
      .then(setWatchAreas)
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : 'Failed to load alert areas'),
      );
  }, []);

  async function handleDelete(id: string) {
    try {
      await watchAreasApi.delete(id);
      setWatchAreas((prev) => prev.filter((wa) => wa.id !== id));
    } catch {
      // silent — the item stays in the list so the user can retry
    }
  }

  function handleCreated(wa: WatchArea) {
    setWatchAreas((prev) => [wa, ...prev]);
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

      {watchAreas.length === 0 && !loadError && !showForm && (
        <p className="empty-state">
          No alert areas yet. Add one to get emailed when hazards appear nearby.
        </p>
      )}

      <ul className="watch-area-list">
        {watchAreas.map((wa) => (
          <li key={wa.id} className="watch-area-card">
            <div className="watch-area-info">
              <span className="watch-area-radius">{wa.radius_m}m radius</span>
              <span className="watch-area-severity">{SEVERITY_LABEL[wa.min_severity]}+</span>
              <span className="watch-area-email">
                {wa.email_enabled ? '📧 Email on' : '🔕 Email off'}
              </span>
              <span className="watch-area-coords">
                {wa.lat.toFixed(4)}, {wa.lng.toFixed(4)}
              </span>
            </div>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => handleDelete(wa.id)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
