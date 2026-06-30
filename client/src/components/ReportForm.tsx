import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { pinsApi } from '../api/pins.js';
import type { CreatePinPayload } from '../api/pins.js';
import { useAuth } from '../contexts/AuthContext.js';
import type { Pin, Severity } from '../types/domain.js';

interface ReportFormProps {
  initialLat: number | null;
  initialLng: number | null;
  onSubmit: (pin: Pin) => void;
  onCancel: () => void;
}

const SEVERITY_COLOR: Record<Severity, string> = {
  Low: '#22c55e',
  Medium: '#f97316',
  High: '#ef4444',
};

export function ReportForm({ initialLat, initialLng, onSubmit, onCancel }: ReportFormProps) {
  const { user } = useAuth();
  const [severity, setSeverity] = useState<Severity>('Medium');
  const [radiusM, setRadiusM] = useState(20);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (initialLat == null || initialLng == null) {
      setError('Click on the map to place your pin first.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload: CreatePinPayload = {
        lat: initialLat,
        lng: initialLng,
        severity,
        radius_m: radiusM,
        ...(name.trim() && { name: name.trim() }),
        ...(description.trim() && { description: description.trim() }),
      };
      const pin = await pinsApi.create(payload);
      if (photoFile) {
        pinsApi.uploadPhoto(pin.id, photoFile).catch(() => null);
      }
      onSubmit(pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report.');
      setSubmitting(false);
    }
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onCancel();
  }

  return (
    <div className="report-form-overlay" onClick={handleOverlayClick}>
      <div className="report-form" role="dialog" aria-modal="true" aria-label="Report a hazard">
        <div className="report-form-header">
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Report a hazard</h2>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>
            ✕
          </button>
        </div>

        {!user && (
          <p className="report-anon-hint">
            Anonymous pins expire in 1 hour.{' '}
            <Link to="/register">Sign in</Link> for persistent pins and voting.
          </p>
        )}

        {initialLat == null ? (
          <p className="report-location-prompt">Click on the map to place your pin.</p>
        ) : (
          <p className="report-location-display">
            📍 {initialLat.toFixed(5)}, {initialLng!.toFixed(5)}
          </p>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Severity
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity)}
              className="report-select"
            >
              <option value="Low">🟢 Low</option>
              <option value="Medium">🟠 Medium</option>
              <option value="High">🔴 High</option>
            </select>
          </label>

          <label>
            Radius:{' '}
            <span className="radius-display" style={{ color: SEVERITY_COLOR[severity] }}>
              {radiusM}m
            </span>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={radiusM}
              onChange={(e) => setRadiusM(Number(e.target.value))}
            />
          </label>

          <label>
            Name <span className="field-optional">(optional)</span>
            <input
              type="text"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Broken sidewalk"
            />
          </label>

          <label>
            Description <span className="field-optional">(optional)</span>
            <textarea
              maxLength={300}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the hazard…"
              rows={3}
              className="report-textarea"
            />
          </label>

          <label>
            Photo <span className="field-optional">(optional)</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              className="report-file-input"
            />
          </label>

          {error && <p className="error-msg">{error}</p>}

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || initialLat == null}
              style={{ flex: 1 }}
            >
              {submitting ? 'Submitting…' : 'Submit report'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
