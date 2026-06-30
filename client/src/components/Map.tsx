import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Base Leaflet map with OpenStreetMap tiles (free, no API key).
 * Reference: https://leafletjs.com/reference.html
 *
 * Team Member #5: add hazard pins (severity-colored markers + radius circles)
 * and a fetch-on-`moveend` handler that loads pins near the viewport center.
 */
interface MapProps {
  /** Initial map center as [lat, lng]. Defaults to Research Park, Champaign IL. */
  center?: [number, number];
  /** Initial zoom level. */
  zoom?: number;
}

export default function Map({
  center = [40.0925, -88.2364],
  zoom = 15,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current).setView(center, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Initialize once on mount; center/zoom are read on first render only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className='map' />;
}
