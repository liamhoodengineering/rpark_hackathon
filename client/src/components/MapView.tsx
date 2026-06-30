import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { pinsApi } from '../api/pins.js';
import type { Pin, WatchArea } from '../types/domain.js';

const SEVERITY_COLOR_EXPR: mapboxgl.Expression = [
  'match',
  ['get', 'severity'],
  'Low', '#22c55e',
  'Medium', '#f97316',
  'High', '#ef4444',
  '#94a3b8',
];

function makeCirclePolygon(lng: number, lat: number, radiusM: number, steps = 64): number[][] {
  const R = 6_371_000;
  const latRad = (lat * Math.PI) / 180;
  const coords: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLat = ((radiusM * Math.cos(angle)) / R) * (180 / Math.PI);
    const dLng = ((radiusM * Math.sin(angle)) / R / Math.cos(latRad)) * (180 / Math.PI);
    coords.push([lng + dLng, lat + dLat]);
  }
  return coords;
}

function pinsToGeoJSON(pins: Pin[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pins.map((pin) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [pin.lng, pin.lat] } as GeoJSON.Point,
      properties: { ...pin },
    })),
  };
}

function radiiToGeoJSON(pins: Pin[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pins.map((pin) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [makeCirclePolygon(pin.lng, pin.lat, pin.radius_m)],
      } as GeoJSON.Polygon,
      properties: { severity: pin.severity, id: pin.id },
    })),
  };
}

function watchAreasToGeoJSON(areas: WatchArea[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: areas.map((area) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [makeCirclePolygon(area.lng, area.lat, area.radius_m)],
      } as GeoJSON.Polygon,
      properties: { id: area.id },
    })),
  };
}

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
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const pendingMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Keep latest callbacks/props in refs so map event listeners always see current values
  const onPinSelectRef = useRef(onPinSelect);
  const onLocationPickedRef = useRef(onLocationPicked);
  const reportModeRef = useRef(reportMode);
  const watchAreasRef = useRef(watchAreas);

  useEffect(() => { onPinSelectRef.current = onPinSelect; }, [onPinSelect]);
  useEffect(() => { onLocationPickedRef.current = onLocationPicked; }, [onLocationPicked]);

  useEffect(() => {
    reportModeRef.current = reportMode;
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = reportMode ? 'crosshair' : '';
    if (!reportMode) {
      pendingMarkerRef.current?.remove();
      pendingMarkerRef.current = null;
    }
  }, [reportMode]);

  useEffect(() => {
    watchAreasRef.current = watchAreas;
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    (map.getSource('watch-areas-source') as mapboxgl.GeoJSONSource | undefined)
      ?.setData(watchAreasToGeoJSON(watchAreas));
  }, [watchAreas]);

  function fetchAndRender(map: mapboxgl.Map) {
    const center = map.getCenter();
    const bounds = map.getBounds();
    if (!bounds) return;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const latSpan = Math.abs(ne.lat - sw.lat) / 2;
    const lngSpan = Math.abs(ne.lng - sw.lng) / 2;
    const radiusM = Math.round(Math.sqrt(latSpan ** 2 + lngSpan ** 2) * 111_320);

    pinsApi.list(center.lat, center.lng, radiusM).then((pins) => {
      (map.getSource('pins-source') as mapboxgl.GeoJSONSource | undefined)
        ?.setData(pinsToGeoJSON(pins));
      (map.getSource('pin-radii-source') as mapboxgl.GeoJSONSource | undefined)
        ?.setData(radiiToGeoJSON(pins));
    }).catch(() => null);
  }

  useImperativeHandle(ref, () => ({
    refreshPins() {
      if (mapRef.current) fetchAndRender(mapRef.current);
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
    if (token) mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-87.6298, 41.8781],
      zoom: 14,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(new mapboxgl.GeolocateControl({ trackUserLocation: false }), 'top-right');

    // Fly to user's position on first load
    navigator.geolocation?.getCurrentPosition((pos) => {
      map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15 });
    });

    map.on('load', () => {
      map.addSource('watch-areas-source', {
        type: 'geojson',
        data: watchAreasToGeoJSON(watchAreasRef.current),
      });
      map.addSource('pin-radii-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addSource('pins-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Watch area dashed outline
      map.addLayer({
        id: 'watch-areas-line',
        type: 'line',
        source: 'watch-areas-source',
        paint: {
          'line-color': '#60a5fa',
          'line-width': 2,
          'line-dasharray': [3, 3],
        },
      });

      // Pin radius fill
      map.addLayer({
        id: 'pin-radii-fill',
        type: 'fill',
        source: 'pin-radii-source',
        paint: {
          'fill-color': SEVERITY_COLOR_EXPR,
          'fill-opacity': 0.08,
        },
      });

      // Pin radius border
      map.addLayer({
        id: 'pin-radii-line',
        type: 'line',
        source: 'pin-radii-source',
        paint: {
          'line-color': SEVERITY_COLOR_EXPR,
          'line-width': 1.5,
        },
      });

      // Pin dots
      map.addLayer({
        id: 'pins-circle',
        type: 'circle',
        source: 'pins-source',
        paint: {
          'circle-radius': 10,
          'circle-color': SEVERITY_COLOR_EXPR,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });

      fetchAndRender(map);
    });

    map.on('moveend', () => fetchAndRender(map));

    // Click a pin marker
    map.on('click', 'pins-circle', (e) => {
      e.originalEvent.stopPropagation();
      const feature = e.features?.[0];
      if (!feature) return;
      const p = feature.properties as Record<string, unknown>;
      const pin: Pin = {
        id: p.id as string,
        reporter_id: (p.reporter_id as string | null) ?? null,
        lat: p.lat as number,
        lng: p.lng as number,
        name: (p.name as string | null) ?? null,
        description: (p.description as string | null) ?? null,
        severity: p.severity as Pin['severity'],
        radius_m: p.radius_m as number,
        upvotes: p.upvotes as number,
        downvotes: p.downvotes as number,
        status: p.status as Pin['status'],
        expires_at: (p.expires_at as string | null) ?? null,
        created_at: p.created_at as string,
      };
      onPinSelectRef.current(pin);
    });

    // Click map canvas (report mode: place a marker)
    map.on('click', (e) => {
      if (!reportModeRef.current) return;
      const { lat, lng } = e.lngLat;

      pendingMarkerRef.current?.remove();
      const marker = new mapboxgl.Marker({ color: '#3b82f6', draggable: true })
        .setLngLat([lng, lat])
        .addTo(map);
      pendingMarkerRef.current = marker;

      onLocationPickedRef.current?.(lat, lng);

      marker.on('dragend', () => {
        const pos = marker.getLngLat();
        onLocationPickedRef.current?.(pos.lat, pos.lng);
      });
    });

    map.on('mouseenter', 'pins-circle', () => {
      if (!reportModeRef.current) map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'pins-circle', () => {
      if (!reportModeRef.current) map.getCanvas().style.cursor = '';
    });

    return () => {
      pendingMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []); // intentionally empty — map is initialized once

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
});
