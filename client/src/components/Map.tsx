import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type RouteMode = 'drive' | 'walk' | 'bike';
type SeverityFilter = 'high_and_lower' | 'medium_and_lower' | 'low';
type TimeFilter = 'all' | '5m' | '10m' | '30m' | '1h' | '2h' | '6h' | '12h';

interface RouteResult {
  distance: number;
  duration: number;
  coordinates: [number, number][];
}

interface RouteOption {
  id: string;
  distanceM: number;
  durationS: number;
  path: Array<[number, number]>;
  hazards: Pin[];
  score: number;
  routeLabel: string;
}

const SEVERITIES: Severity[] = ['Low', 'Medium', 'High'];
const SEVERITY_COLOR: Record<Severity, string> = {
  Low: '#22c55e',
  Medium: '#f97316',
  High: '#ef4444',
};
const PIN_RADIUS_PANE = 'pin-radius-pane';
const ROUTE_HAZARD_RADIUS_MULTIPLIER = 1.35;
const OFF_ROUTE_THRESHOLD_M = 70;
const MIN_MOVE_FOR_REROUTE_M = 45;
const REROUTE_COOLDOWN_MS = 12_000;

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
  const [severityFilter, setSeverityFilter] =
    useState<SeverityFilter>('high_and_lower');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');

  // ── Report flow state ──
  const [reportMode, setReportMode] = useState(false);
  const [reportLatLng, setReportLatLng] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [reportRadius, setReportRadius] = useState(100);
  const [reportSeverity, setReportSeverity] = useState<Severity>('Medium');
  const [reportExpiresHours, setReportExpiresHours] = useState(24);
  const [reportName, setReportName] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reportError, setReportError] = useState('');

  const [destinationQuery, setDestinationQuery] = useState('');
  const [routeMode, setRouteMode] = useState<RouteMode>('drive');
  const [routeSafety, setRouteSafety] = useState<'fast' | 'safe'>('fast');
  const forceAvoidPinAreas = routeSafety === 'safe';
  const [searchResults, setSearchResults] = useState<DestinationSearchResult[]>(
    [],
  );
  const [searchingDestinations, setSearchingDestinations] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [activeDestination, setActiveDestination] =
    useState<DestinationSearchResult | null>(null);
  const [destinationLabel, setDestinationLabel] = useState('');
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showRouteHazards, setShowRouteHazards] = useState(false);
  const [routeError, setRouteError] = useState('');
  const lastRerouteAtRef = useRef(0);
  const lastReroutePositionRef = useRef<{ lat: number; lng: number } | null>(
    null,
  );

  const selectedRoute =
    routeOptions.find((route) => route.id === selectedRouteId) ??
    routeOptions[0] ??
    null;

  const filteredPins = useMemo(() => {
    const nowMs = Date.now();
    const maxAgeMs = timeFilterToMs(timeFilter);

    return pins.filter((pin) => {
      if (!matchesSeverityFilter(pin.severity, severityFilter)) {
        return false;
      }

      if (maxAgeMs !== null) {
        const createdAtMs = new Date(pin.created_at).getTime();
        if (!Number.isFinite(createdAtMs) || nowMs - createdAtMs > maxAgeMs) {
          return false;
        }
      }

      return true;
    });
  }, [pins, severityFilter, timeFilter]);

  const selectedRouteHazardIds = new Set(
    selectedRoute?.hazards.map((hazard) => hazard.id) ?? [],
  );

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
      userMarkerRef.current = L.circleMarker(
        [userPosition.lat, userPosition.lng],
        {
          radius: 6,
          color: '#fff',
          weight: 2,
          fillColor: '#3b82f6',
          fillOpacity: 1,
        },
      )
        .addTo(map)
        .bindTooltip('You are here');
    }
  }, [userPosition, zoom]);

  // ── Render pins (markers + selected radius circle) ──
  useEffect(() => {
    const layer = pinsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const pin of filteredPins) {
      const color = SEVERITY_COLOR[pin.severity];

      const shouldShowSelectedRadius = pin.id === selectedPinId;
      const shouldShowRouteHazardRadius =
        showRouteHazards && selectedRouteHazardIds.has(pin.id);

      if (shouldShowSelectedRadius || shouldShowRouteHazardRadius) {
        const radius = shouldShowRouteHazardRadius
          ? pin.radius_m * ROUTE_HAZARD_RADIUS_MULTIPLIER
          : pin.radius_m;

        L.circle([pin.lat, pin.lng], {
          pane: PIN_RADIUS_PANE,
          radius,
          color,
          weight: shouldShowRouteHazardRadius ? 2 : 1,
          dashArray: shouldShowRouteHazardRadius ? '7 5' : undefined,
          fillColor: color,
          fillOpacity: shouldShowRouteHazardRadius ? 0.18 : 0.1,
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

      marker.bindTooltip(escapeHtml(pin.name?.trim() || 'Hazard'), {
        direction: 'top',
        offset: [0, -8],
      });
      marker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        onPinSelectRef.current(pin);
      });
    }
  }, [filteredPins, selectedPinId, selectedRouteHazardIds, showRouteHazards]);

  useEffect(() => {
    setRouteOptions((currentRoutes) => {
      if (currentRoutes.length === 0) {
        return currentRoutes;
      }

      const rescoredRoutes = rankRouteOptions(
        currentRoutes.map((route) => ({
          distance: route.distanceM,
          duration: route.durationS,
          coordinates: route.path.map(
            ([lat, lng]) => [lng, lat] as [number, number],
          ),
        })),
        filteredPins,
        { forceAvoidPinAreas },
      );

      return rescoredRoutes;
    });
  }, [filteredPins, forceAvoidPinAreas]);

  useEffect(() => {
    if (routeOptions.length === 0) {
      return;
    }

    setSelectedRouteId((currentId) => {
      if (currentId && routeOptions.some((route) => route.id === currentId)) {
        return currentId;
      }

      return routeOptions[0].id;
    });
  }, [routeOptions]);

  useEffect(() => {
    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;
    if (!map || !routeLayer) return;

    routeLayer.clearLayers();

    if (!selectedRoute || !userPosition || !activeDestination) {
      return;
    }

    const routeBounds = L.latLngBounds(selectedRoute.path);

    for (const route of routeOptions) {
      const isSelected = route.id === selectedRoute.id;

      L.polyline(route.path, {
        color: isSelected ? '#2563eb' : '#64748b',
        weight: isSelected ? 5 : 4,
        opacity: isSelected ? 0.94 : 0.5,
        dashArray: isSelected ? undefined : '10 8',
      }).addTo(routeLayer);
    }

    L.circleMarker([userPosition.lat, userPosition.lng], {
      radius: 6,
      color: '#ffffff',
      weight: 2,
      fillColor: '#2563eb',
      fillOpacity: 1,
    })
      .addTo(routeLayer)
      .bindTooltip('Start');

    L.circleMarker([activeDestination.lat, activeDestination.lng], {
      radius: 7,
      color: '#ffffff',
      weight: 2,
      fillColor: '#0ea5e9',
      fillOpacity: 1,
    })
      .addTo(routeLayer)
      .bindTooltip('Destination');

    map.fitBounds(routeBounds, { padding: [40, 40] });
  }, [activeDestination, routeOptions, selectedRoute, userPosition]);

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
        reportCircleRef.current = L.circle(
          [reportLatLng.lat, reportLatLng.lng],
          {
            pane: PIN_RADIUS_PANE,
            radius: reportRadius,
            color: SEVERITY_COLOR[reportSeverity],
            weight: 2,
            dashArray: '6 6',
            fillColor: SEVERITY_COLOR[reportSeverity],
            fillOpacity: 0.12,
            interactive: false,
          },
        ).addTo(map);
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
    setReportExpiresHours(user ? 24 : 1);
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
    const pinsLayer = pinsLayerRef.current;
    if (!map || !userPosition) return;

    // Hide the hazard markers + the "you are here" marker during the fly-in so
    // nothing streaks across the screen, then restore them once it settles.
    const userMarkerEl = userMarkerRef.current?.getElement() as
      | SVGElement
      | undefined;
    if (pinsLayer && map.hasLayer(pinsLayer)) map.removeLayer(pinsLayer);
    if (userMarkerEl) userMarkerEl.style.display = 'none';
    map.once('moveend', () => {
      if (pinsLayer && !map.hasLayer(pinsLayer)) pinsLayer.addTo(map);
      if (userMarkerEl) userMarkerEl.style.display = '';
    });

    map.flyTo(
      [userPosition.lat, userPosition.lng],
      Math.max(map.getZoom(), 16),
    );
  }

  function clearNavigation() {
    routeLayerRef.current?.clearLayers();
    setRouteOptions([]);
    setSelectedRouteId(null);
    setShowRouteHazards(false);
    setRouteError('');
    setActiveDestination(null);
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
      const routes = forceAvoidPinAreas
        ? await fetchRoutesWithAvoidance(
            routeMode,
            userPosition,
            destination,
            filteredPins,
          )
        : await fetchRoutesForMode(routeMode, userPosition, destination);
      const rankedRoutes = rankRouteOptions(routes, filteredPins, {
        forceAvoidPinAreas,
      });

      if (rankedRoutes.length === 0) {
        throw new Error('No route found for this destination.');
      }

      routeLayer.clearLayers();
      setRouteOptions(rankedRoutes);
      setSelectedRouteId(rankedRoutes[0].id);
      setShowRouteHazards(false);
      setActiveDestination(destination);
      setDestinationLabel(destination.label);
      setSearchResults([]);
      lastRerouteAtRef.current = Date.now();
      if (userPosition) {
        lastReroutePositionRef.current = {
          lat: userPosition.lat,
          lng: userPosition.lng,
        };
      }
    } catch (error) {
      clearNavigation();
      setRouteError(
        error instanceof Error ? error.message : 'Failed to start navigation',
      );
    } finally {
      setNavigating(false);
    }
  }

  function focusHazardOnMap(hazard: Pin) {
    onPinSelectRef.current(hazard);
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.flyTo([hazard.lat, hazard.lng], Math.max(map.getZoom(), 16));
  }

  useEffect(() => {
    if (!activeDestination || reportMode || navigating) {
      return;
    }
    void navigateToDestination(activeDestination);
    // Re-route when mode changes so duration/distance reflect drive/walk/bike.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeMode, forceAvoidPinAreas]);

  useEffect(() => {
    if (
      !activeDestination ||
      !userPosition ||
      !selectedRoute ||
      reportMode ||
      navigating
    ) {
      return;
    }

    const distanceFromRouteM = distanceFromPointToRouteMeters(
      userPosition.lat,
      userPosition.lng,
      selectedRoute.path,
    );
    if (distanceFromRouteM <= OFF_ROUTE_THRESHOLD_M) {
      return;
    }

    const now = Date.now();
    if (now - lastRerouteAtRef.current < REROUTE_COOLDOWN_MS) {
      return;
    }

    const lastPosition = lastReroutePositionRef.current;
    if (lastPosition) {
      const movedMeters = haversineMeters(
        lastPosition.lat,
        lastPosition.lng,
        userPosition.lat,
        userPosition.lng,
      );
      if (movedMeters < MIN_MOVE_FOR_REROUTE_M) {
        return;
      }
    }

    void navigateToDestination(activeDestination);
    // Reroute only when user meaningfully leaves the current route geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDestination, userPosition, selectedRoute, reportMode, navigating]);

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
          .filter(
            (item) => Number.isFinite(item.lat) && Number.isFinite(item.lng),
          );

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
        throw new Error(
          'No matching destinations found. Try a more specific query.',
        );
      }

      setSearchResults(results);
    } catch (error) {
      setRouteError(
        error instanceof Error ? error.message : 'Failed to search destination',
      );
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
        expires_in_hours: reportExpiresHours,
      });
      cancelReport();
      fetchPins();
    } catch (err) {
      setReportError(
        err instanceof Error ? err.message : 'Failed to create pin',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className='map-window'>
      <div className='map-window-bar'>
        {!reportMode && (
          <div className='map-window-toolbar'>
            <div className='nav-row'>
              <input
                id='destination-input'
                className='nav-input'
                type='text'
                placeholder='Search destination, e.g. Walmart'
                value={destinationQuery}
                onChange={(e) => setDestinationQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void searchDestinations();
                  }
                }}
              />
              <select
                className='nav-mode-select'
                value={routeMode}
                onChange={(e) => setRouteMode(e.target.value as RouteMode)}
                aria-label='Navigation mode'
              >
                <option value='drive'>Drive</option>
                <option value='walk'>Walk</option>
                <option value='bike'>Bike</option>
              </select>
              <select
                className='nav-mode-select'
                value={routeSafety}
                onChange={(e) =>
                  setRouteSafety(e.target.value as 'fast' | 'safe')
                }
                aria-label='Route safety'
              >
                <option value='fast'>Fast</option>
                <option value='safe'>Safe</option>
              </select>
              <button
                className='btn btn-primary'
                onClick={() => void searchDestinations()}
                disabled={searchingDestinations || navigating}
              >
                {searchingDestinations ? 'Searching…' : 'Go'}
              </button>
              <button
                className='btn btn-ghost'
                onClick={clearNavigation}
                disabled={navigating && routeOptions.length === 0}
              >
                Clear
              </button>
            </div>
            <div className='map-filter-group'>
              <label className='map-filter-label' htmlFor='map-filter-severity'>
                Severity
              </label>
              <select
                id='map-filter-severity'
                className='map-filter-select'
                value={severityFilter}
                onChange={(e) =>
                  setSeverityFilter(e.target.value as SeverityFilter)
                }
              >
                <option value='high_and_lower'>All</option>
                <option value='medium_and_lower'>Medium &amp; Low</option>
                <option value='low'>Low only</option>
              </select>
              <label className='map-filter-label' htmlFor='map-filter-time'>
                Time
              </label>
              <select
                id='map-filter-time'
                className='map-filter-select'
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
              >
                <option value='all'>All time</option>
                <option value='5m'>Last 5m</option>
                <option value='10m'>Last 10m</option>
                <option value='30m'>Last 30m</option>
                <option value='1h'>Last 1h</option>
                <option value='2h'>Last 2h</option>
                <option value='6h'>Last 6h</option>
                <option value='12h'>Last 12h</option>
              </select>
            </div>
            <span className='map-filter-count'>
              <span className='live-dot' aria-hidden='true' />
              {filteredPins.length} live
            </span>
          </div>
        )}
      </div>

      <div className='map-window-body'>
        <div ref={containerRef} className='map' />

        <button
          className='locate-fab'
          onClick={recenterOnUser}
          disabled={!userPosition}
          title={userPosition ? 'Center on my location' : 'Locating…'}
          aria-label='Center on my location'
        >
          <svg
            width='22'
            height='22'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth={2}
            strokeLinecap='round'
          >
            <circle cx='12' cy='12' r='3.5' fill='currentColor' stroke='none' />
            <circle cx='12' cy='12' r='7' />
            <line x1='12' y1='1.5' x2='12' y2='4' />
            <line x1='12' y1='20' x2='12' y2='22.5' />
            <line x1='1.5' y1='12' x2='4' y2='12' />
            <line x1='20' y1='12' x2='22.5' y2='12' />
          </svg>
        </button>

        {!reportMode &&
          (searchResults.length > 0 ||
            destinationLabel ||
            routeOptions.length > 0) && (
            <div className='nav-extras'>
              {searchResults.length > 0 && (
                <ul className='nav-results'>
                  {searchResults.map((result, index) => (
                    <li
                      key={`${result.label}-${index}`}
                      className='nav-result-item'
                    >
                      <button
                        className='nav-result-main'
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
              {destinationLabel && (
                <p className='nav-destination'>To: {destinationLabel}</p>
              )}
              {routeOptions.length > 0 && (
                <div className='route-options'>
                  {routeOptions.map((route) => {
                    const isSelected = route.id === selectedRoute?.id;
                    return (
                      <button
                        key={route.id}
                        type='button'
                        className={`route-option${isSelected ? ' route-option-selected' : ''}`}
                        onClick={() => setSelectedRouteId(route.id)}
                      >
                        <span className='route-option-title'>
                          {route.routeLabel}
                        </span>
                        <span className='route-option-meta'>
                          {formatDistance(route.distanceM)} •{' '}
                          {formatDuration(route.durationS)} •{' '}
                          {route.hazards.length} hazard
                          {route.hazards.length === 1 ? '' : 's'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        {selectedRoute && !reportMode && (
          <div className='route-chip' role='status' aria-live='polite'>
            Route ({routeMode}): {formatDistance(selectedRoute.distanceM)} •{' '}
            {formatDuration(selectedRoute.durationS)}
            {selectedRoute.hazards.length > 0
              ? ` • ⚠ ${selectedRoute.hazards.length} hazard area(s) ahead`
              : ' • No hazard areas on route'}
          </div>
        )}

        {!reportMode && selectedRoute && selectedRoute.hazards.length > 0 && (
          <button
            type='button'
            className='route-chip route-chip-warning route-chip-button'
            onClick={() => setShowRouteHazards((current) => !current)}
            aria-expanded={showRouteHazards}
          >
            Warning: route passes through {selectedRoute.hazards.length} hazard
            area(s). Highest severity: {highestSeverity(selectedRoute.hazards)}.{' '}
            {showRouteHazards ? 'Hide hazards' : 'View hazards'}
          </button>
        )}

        {!reportMode &&
          selectedRoute &&
          showRouteHazards &&
          selectedRoute.hazards.length > 0 && (
            <div
              className='route-hazards-panel'
              role='status'
              aria-live='polite'
            >
              <p className='route-hazards-title'>Hazards on selected route</p>
              <ul className='route-hazards-list'>
                {selectedRoute.hazards.map((hazard) => (
                  <li key={hazard.id}>
                    <button
                      type='button'
                      className='route-hazard-item'
                      onClick={() => focusHazardOnMap(hazard)}
                    >
                      <span>
                        {hazard.name?.trim() || 'Unnamed hazard'}
                        {' • '}
                        {hazard.severity}
                      </span>
                      <span>
                        {Math.round(
                          hazard.radius_m * ROUTE_HAZARD_RADIUS_MULTIPLIER,
                        )}
                        m zone
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

        {routeError && !reportMode && (
          <div
            className='route-chip route-chip-error'
            role='status'
            aria-live='polite'
          >
            {routeError}
          </div>
        )}

        {!reportMode && (
          <button className='btn btn-primary report-fab' onClick={startReport}>
            📍 Report hazard
          </button>
        )}

        {reportMode && (
          <div className='report-panel'>
            <h3 className='report-title'>Report a hazard</h3>
            <p className='report-hint'>Drag the 📍 marker to the exact spot.</p>

            <label className='report-field'>
              Radius: {reportRadius}m
              <input
                type='range'
                min={10}
                max={500}
                step={10}
                value={reportRadius}
                onChange={(e) => setReportRadius(Number(e.target.value))}
              />
            </label>

            <label className='report-field'>
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

            <label className='report-field'>
              Expires in: {reportExpiresHours}h
              <input
                type='range'
                min={1}
                max={24}
                step={1}
                value={reportExpiresHours}
                onChange={(e) => setReportExpiresHours(Number(e.target.value))}
              />
            </label>

            <label className='report-field'>
              Name (optional)
              <input
                type='text'
                value={reportName}
                maxLength={80}
                placeholder='e.g. Broken glass'
                onChange={(e) => setReportName(e.target.value)}
              />
            </label>

            <label className='report-field'>
              Description (optional)
              <textarea
                value={reportDescription}
                maxLength={280}
                rows={2}
                placeholder="What's the hazard?"
                onChange={(e) => setReportDescription(e.target.value)}
              />
            </label>

            {reportError && <p className='error-msg'>{reportError}</p>}

            {!user && (
              <p className='report-anon-hint'>
                Reporting anonymously — this pin expires in 1 hour. Sign in for
                persistent pins and voting.
              </p>
            )}

            <div className='report-actions'>
              <button
                className='btn btn-primary'
                onClick={submitReport}
                disabled={submitting}
              >
                {submitting ? 'Dropping…' : 'Drop pin'}
              </button>
              <button
                className='btn btn-ghost'
                onClick={cancelReport}
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
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

function timeFilterToMs(filter: TimeFilter): number | null {
  const MIN = 60 * 1000;
  if (filter === '5m') return 5 * MIN;
  if (filter === '10m') return 10 * MIN;
  if (filter === '30m') return 30 * MIN;
  if (filter === '1h') return 60 * MIN;
  if (filter === '2h') return 120 * MIN;
  if (filter === '6h') return 360 * MIN;
  if (filter === '12h') return 720 * MIN;
  return null;
}

function matchesSeverityFilter(
  severity: Severity,
  filter: SeverityFilter,
): boolean {
  if (filter === 'high_and_lower') {
    return true;
  }
  if (filter === 'medium_and_lower') {
    return severity === 'Medium' || severity === 'Low';
  }
  return severity === 'Low';
}

function routeUrlCandidates(
  mode: RouteMode,
  start: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): string[] {
  const coords = `${start.lng},${start.lat};${destination.lng},${destination.lat}`;
  const suffix = `${coords}?overview=full&geometries=geojson&alternatives=true`;

  if (mode === 'walk') {
    return [
      `https://router.project-osrm.org/route/v1/walking/${suffix}`,
      `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${suffix}`,
    ];
  }

  if (mode === 'bike') {
    return [
      `https://router.project-osrm.org/route/v1/cycling/${suffix}`,
      `https://routing.openstreetmap.de/routed-bike/route/v1/bike/${suffix}`,
    ];
  }

  return [
    `https://router.project-osrm.org/route/v1/driving/${suffix}`,
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${suffix}`,
  ];
}

async function fetchRoutesForMode(
  mode: RouteMode,
  start: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<RouteResult[]> {
  let lastError: Error | null = null;

  for (const url of routeUrlCandidates(mode, start, destination)) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Routing request failed (${response.status})`);
      }

      const payload = (await response.json()) as {
        routes?: Array<{
          distance: number;
          duration: number;
          geometry: { coordinates: [number, number][] };
        }>;
      };

      const routes = (payload.routes ?? [])
        .filter((route) => route.geometry?.coordinates?.length)
        .filter((route) =>
          isRoutePlausibleForMode(mode, route.distance, route.duration),
        );

      if (routes.length === 0) {
        throw new Error('No route found for this destination.');
      }

      return dedupeRoutes(
        routes.map((route) => ({
          distance: route.distance,
          duration: route.duration,
          coordinates: route.geometry.coordinates,
        })),
      );
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error('Route request failed');
    }
  }

  throw lastError ?? new Error('Failed to fetch route for this mode.');
}

function isRoutePlausibleForMode(
  mode: RouteMode,
  distanceM: number,
  durationS: number,
): boolean {
  if (
    !Number.isFinite(distanceM) ||
    !Number.isFinite(durationS) ||
    durationS <= 0
  ) {
    return false;
  }

  const speedMps = distanceM / durationS;

  if (mode === 'walk') {
    // ~8 km/h upper bound to reject mislabeled driving durations.
    return speedMps <= 2.25;
  }

  if (mode === 'bike') {
    // ~45 km/h upper bound for urban bike routing sanity.
    return speedMps <= 12.5;
  }

  return speedMps >= 1.5;
}

async function fetchRoutesWithAvoidance(
  mode: RouteMode,
  start: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  pins: Pin[],
): Promise<RouteResult[]> {
  const baseRoutes = await fetchRoutesForMode(mode, start, destination);

  if (pins.length === 0) {
    return baseRoutes;
  }

  const rankedBase = rankRouteOptions(baseRoutes, pins, {
    forceAvoidPinAreas: true,
  });
  const primaryRoute = rankedBase[0];
  const baselineDistanceM = primaryRoute?.distanceM ?? Number.POSITIVE_INFINITY;

  if (!primaryRoute || primaryRoute.hazards.length === 0) {
    return baseRoutes;
  }

  const waypointPlans = computeAvoidanceWaypointPlans(
    mode,
    start,
    destination,
    primaryRoute.path,
    primaryRoute.hazards,
  );
  if (waypointPlans.length === 0) {
    return baseRoutes;
  }

  const detourRoutes: RouteResult[] = [];

  for (const waypoints of waypointPlans.slice(0, 6)) {
    try {
      const route = await fetchRouteViaWaypoints(
        mode,
        start,
        destination,
        waypoints,
        pins,
      );
      if (route) {
        const maxDetourFactor = mode === 'walk' ? 1.3 : 1.6;
        if (route.distance <= baselineDistanceM * maxDetourFactor) {
          detourRoutes.push(route);
        }
      }
    } catch {
      // Keep trying other detours if one waypoint plan fails.
    }
  }

  return dedupeRoutes([...baseRoutes, ...detourRoutes]);
}

async function fetchRouteViaWaypoints(
  mode: RouteMode,
  start: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  waypoints: Array<{ lat: number; lng: number }>,
  pins: Pin[],
): Promise<RouteResult | null> {
  const points = [start, ...waypoints, destination];
  let combinedRoute: RouteResult | null = null;

  for (let index = 1; index < points.length; index += 1) {
    const legStart = points[index - 1];
    const legEnd = points[index];
    const legRoutes = await fetchRoutesForMode(mode, legStart, legEnd);
    const bestLeg = rankRouteOptions(legRoutes, pins, {
      forceAvoidPinAreas: true,
    })[0];

    if (!bestLeg) {
      return null;
    }

    const legRoute: RouteResult = {
      distance: bestLeg.distanceM,
      duration: bestLeg.durationS,
      coordinates: bestLeg.path.map(
        ([lat, lng]) => [lng, lat] as [number, number],
      ),
    };

    combinedRoute = combinedRoute
      ? combineRouteSegments(combinedRoute, legRoute)
      : legRoute;
  }

  return combinedRoute;
}

function dedupeRoutes(routes: RouteResult[]): RouteResult[] {
  const seen = new Set<string>();

  return routes.filter((route) => {
    const signature = routeSignature(route.coordinates);
    if (seen.has(signature)) {
      return false;
    }

    seen.add(signature);
    return true;
  });
}

function routeSignature(coordinates: [number, number][]): string {
  if (coordinates.length === 0) {
    return 'empty';
  }

  const step = Math.max(1, Math.floor(coordinates.length / 8));
  const samples: string[] = [];

  for (let index = 0; index < coordinates.length; index += step) {
    const [lng, lat] = coordinates[index];
    samples.push(`${lat.toFixed(4)},${lng.toFixed(4)}`);
  }

  const [lastLng, lastLat] = coordinates[coordinates.length - 1];
  samples.push(`${lastLat.toFixed(4)},${lastLng.toFixed(4)}`);

  return samples.join('|');
}

function combineRouteSegments(
  first: RouteResult,
  second: RouteResult,
): RouteResult {
  const firstCoordinates = [...first.coordinates];
  const secondCoordinates = [...second.coordinates];

  if (firstCoordinates.length > 0 && secondCoordinates.length > 0) {
    const [firstLng, firstLat] = secondCoordinates[0];
    const [lastLng, lastLat] = firstCoordinates[firstCoordinates.length - 1];
    if (
      Math.abs(firstLat - lastLat) < 1e-6 &&
      Math.abs(firstLng - lastLng) < 1e-6
    ) {
      secondCoordinates.shift();
    }
  }

  return {
    distance: first.distance + second.distance,
    duration: first.duration + second.duration,
    coordinates: [...firstCoordinates, ...secondCoordinates],
  };
}

function computeAvoidanceWaypointPlans(
  mode: RouteMode,
  start: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  primaryPath: Array<[number, number]>,
  hazards: Array<Pick<Pin, 'lat' | 'lng' | 'radius_m'>>,
): Array<Array<{ lat: number; lng: number }>> {
  const plans: Array<Array<{ lat: number; lng: number }>> = [];
  const startOverlappingHazards = hazards.filter((hazard) =>
    pointInsidePinArea(start.lat, start.lng, hazard),
  );

  for (const hazard of startOverlappingHazards) {
    plans.push([exitPointForHazard(start, destination, hazard)]);
  }

  // Walking routes are especially sensitive to synthetic waypoint detours.
  // Keep walk mode conservative: only enforce "exit first" when starting inside.
  if (mode === 'walk') {
    return dedupeWaypointPlans(plans);
  }

  const blockingHazards = pickBlockingHazardsOnPath(
    primaryPath,
    hazards,
    start,
    3,
  );
  for (const hazard of blockingHazards) {
    const sidePlans = sideStepWaypointPlans(hazard, start, destination);
    plans.push(...sidePlans);
  }

  return dedupeWaypointPlans(plans);
}

function pickBlockingHazardsOnPath(
  path: Array<[number, number]>,
  hazards: Array<Pick<Pin, 'lat' | 'lng' | 'radius_m'>>,
  start: { lat: number; lng: number },
  limit: number,
): Array<Pick<Pin, 'lat' | 'lng' | 'radius_m'>> {
  if (path.length === 0 || hazards.length === 0) {
    return [];
  }

  return [...hazards]
    .filter((hazard) => !pointInsidePinArea(start.lat, start.lng, hazard))
    .sort((left, right) => {
      const leftDistance = minDistanceFromPathToPoint(path, left.lat, left.lng);
      const rightDistance = minDistanceFromPathToPoint(
        path,
        right.lat,
        right.lng,
      );
      return leftDistance - rightDistance;
    })
    .slice(0, limit);
}

function exitPointForHazard(
  start: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  hazard: Pick<Pin, 'lat' | 'lng' | 'radius_m'>,
): { lat: number; lng: number } {
  const away = normalizeVector(
    metersVectorFrom(hazard.lat, hazard.lng, start.lat, start.lng),
    normalizeVector(
      metersVectorFrom(
        hazard.lat,
        hazard.lng,
        destination.lat,
        destination.lng,
      ),
      {
        east: 1,
        north: 0,
      },
    ),
  );

  return offsetLatLng(hazard.lat, hazard.lng, away, hazard.radius_m + 180);
}

function sideStepWaypointPlans(
  hazard: Pick<Pin, 'lat' | 'lng' | 'radius_m'>,
  start: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Array<Array<{ lat: number; lng: number }>> {
  const forward = normalizeVector(
    metersVectorFrom(start.lat, start.lng, destination.lat, destination.lng),
    {
      east: 1,
      north: 0,
    },
  );

  const left = { east: -forward.north, north: forward.east };
  const right = { east: forward.north, north: -forward.east };
  const detourRadius = hazard.radius_m + Math.max(220, hazard.radius_m * 0.85);
  const forwardShift = Math.max(140, hazard.radius_m * 0.75);

  const leftA = offsetLatLng(
    hazard.lat,
    hazard.lng,
    combineVectors(left, scaleVector(forward, -0.55)),
    detourRadius,
  );
  const leftB = offsetLatLng(
    hazard.lat,
    hazard.lng,
    combineVectors(left, scaleVector(forward, 0.55)),
    detourRadius,
  );
  const rightA = offsetLatLng(
    hazard.lat,
    hazard.lng,
    combineVectors(right, scaleVector(forward, -0.55)),
    detourRadius,
  );
  const rightB = offsetLatLng(
    hazard.lat,
    hazard.lng,
    combineVectors(right, scaleVector(forward, 0.55)),
    detourRadius,
  );

  const leftSingle = offsetLatLng(
    hazard.lat,
    hazard.lng,
    left,
    detourRadius + forwardShift,
  );
  const rightSingle = offsetLatLng(
    hazard.lat,
    hazard.lng,
    right,
    detourRadius + forwardShift,
  );

  return [[leftA, leftB], [rightA, rightB], [leftSingle], [rightSingle]];
}

function scaleVector(
  vector: { east: number; north: number },
  factor: number,
): { east: number; north: number } {
  return {
    east: vector.east * factor,
    north: vector.north * factor,
  };
}

function combineVectors(
  first: { east: number; north: number },
  second: { east: number; north: number },
): { east: number; north: number } {
  return normalizeVector(
    {
      east: first.east + second.east,
      north: first.north + second.north,
    },
    first,
  );
}

function metersVectorFrom(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): { east: number; north: number } {
  const refLatRad = (fromLat * Math.PI) / 180;
  const metersPerDegLat = 111_132;
  const metersPerDegLng = 111_320 * Math.cos(refLatRad);

  return {
    east: (toLng - fromLng) * metersPerDegLng,
    north: (toLat - fromLat) * metersPerDegLat,
  };
}

function normalizeVector(
  vector: { east: number; north: number },
  fallback: { east: number; north: number },
): { east: number; north: number } {
  const length = Math.hypot(vector.east, vector.north);
  if (length < 1e-6) {
    const fallbackLen = Math.hypot(fallback.east, fallback.north);
    if (fallbackLen < 1e-6) {
      return { east: 1, north: 0 };
    }
    return {
      east: fallback.east / fallbackLen,
      north: fallback.north / fallbackLen,
    };
  }

  return {
    east: vector.east / length,
    north: vector.north / length,
  };
}

function offsetLatLng(
  centerLat: number,
  centerLng: number,
  direction: { east: number; north: number },
  distanceM: number,
): { lat: number; lng: number } {
  const latRad = (centerLat * Math.PI) / 180;
  const metersPerDegLat = 111_132;
  const metersPerDegLng = Math.max(1, 111_320 * Math.cos(latRad));

  return {
    lat: centerLat + (direction.north * distanceM) / metersPerDegLat,
    lng: centerLng + (direction.east * distanceM) / metersPerDegLng,
  };
}

function dedupeWaypoints(
  points: Array<{ lat: number; lng: number }>,
): Array<{ lat: number; lng: number }> {
  const seen = new Set<string>();
  const unique: Array<{ lat: number; lng: number }> = [];

  for (const point of points) {
    const key = `${point.lat.toFixed(5)}:${point.lng.toFixed(5)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(point);
  }

  return unique;
}

function dedupeWaypointPlans(
  plans: Array<Array<{ lat: number; lng: number }>>,
): Array<Array<{ lat: number; lng: number }>> {
  const seen = new Set<string>();
  const unique: Array<Array<{ lat: number; lng: number }>> = [];

  for (const plan of plans) {
    const normalizedPlan = dedupeWaypoints(plan);
    if (normalizedPlan.length === 0) {
      continue;
    }

    const key = normalizedPlan
      .map((point) => `${point.lat.toFixed(5)}:${point.lng.toFixed(5)}`)
      .join('|');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(normalizedPlan);
  }

  return unique;
}

function rankRouteOptions(
  routes: RouteResult[],
  pins: Pin[],
  options: { forceAvoidPinAreas?: boolean } = {},
): RouteOption[] {
  const scoredRoutes = routes.map((route) => {
    const path = route.coordinates.map(
      ([lng, lat]) => [lat, lng] as [number, number],
    );
    const hazards = pins.filter((pin) => routeIntersectsPinArea(path, pin));

    const [startLat, startLng] = path[0] ?? [NaN, NaN];
    const startOverlappingPins =
      Number.isFinite(startLat) && Number.isFinite(startLng)
        ? pins.filter((pin) => pointInsidePinArea(startLat, startLng, pin))
        : [];
    const startsInsidePinArea = startOverlappingPins.length > 0;
    const exitDistanceM = startsInsidePinArea
      ? distanceToExitPinAreas(path, startOverlappingPins)
      : 0;

    const avoidableHazards =
      Number.isFinite(startLat) && Number.isFinite(startLng)
        ? hazards.filter((pin) => !pointInsidePinArea(startLat, startLng, pin))
        : hazards;

    const severityPenalty = avoidableHazards.reduce(
      (total, pin) => total + hazardPenaltyForSeverity(pin.severity),
      0,
    );
    const score =
      route.duration + severityPenalty * 120 + avoidableHazards.length * 220;

    return {
      id: routeSignature(route.coordinates),
      distanceM: route.distance,
      durationS: route.duration,
      path,
      hazards,
      score,
      routeLabel: 'Route',
      startsInsidePinArea,
      exitDistanceM,
      avoidableHazardCount: avoidableHazards.length,
    };
  });

  if (scoredRoutes.length === 0) {
    return [];
  }

  if (options.forceAvoidPinAreas) {
    const rankedByAvoidance = [...scoredRoutes].sort((left, right) => {
      if (left.startsInsidePinArea && right.startsInsidePinArea) {
        if (left.exitDistanceM !== right.exitDistanceM) {
          return left.exitDistanceM - right.exitDistanceM;
        }
      }

      if (left.avoidableHazardCount !== right.avoidableHazardCount) {
        return left.avoidableHazardCount - right.avoidableHazardCount;
      }

      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return left.durationS - right.durationS;
    });

    const primaryRoute = rankedByAvoidance[0];
    const primaryLabel = primaryRoute.startsInsidePinArea
      ? 'Exit + Avoid'
      : 'Avoid Pin Areas';

    const preferredRoutes: RouteOption[] = [
      {
        ...primaryRoute,
        routeLabel: primaryLabel,
      },
    ];

    const backupRoute = rankedByAvoidance.find(
      (route) => route.id !== primaryRoute.id,
    );
    if (backupRoute) {
      preferredRoutes.push({
        ...backupRoute,
        routeLabel: 'Backup Avoid',
      });
    }

    return preferredRoutes;
  }

  const fastestRoute = [...scoredRoutes].sort((left, right) => {
    if (left.durationS !== right.durationS) {
      return left.durationS - right.durationS;
    }

    return left.score - right.score;
  })[0];

  const safestRoute = [...scoredRoutes].sort((left, right) => {
    if (left.score !== right.score) {
      return left.score - right.score;
    }

    return left.durationS - right.durationS;
  })[0];

  const preferredRoutes: RouteOption[] = [
    {
      ...fastestRoute,
      routeLabel: 'Fastest',
    },
  ];

  if (safestRoute.id !== fastestRoute.id) {
    preferredRoutes.push({
      ...safestRoute,
      routeLabel: 'Safest',
    });
  }

  return preferredRoutes;
}

function pointInsidePinArea(
  lat: number,
  lng: number,
  pin: Pick<Pin, 'lat' | 'lng' | 'radius_m'>,
): boolean {
  return haversineMeters(lat, lng, pin.lat, pin.lng) <= pin.radius_m;
}

function distanceToExitPinAreas(
  path: Array<[number, number]>,
  startOverlappingPins: Array<Pick<Pin, 'lat' | 'lng' | 'radius_m'>>,
): number {
  if (path.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  let traveledMeters = 0;

  for (let index = 1; index < path.length; index += 1) {
    const [prevLat, prevLng] = path[index - 1];
    const [lat, lng] = path[index];
    traveledMeters += haversineMeters(prevLat, prevLng, lat, lng);

    const stillInside = startOverlappingPins.some((pin) =>
      pointInsidePinArea(lat, lng, pin),
    );
    if (!stillInside) {
      return traveledMeters;
    }
  }

  return Number.POSITIVE_INFINITY;
}

function hazardPenaltyForSeverity(severity: Severity): number {
  if (severity === 'High') {
    return 10;
  }
  if (severity === 'Medium') {
    return 4;
  }
  return 1;
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

function minDistanceFromPathToPoint(
  path: Array<[number, number]>,
  pointLat: number,
  pointLng: number,
): number {
  if (path.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  if (path.length === 1) {
    const [lat, lng] = path[0];
    return haversineMeters(pointLat, pointLng, lat, lng);
  }

  let minDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < path.length; index += 1) {
    const [startLat, startLng] = path[index - 1];
    const [endLat, endLng] = path[index];

    const distance = pointToSegmentMeters(
      pointLat,
      pointLng,
      startLat,
      startLng,
      endLat,
      endLng,
    );

    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

function distanceFromPointToRouteMeters(
  pointLat: number,
  pointLng: number,
  route: Array<[number, number]>,
): number {
  if (route.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  if (route.length === 1) {
    const [lat, lng] = route[0];
    return haversineMeters(pointLat, pointLng, lat, lng);
  }

  let minDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < route.length; index += 1) {
    const [startLat, startLng] = route[index - 1];
    const [endLat, endLng] = route[index];
    const segmentDistance = pointToSegmentMeters(
      pointLat,
      pointLng,
      startLat,
      startLng,
      endLat,
      endLng,
    );

    if (segmentDistance < minDistance) {
      minDistance = segmentDistance;
    }
  }

  return minDistance;
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
