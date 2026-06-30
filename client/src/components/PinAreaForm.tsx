import { useState } from 'react';
import { pinsApi } from '../api/pins.js';
import type { Pin, Severity } from '../types/domain.js';

interface PinAreaFormProps {
  defaultLat?: number;
  defaultLng?: number;
  onCreated: (pin: Pin) => void;
  onCancel: () => void;
}

const SEVERITIES: Severity[] = ['Low', 'Medium', 'High'];

export function PinAreaForm({ defaultLat, defaultLng, onCreated, onCancel }: PinAreaFormProps) {
  const [lat, setLat] = useState(defaultLat?.toFixed(6) ?? '');
  const [lng, setLng] = useState(defaultLng?.toFixed(6) ?? '');
  const [radiusM, setRadiusM] = useState(500);
  const [severity, setSeverity] = useState<Severity>('Low');
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
      const pin = await pinsApi.create({
        lat: latNum,
        lng: lngNum,
        radius_m: radiusM,
        severity,
      });
      onCreated(pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pin area');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="pin-area-form" onSubmit={handleSubmit}>
      <h3>New Pin Area</h3>
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
        Severity
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as Severity)}
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Saving…' : 'Save pin area'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}