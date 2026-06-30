import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { pinsApi } from '../api/pins.js';
import { useAuth } from '../contexts/AuthContext.js';
import { haversineMeters } from '../lib/geo.js';
import type { Pin, Severity } from '../types/domain.js';

/**
 * PinPoint map — OWNER: Team Member #5 (Frontend Map Lead).
 *
 * Leaflet + OpenStreetMap tiles (free, no API key). Responsibilities:
 *  - Render active hazard pins as severity-colored markers + radius circles.
 *  - Re-fetch pins on map `moveend` using the viewport center + radius.
 *  - Report flow: place/drag a pin, pick radius + severity, add an optional
 *    description/photo, and submit (works logged-out as an anonymous report).
 *
 * Reference: https://leafletjs.com/reference.html
 */
interface MapViewProps {
  /** Called when a pin marker is clicked (or cleared). Parent renders the VoteCard. */
  onPinSelect: (pin: Pin | null) => void;
  /** Pin id whose radius should be visible on the map. */
  selectedPinId?: string | null;
  /** Live GPS position, used to center the map once and draw a "you" marker. */
  userPosition: { lat: number; lng: number } | null;
  /** Bump to force a pins re-fetch (e.g. after a vote or delete elsewhere). */
  refreshKey?: number;
  /** Initial map center as [lat, lng]. Defaults to Research Park, Champaign IL. */
  center?: [number, number];
  /** Initial zoom level. */
  zoom?: number;
}

interface DestinationSearchResult {
  lat: number;
  lng: number;
  label: string;
}

const SEVERITIES: Severity[] = ['Low', 'Medium', 'High'];
const SEVERITY_COLOR: Record<Severity, string> = {
  Low: '#22c55e',
  Medium: '#f97316',
  High: '#ef4444',
};
const PIN_RADIUS_PANE = 'pin-radius-pane';

