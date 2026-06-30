import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { pinsApi } from '../api/pins.js';
import type { Pin, Severity, WatchArea } from '../types/domain.js';

const CARTO_DARK_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

function severityColor(severity: Severity | string): string {
  switch (severity) {
    case 'Low':
      return '#22c55e';
    case 'Medium':
      return '#f97316';
    case 'High':
      return '#ef4444';
    default:
      return '#94a3b8';
  }
}

const PENDING_MARKER_ICON = L.divIcon({
  className: 'pending-pin-marker',
  html: '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#3b82f6;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 18],
});

export interface MapViewHandle {
  refreshPins: () => void;
}

export interface MapViewProps {
  onPinSelect: (pin: Pin | null) => void;
  watchAreas?: WatchArea[];
  reportMode?: boolean;
  onLocationPicked?: (lat: number, lng: number) => void;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { onPinSelect, watchAreas = [], reportMode = false, onLocationPicked },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pendingMarkerRef = useRef<L.Marker | null>(null);

  // Layer groups for the dynamic geometry we redraw on data changes
  const watchAreasLayerRef = useRef<L.LayerGroup | null>(null);
  const pinRadiiLayerRef = useRef<L.LayerGroup | null>(null);
  const pinsLayerRef = useRef<L.LayerGroup | null>(null);

  // Keep latest callbacks/props in refs so map event listeners always see current values
  const onPinSelectRef = useRef(onPinSelect);
  const onLocationPickedRef = useRef(onLocationPicked);
  const reportModeRef = useRef(reportMode);
  const watchAreasRef = useRef(watchAreas);

  useEffect(() => { onPinSelectRef.current = onPinSelect; }, [onPinSelect]);
  useEffect(() => { onLocationPickedRef.current = onLocationPicked; }, [onLocationPicked]);

  function renderWatchAreas(areas: WatchArea[]) {
    const layer = watchAreasLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const area of areas) {
      L.circle([area.lat, area.lng], {
        radius: area.radius_m,
        color: '#60a5fa',
        weight: 2,
        dashArray: '3 3',
        fill: false,
        interactive: false,
      }).addTo(layer);
    }
  }

  useEffect(() => {
    reportModeRef.current = reportMode;
    const map = mapRef.current;
    if (!map) return;
    map.getContainer().style.cursor = reportMode ? 'crosshair' : '';
    if (!reportMode) {
      pendingMarkerRef.current?.remove();
      pendingMarkerRef.current = null;
    }
  }, [reportMode]);

  useEffect(() => {
    watchAreasRef.current = watchAreas;
    if (watchAreasLayerRef.current) renderWatchAreas(watchAreas);
  }, [watchAreas]);

  function fetchAndRender(map: L.Map) {
    const center = map.getCenter();
    const bounds = map.getBounds();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const latSpan = Math.abs(ne.lat - sw.lat) / 2;
    const lngSpan = Math.abs(ne.lng - sw.lng) / 2;
    const radiusM = Math.round(Math.sqrt(latSpan ** 2 + lngSpan ** 2) * 111_320);

    pinsApi.list(center.lat, center.lng, radiusM).then((pins) => {
      const radiiLayer = pinRadiiLayerRef.current;
      const pinsLayer = pinsLayerRef.current;
      if (!radiiLayer || !pinsLayer) return;

      radiiLayer.clearLayers();
      pinsLayer.clearLayers();

      for (const pin of pins) {
        const color = severityColor(pin.severity);

        // Hazard radius
        L.circle([pin.lat, pin.lng], {
          radius: pin.radius_m,
          color,
          weight: 1.5,
          fillColor: color,
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(radiiLayer);

        // Pin dot
        const marker = L.circleMarker([pin.lat, pin.lng], {
          radius: 10,
          color: '#fff',
          weight: 2,
          fillColor: color,
          fillOpacity: 1,
        }).addTo(pinsLayer);

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onPinSelectRef.current(pin);
        });
        marker.on('mouseover', () => {
          if (!reportModeRef.current) map.getContainer().style.cursor = 'pointer';
        });
        marker.on('mouseout', () => {
          if (!reportModeRef.current) map.getContainer().style.cursor = '';
        });
      }
    }).catch(() => null);
  }

  useImperativeHandle(ref, () => ({
    refreshPins() {
      if (mapRef.current) fetchAndRender(mapRef.current);
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [41.8781, -87.6298],
      zoom: 14,
      zoomControl: true,
    });

    L.tileLayer(CARTO_DARK_URL, {
      attribution: CARTO_ATTRIBUTION,
      maxZoom: 20,
    }).addTo(map);

    mapRef.current = map;

    // Layer groups (rendered beneath markers in add order)
    watchAreasLayerRef.current = L.layerGroup().addTo(map);
    pinRadiiLayerRef.current = L.layerGroup().addTo(map);
    pinsLayerRef.current = L.layerGroup().addTo(map);

    renderWatchAreas(watchAreasRef.current);

    // Fly to user's position on first load
    navigator.geolocation?.getCurrentPosition((pos) => {
      map.flyTo([pos.coords.latitude, pos.coords.longitude], 15);
    });

    // Click map canvas (report mode: place a draggable marker)
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!reportModeRef.current) return;
      const { lat, lng } = e.latlng;

      pendingMarkerRef.current?.remove();
      const marker = L.marker([lat, lng], {
        draggable: true,
        icon: PENDING_MARKER_ICON,
      }).addTo(map);
      pendingMarkerRef.current = marker;

      onLocationPickedRef.current?.(lat, lng);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onLocationPickedRef.current?.(pos.lat, pos.lng);
      });
    });

    map.on('moveend', () => fetchAndRender(map));

    fetchAndRender(map);

    return () => {
      pendingMarkerRef.current?.remove();
      pendingMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      watchAreasLayerRef.current = null;
      pinRadiiLayerRef.current = null;
      pinsLayerRef.current = null;
    };
  }, []); // intentionally empty — map is initialized once

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
});
