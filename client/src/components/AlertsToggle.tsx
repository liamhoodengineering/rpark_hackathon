import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.js';

/**
 * NavBar switch that toggles the user's `alerts_enabled` preference. When on,
 * `LiveLocationSync` continuously pushes the user's position while the app is
 * open and the server emails them about nearby hazards.
 */
export function AlertsToggle() {
  const { user, setTracking, updateLocation } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  const enabled = user.alerts_enabled;

  /**
   * Grab a fresh GPS fix and push it to the server. Best-effort: a denied
   * permission or timeout must not prevent the toggle from switching.
   */
  async function captureCurrentLocation() {
    if (!navigator.geolocation) return;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15_000,
        });
      });
      await updateLocation(pos.coords.latitude, pos.coords.longitude);
    } catch {
      /* ignore: user may deny permission or the fix may time out */
    }
  }

  async function toggle() {
    const turningOn = !enabled;
    setBusy(true);
    try {
      await setTracking(turningOn);
      // Refresh the saved location immediately when alerts are enabled so
      // proximity matching uses the user's current position right away.
      if (turningOn) {
        await captureCurrentLocation();
      }
    } catch {
      /* leave the switch in its previous state on failure */
    } finally {
      setBusy(false);
    }
  }

  return (
    <label
      className={`alerts-toggle${busy ? ' switch-busy' : ''}`}
      title='Get an email when a new hazard is reported near you'
    >
      <span className='alerts-toggle-text'>Email Alerts</span>
      <span className={`switch${enabled ? ' switch-on' : ''}`}>
        <input
          type='checkbox'
          checked={enabled}
          onChange={toggle}
          disabled={busy}
        />
        <span className='switch-track' aria-hidden='true'>
          <span className='switch-thumb' />
        </span>
      </span>
    </label>
  );
}
