import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { haversineMeters } from '../lib/geo.js';

/** Only push an update once the user has moved at least this far. */
const MIN_DISTANCE_M = 50;
/** ...and never more often than this, to avoid hammering the API. */
const MIN_INTERVAL_MS = 60_000;

/**
 * Continuously syncs a logged-in, opted-in user's live location to the server
 * while the app is open, so proximity alerts target their current position.
 *
 * Note: browsers only provide geolocation while the tab is open and focused;
 * there is no reliable background tracking for a web app.
 *
 * Renders nothing.
 */
export function LiveLocationSync() {
  const { user, updateLocation } = useAuth();
  const lastSentRef = useRef<{ lat: number; lng: number; at: number } | null>(
    null,
  );
  const inFlightRef = useRef(false);

  // Gated on the user's alerts_enabled preference (toggle in the NavBar).
  const enabled = !!user && user.alerts_enabled;

  useEffect(() => {
    if (!enabled || !navigator.geolocation) return;

    // Seed from the saved location so we don't immediately re-send the same point.
    lastSentRef.current =
      user!.lat != null && user!.lng != null
        ? { lat: user!.lat, lng: user!.lng, at: 0 }
        : null;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const now = Date.now();
        const last = lastSentRef.current;
        const movedEnough =
          !last ||
          haversineMeters(last.lat, last.lng, lat, lng) >= MIN_DISTANCE_M;
        const intervalOk = !last || now - last.at >= MIN_INTERVAL_MS;

        if (movedEnough && intervalOk && !inFlightRef.current) {
          inFlightRef.current = true;
          updateLocation(lat, lng)
            .then(() => {
              lastSentRef.current = { lat, lng, at: Date.now() };
            })
            .catch(() => {
              /* keep the previous marker so we retry on the next reading */
            })
            .finally(() => {
              inFlightRef.current = false;
            });
        }
      },
      () => {
        /* ignore transient geolocation errors; watch keeps retrying */
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 30_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
    // Re-subscribe only when opt-in state flips; updateLocation is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return null;
}
