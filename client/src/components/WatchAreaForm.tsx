import { useState } from 'react';
import { watchAreasApi } from '../api/watchAreas.js';
import type { Severity, WatchArea } from '../types/domain.js';

interface WatchAreaFormProps {
  defaultLat?: number;
  defaultLng?: number;
  onCreated: (wa: WatchArea) => void;
  onCancel: () => void;
}

const SEVERITIES: Severity[] = ['Low', 'Medium', 'High'];

export function WatchAreaForm({ defaultLat, defaultLng, onCreated, onCancel }: WatchAreaFormProps) {
  const [lat, setLat] = useState(defaultLat?.toFixed(6) ?? '');
  const [lng, setLng] = useState(defaultLng?.toFixed(6) ?? '');
  const [radiusM, setRadiusM] = useState(500);
  const [minSeverity, setMinSeverity] = useState<Severity>('Low');
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) {
      setError('Enter valid lat/lng coordinates.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const wa = await watchAreasApi.create({
        lat: latNum,
        lng: lngNum,
        radius_m: radiusM,
        min_severity: minSeverity,
        email_enabled: emailEnabled,
      });
      onCreated(wa);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create watch area');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="watch-area-form" onSubmit={handleSubmit}>
      <h3>New Alert Area</h3>
      {error && <p className="error-msg">{error}</p>}

      <label>
        Latitude
        <input
          type="number"
          step="any"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          placeholder="e.g. 40.7128"
          required
        />
      </label>

      <label>
        Longitude
        <input
          type="number"
          step="any"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          placeholder="e.g. -74.0060"
          required
        />
      </label>

      <label>
        Radius: {radiusM}m
        <input
          type="range"
          min={100}
          max={5000}
          step={100}
          value={radiusM}
          onChange={(e) => setRadiusM(Number(e.target.value))}
        />
      </label>

      <label>
        Minimum severity
        <select
          value={minSeverity}
          onChange={(e) => setMinSeverity(e.target.value as Severity)}
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="toggle-label">
        <input
          type="checkbox"
          checked={emailEnabled}
          onChange={(e) => setEmailEnabled(e.target.checked)}
        />
        Email alerts enabled
      </label>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Saving…' : 'Save alert area'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
