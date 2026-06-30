import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LiveLocationSync } from './components/LiveLocationSync.js';
import { NavBar } from './components/NavBar.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { VoteCard } from './components/VoteCard.js';
import { AuthProvider } from './contexts/AuthContext.js';
import { useGeolocation } from './hooks/useGeolocation.js';
import { LoginPage } from './pages/LoginPage.js';
import { ManageAlertsPage } from './pages/ManageAlertsPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { UnsubscribePage } from './pages/UnsubscribePage.js';
import type { Pin, WatchArea } from './types/domain.js';

/**
 * Map view shell. Team Member #5 replaces this with the real Mapbox component.
 * Props: onPinSelect (click handler), watchAreas (for dashed circle layer).
 *
 * Interface contract for #5:
 *   interface MapViewProps {
 *     onPinSelect: (pin: Pin | null) => void;
 *     watchAreas?: WatchArea[];
 *   }
 */
function MapPlaceholder({
  onPinSelect,
}: {
  onPinSelect: (pin: Pin | null) => void;
  watchAreas?: WatchArea[];
}) {
  // Demo: clicking the placeholder surfaces a mock pin so VoteCard can be tested
  const mockPin: Pin = {
    id: 'demo-pin-1',
    reporter_id: null,
    lat: 40.7128,
    lng: -74.006,
    name: 'Demo Hazard',
    description: 'Wet floor near the fountain',
    severity: 'Medium',
    radius_m: 100,
    upvotes: 3,
    downvotes: 1,
    status: 'active',
    expires_at: new Date(Date.now() + 45 * 60_000).toISOString(),
    created_at: new Date().toISOString(),
  };

  return (
    <div
      className='map-placeholder'
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a2332',
        color: '#94a3b8',
        gap: '1rem',
        minHeight: '60vh',
      }}
    >
      <p>🗺 Map coming from Team Member #5</p>
      <button className='btn btn-primary' onClick={() => onPinSelect(mockPin)}>
        Simulate pin click (test VoteCard)
      </button>
      <button className='btn btn-ghost' onClick={() => onPinSelect(null)}>
        Clear selection
      </button>
    </div>
  );
}

function MapPage() {
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [watchAreas] = useState<WatchArea[]>([]);
  const { position } = useGeolocation();

  return (
    <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
      {/* Team Member #5 swaps MapPlaceholder for their <MapView> component */}
      <MapPlaceholder onPinSelect={setSelectedPin} watchAreas={watchAreas} />

      {selectedPin && (
        <div
          style={{
            position: 'absolute',
            bottom: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            width: 'min(400px, 90vw)',
          }}
        >
          <VoteCard
            pin={selectedPin}
            userPosition={position}
            onVoteCast={() => {
              // TODO: tell #5's map to refresh pins in viewport
            }}
            onPinRemoved={() => setSelectedPin(null)}
          />
          <button
            style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
            className='btn btn-ghost btn-sm'
            onClick={() => setSelectedPin(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
          }}
        >
          <NavBar />
          <LiveLocationSync />
          <Routes>
            <Route path='/' element={<MapPage />} />
            <Route path='/login' element={<LoginPage />} />
            <Route path='/register' element={<RegisterPage />} />
            <Route
              path='/alerts'
              element={
                <ProtectedRoute>
                  <ManageAlertsPage />
                </ProtectedRoute>
              }
            />
            <Route path='/unsubscribe' element={<UnsubscribePage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