/** Draggable report marker — a divIcon avoids Leaflet's missing-image asset issue. */
const reportIcon = L.divIcon({
  className: 'report-pin-icon',
  html: '<div class="report-pin">📍</div>',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

export default function Map({
  onPinSelect,
  selectedPinId = null,
  userPosition,
  refreshKey = 0,
  center = [40.0925, -88.2364],
  zoom = 15,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pinsLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const reportMarkerRef = useRef<L.Marker | null>(null);
  const reportCircleRef = useRef<L.Circle | null>(null);
  const hasCenteredRef = useRef(false);

  // Latest callbacks read inside imperative Leaflet handlers.
  const onPinSelectRef = useRef(onPinSelect);
  onPinSelectRef.current = onPinSelect;
  const fetchPinsRef = useRef<() => void>(() => {});

  const { user } = useAuth();
  const [pins, setPins] = useState<Pin[]>([]);

  // ── Report flow state ──
  const [reportMode, setReportMode] = useState(false);
  const [reportLatLng, setReportLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [reportRadius, setReportRadius] = useState(100);
  const [reportSeverity, setReportSeverity] = useState<Severity>('Medium');
  const [reportName, setReportName] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reportError, setReportError] = useState('');

  const [destinationQuery, setDestinationQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DestinationSearchResult[]>([]);
  const [searchingDestinations, setSearchingDestinations] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [destinationLabel, setDestinationLabel] = useState('');
  const [routePath, setRoutePath] = useState<Array<[number, number]>>([]);
  const [routeInfo, setRouteInfo] = useState<{ distanceM: number; durationS: number } | null>(
    null,
  );
  const [routeHazards, setRouteHazards] = useState<Pin[]>([]);
  const [routeError, setRouteError] = useState('');

  const fetchPins = useCallback(async () => {
    try {
      const result = await pinsApi.list();
      setPins(result);
    } catch {
      // Pins API may still be a stub (501) or unreachable — keep the map usable.
    }
  }, []);
  fetchPinsRef.current = fetchPins;

  // ── Initialize the Leaflet map once ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(center, zoom);
    // CARTO Voyager basemap (free, no API key, OpenStreetMap data). The official
    // tile.openstreetmap.org servers are blocked on some networks/firewalls.
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      },
    ).addTo(map);

    const radiusPane = map.createPane(PIN_RADIUS_PANE);
    radiusPane.style.zIndex = '350';

    pinsLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('click', () => onPinSelectRef.current(null));
    map.on('moveend', () => fetchPinsRef.current());
    fetchPinsRef.current(); // initial load

    return () => {
      map.remove();
      mapRef.current = null;
      pinsLayerRef.current = null;
      routeLayerRef.current = null;
      userMarkerRef.current = null;
      reportMarkerRef.current = null;
      reportCircleRef.current = null;
    };
    // Initialize once on mount; center/zoom are read on first render only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-fetch when asked (vote/delete elsewhere) ──
  useEffect(() => {
    if (refreshKey > 0) fetchPins();
  }, [refreshKey, fetchPins]);

  // ── Center on the user once their position is known + draw a "you" marker ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userPosition) return;

    if (!hasCenteredRef.current) {
      map.setView([userPosition.lat, userPosition.lng], zoom);
      hasCenteredRef.current = true;
    }

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userPosition.lat, userPosition.lng]);
    } else {
      userMarkerRef.current = L.circleMarker([userPosition.lat, userPosition.lng], {
        radius: 6,
        color: '#fff',
        weight: 2,
        fillColor: '#3b82f6',
        fillOpacity: 1,
      })
        .addTo(map)
        .bindTooltip('You are here');
    }
  }, [userPosition, zoom]);

  // ── Render pins (markers + selected radius circle) ──
  useEffect(() => {
    const layer = pinsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const pin of pins) {
      const color = SEVERITY_COLOR[pin.severity];

      if (pin.id === selectedPinId) {
        L.circle([pin.lat, pin.lng], {
          pane: PIN_RADIUS_PANE,
          radius: pin.radius_m,
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.1,
          interactive: false,
        }).addTo(layer);
      }

      const marker = L.circleMarker([pin.lat, pin.lng], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      }).addTo(layer);

      marker.bindTooltip(
        `<strong>${pin.severity}</strong>${pin.name ? ` · ${escapeHtml(pin.name)}` : ''}`,
      );
      marker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        onPinSelectRef.current(pin);
      });
    }
  }, [pins, selectedPinId]);

  useEffect(() => {
    if (routePath.length < 2) {
      setRouteHazards([]);
      return;
    }
    const hazards = pins.filter((pin) => routeIntersectsPinArea(routePath, pin));
    setRouteHazards(hazards);
  }, [pins, routePath]);

  // ── Toggle the draggable report marker + preview circle ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (reportMode && reportLatLng) {
      if (!reportMarkerRef.current) {
        const marker = L.marker([reportLatLng.lat, reportLatLng.lng], {
          icon: reportIcon,
          draggable: true,
          zIndexOffset: 1000,
        }).addTo(map);
        marker.on('drag', () => {
          const ll = marker.getLatLng();
          reportCircleRef.current?.setLatLng(ll);
        });
        marker.on('dragend', () => {
          const ll = marker.getLatLng();
          setReportLatLng({ lat: ll.lat, lng: ll.lng });
        });
        reportMarkerRef.current = marker;
      }
      if (!reportCircleRef.current) {
        reportCircleRef.current = L.circle([reportLatLng.lat, reportLatLng.lng], {
          pane: PIN_RADIUS_PANE,
          radius: reportRadius,
          color: SEVERITY_COLOR[reportSeverity],
          weight: 2,
          dashArray: '6 6',
          fillColor: SEVERITY_COLOR[reportSeverity],
          fillOpacity: 0.12,
          interactive: false,
        }).addTo(map);
      }
    } else {
      reportMarkerRef.current?.remove();
      reportMarkerRef.current = null;
      reportCircleRef.current?.remove();
      reportCircleRef.current = null;
    }
    // reportLatLng updates from dragging are reflected directly on the layers,
    // so only the mode toggle needs to create/destroy them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportMode]);

  // ── Keep the preview circle in sync with radius/severity/position ──
  useEffect(() => {
    const circle = reportCircleRef.current;
    if (!circle || !reportLatLng) return;
    circle.setRadius(reportRadius);
    circle.setStyle({
      color: SEVERITY_COLOR[reportSeverity],
      fillColor: SEVERITY_COLOR[reportSeverity],
    });
    circle.setLatLng([reportLatLng.lat, reportLatLng.lng]);
    reportMarkerRef.current?.setLatLng([reportLatLng.lat, reportLatLng.lng]);
  }, [reportRadius, reportSeverity, reportLatLng]);

  function startReport() {
    const map = mapRef.current;
    if (!map) return;
    onPinSelect(null); // close any open VoteCard
    const start = userPosition ?? {
      lat: map.getCenter().lat,
      lng: map.getCenter().lng,
    };
    setReportLatLng(start);
    setReportName('');
    setReportDescription('');
    setReportError('');
    setReportMode(true);
    map.panTo([start.lat, start.lng]);
  }

  function cancelReport() {
    setReportMode(false);
    setReportLatLng(null);
    setReportError('');
  }

  function recenterOnUser() {
    const map = mapRef.current;
    if (!map || !userPosition) return;
    map.flyTo([userPosition.lat, userPosition.lng], Math.max(map.getZoom(), 16));
  }

  function clearNavigation() {
    routeLayerRef.current?.clearLayers();
    setRoutePath([]);
    setRouteInfo(null);
    setRouteHazards([]);
    setRouteError('');
    setDestinationLabel('');
    setSearchResults([]);
  }

  async function navigateToDestination(destination: DestinationSearchResult) {
    if (!userPosition) {
      setRouteError('Enable location to start navigation.');
      return;
    }

    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;
    if (!map || !routeLayer) return;

    setNavigating(true);
    setRouteError('');

    try {
      const routeUrl =
        'https://router.project-osrm.org/route/v1/foot/' +
        `${userPosition.lng},${userPosition.lat};${destination.lng},${destination.lat}` +
        '?overview=full&geometries=geojson';

      const routeResponse = await fetch(routeUrl);
      if (!routeResponse.ok) {
        throw new Error(`Routing request failed (${routeResponse.status})`);
      }

      const payload = (await routeResponse.json()) as {
        routes?: Array<{
          distance: number;
          duration: number;
          geometry: { coordinates: [number, number][] };
        }>;
      };

      const route = payload.routes?.[0];
      if (!route || !route.geometry?.coordinates?.length) {
        throw new Error('No route found for this destination.');
      }

      const latLngs = route.geometry.coordinates.map(
        ([lng, lat]) => [lat, lng] as [number, number],
      );

      routeLayer.clearLayers();
      const polyline = L.polyline(latLngs, {
        color: '#2563eb',
        weight: 5,
        opacity: 0.92,
      }).addTo(routeLayer);

      L.circleMarker([userPosition.lat, userPosition.lng], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: '#2563eb',
        fillOpacity: 1,
      })
        .addTo(routeLayer)
        .bindTooltip('Start');

      L.circleMarker([destination.lat, destination.lng], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#0ea5e9',
        fillOpacity: 1,
      })
        .addTo(routeLayer)
        .bindTooltip('Destination');

      map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
      setRoutePath(latLngs);
      setRouteInfo({ distanceM: route.distance, durationS: route.duration });
      setDestinationLabel(destination.label);
      setSearchResults([]);
    } catch (error) {
      clearNavigation();
      setRouteError(error instanceof Error ? error.message : 'Failed to start navigation');
    } finally {
      setNavigating(false);
    }
  }

  async function searchDestinations() {
    if (!destinationQuery.trim()) {
      setRouteError('Enter a destination to search.');
      setSearchResults([]);
      return;
    }

    const map = mapRef.current;
    if (!map) return;

    setSearchingDestinations(true);
    setRouteError('');
    setSearchResults([]);

    try {
      const query = destinationQuery.trim();
      const parseResults = (
        geocodeData: Array<{ lat: string; lon: string; display_name: string }>,
      ) =>
        geocodeData
          .map((item) => ({
            lat: Number(item.lat),
            lng: Number(item.lon),
            label: item.display_name,
          }))
          .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));

      const fetchNominatim = async (url: string) => {
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`Destination search failed (${response.status})`);
        }

        return (await response.json()) as Array<{
          lat: string;
          lon: string;
          display_name: string;
        }>;
      };

      let results: DestinationSearchResult[] = [];

      // First pass: bias strongly to the user's local region (~140km box).
      if (userPosition) {
        const latDelta = 1.25;
        const lngDelta = 1.6;
        const localUrl =
          'https://nominatim.openstreetmap.org/search?' +
          `format=json&limit=8&q=${encodeURIComponent(query)}` +
          `&viewbox=${userPosition.lng - lngDelta},${userPosition.lat + latDelta},${userPosition.lng + lngDelta},${userPosition.lat - latDelta}` +
          '&bounded=1';

        const localData = await fetchNominatim(localUrl);
        results = parseResults(localData).sort(
          (a, b) =>
            haversineMeters(userPosition.lat, userPosition.lng, a.lat, a.lng) -
            haversineMeters(userPosition.lat, userPosition.lng, b.lat, b.lng),
        );
      }

      // Fallback: global search only when nearby search is empty.
      if (results.length === 0) {
        const bounds = map.getBounds();
        const globalUrl =
          'https://nominatim.openstreetmap.org/search?' +
          `format=json&limit=8&q=${encodeURIComponent(query)}` +
          `&viewbox=${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
        const globalData = await fetchNominatim(globalUrl);
        results = parseResults(globalData);
      }

      if (results.length === 0) {
        throw new Error('No matching destinations found. Try a more specific query.');
      }

      setSearchResults(results);
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : 'Failed to search destination');
    } finally {
      setSearchingDestinations(false);
    }
  }

  async function submitReport() {
    if (!reportLatLng) return;
    setSubmitting(true);
    setReportError('');
    try {
      await pinsApi.create({
        lat: reportLatLng.lat,
        lng: reportLatLng.lng,
        name: reportName.trim() || undefined,
        description: reportDescription.trim() || undefined,
        severity: reportSeverity,
        radius_m: reportRadius,
      });
      cancelReport();
      fetchPins();
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Failed to create pin');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="map-view">
      <div ref={containerRef} className="map" />

      <button
        className="locate-fab"
        onClick={recenterOnUser}
        disabled={!userPosition}
        title={userPosition ? 'Center on my location' : 'Locating…'}
        aria-label="Center on my location"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="7" />
          <line x1="12" y1="1.5" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22.5" />
          <line x1="1.5" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="22.5" y2="12" />
        </svg>
      </button>

      {!reportMode && (
        <div className="nav-panel">
          <label className="nav-label" htmlFor="destination-input">
            Navigate to
          </label>
          <div className="nav-row">
            <input
              id="destination-input"
              className="nav-input"
              type="text"
              placeholder="Search destination, e.g. Walmart"
              value={destinationQuery}
              onChange={(e) => setDestinationQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void searchDestinations();
                }
              }}
            />
            <button
              className="btn btn-primary"
              onClick={() => void searchDestinations()}
              disabled={searchingDestinations || navigating}
            >
              {searchingDestinations ? 'Searching…' : 'Search'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={clearNavigation}
              disabled={navigating && routePath.length === 0}
            >
              Clear
            </button>
          </div>
          {searchResults.length > 0 && (
            <ul className="nav-results">
              {searchResults.map((result, index) => (
                <li key={`${result.label}-${index}`} className="nav-result-item">
                  <button
                    className="nav-result-main"
                    onClick={() => {
                      setDestinationQuery(result.label);
                      void navigateToDestination(result);
                    }}
                    disabled={navigating}
                  >
                    {result.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {destinationLabel && <p className="nav-destination">To: {destinationLabel}</p>}
        </div>
      )}

      {routeInfo && !reportMode && (
        <div className="route-chip" role="status" aria-live="polite">
          Route: {formatDistance(routeInfo.distanceM)} • {formatDuration(routeInfo.durationS)}
          {routeHazards.length > 0 ? ` • ⚠ ${routeHazards.length} hazard area(s) ahead` : ' • No hazard areas on route'}
        </div>
      )}

      {!reportMode && routeHazards.length > 0 && (
        <div className="route-chip route-chip-warning" role="status" aria-live="polite">
          Warning: route passes through {routeHazards.length} hazard area(s). Highest severity:{' '}
          {highestSeverity(routeHazards)}.
        </div>
      )}

      {routeError && !reportMode && (
        <div className="route-chip route-chip-error" role="status" aria-live="polite">
          {routeError}
        </div>
      )}

      {!reportMode && (
        <button className="btn btn-primary report-fab" onClick={startReport}>
          📍 Report hazard
        </button>
      )}

      {reportMode && (
        <div className="report-panel">
          <h3 className="report-title">Report a hazard</h3>
          <p className="report-hint">Drag the 📍 marker to the exact spot.</p>

          <label className="report-field">
            Radius: {reportRadius}m
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={reportRadius}
              onChange={(e) => setReportRadius(Number(e.target.value))}
            />
          </label>

          <label className="report-field">
            Severity
            <select
              value={reportSeverity}
              onChange={(e) => setReportSeverity(e.target.value as Severity)}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="report-field">
            Name (optional)
            <input
              type="text"
              value={reportName}
              maxLength={80}
              placeholder="e.g. Broken glass"
              onChange={(e) => setReportName(e.target.value)}
            />
          </label>

          <label className="report-field">
            Description (optional)
            <textarea
              value={reportDescription}
              maxLength={280}
              rows={2}
              placeholder="What's the hazard?"
              onChange={(e) => setReportDescription(e.target.value)}
            />
          </label>

          {reportError && <p className="error-msg">{reportError}</p>}

          {!user && (
            <p className="report-anon-hint">
              Reporting anonymously — this pin expires in 1 hour. Sign in for
              persistent pins and voting.
            </p>
          )}

          <div className="report-actions">
            <button
              className="btn btn-primary"
              onClick={submitReport}
              disabled={submitting}
            >
              {submitting ? 'Dropping…' : 'Drop pin'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={cancelReport}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDistance(distanceM: number): string {
  if (distanceM < 1000) {
    return `${Math.round(distanceM)} m`;
  }
  return `${(distanceM / 1000).toFixed(1)} km`;
}

function formatDuration(durationS: number): string {
  const minutes = Math.max(1, Math.round(durationS / 60));
  if (minutes < 60) {
    return `~${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `~${hours}h ${mins}m` : `~${hours}h`;
}

function highestSeverity(pins: Array<Pick<Pin, 'severity'>>): Severity {
  const rank: Record<Severity, number> = {
    Low: 1,
    Medium: 2,
    High: 3,
  };

  let top: Severity = 'Low';
  for (const pin of pins) {
    if (rank[pin.severity] > rank[top]) {
      top = pin.severity;
    }
  }
  return top;
}

function routeIntersectsPinArea(
  route: Array<[number, number]>,
  pin: Pick<Pin, 'lat' | 'lng' | 'radius_m'>,
): boolean {
  if (route.length < 2) {
    return false;
  }

  for (let i = 1; i < route.length; i += 1) {
    const [lat1, lng1] = route[i - 1];
    const [lat2, lng2] = route[i];

    const segmentDistance = pointToSegmentMeters(
      pin.lat,
      pin.lng,
      lat1,
      lng1,
      lat2,
      lng2,
    );

    if (segmentDistance <= pin.radius_m) {
      return true;
    }
  }

  return false;
}

function pointToSegmentMeters(
  pointLat: number,
  pointLng: number,
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): number {
  if (startLat === endLat && startLng === endLng) {
    return haversineMeters(pointLat, pointLng, startLat, startLng);
  }

  const refLatRad = (pointLat * Math.PI) / 180;
  const metersPerDegLat = 111_132;
  const metersPerDegLng = 111_320 * Math.cos(refLatRad);

  const px = pointLng * metersPerDegLng;
  const py = pointLat * metersPerDegLat;
  const ax = startLng * metersPerDegLng;
  const ay = startLat * metersPerDegLat;
  const bx = endLng * metersPerDegLng;
  const by = endLat * metersPerDegLat;

  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby;

  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  const closestX = ax + t * abx;
  const closestY = ay + t * aby;

  return Math.hypot(px - closestX, py - closestY);
}

/** Minimal HTML escape for tooltip content built from user-provided pin names. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
