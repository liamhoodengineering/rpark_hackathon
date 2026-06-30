import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.js';

/**
 * NavBar switch that toggles the user's `alerts_enabled` preference. When on,
 * `LiveLocationSync` continuously pushes the user's position while the app is
 * open and the server emails them about nearby hazards.
 */
export function AlertsToggle() {
  const { user, setTracking } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  const enabled = user.alerts_enabled;

  async function toggle() {
    setBusy(true);
    try {
      await setTracking(!enabled);
    } catch {
      /* leave the switch in its previous state on failure */
    } finally {
      setBusy(false);
    }
  }

  return (
    <label
      className='alerts-toggle'
      title='Share your live location while the app is open to get nearby-hazard alerts'
    >
      <input
        type='checkbox'
        checked={enabled}
        onChange={toggle}
        disabled={busy}
      />
      <span>Nearby alerts</span>
    </label>
  );
}
