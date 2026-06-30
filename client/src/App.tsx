import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import MapView from './components/Map.js';
import { LiveLocationSync } from './components/LiveLocationSync.js';
import { NavBar } from './components/NavBar.js';
import { VoteCard } from './components/VoteCard.js';
import { AuthProvider } from './contexts/AuthContext.js';
import { AuthModalProvider } from './contexts/AuthModalContext.js';
import { useGeolocation } from './hooks/useGeolocation.js';
import { UnsubscribePage } from './pages/UnsubscribePage.js';
import type { Pin } from './types/domain.js';

function MapPage() {
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { position } = useGeolocation();

  return (
    <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
      <MapView
        onPinSelect={setSelectedPin}
        selectedPinId={selectedPin?.id ?? null}
        userPosition={position}
        refreshKey={refreshKey}
      />

      {selectedPin && (
        <div
          style={{
            position: 'absolute',
            bottom: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1100,
            width: 'min(400px, 90vw)',
          }}
        >
          <VoteCard
            pin={selectedPin}
            userPosition={position}
            onVoteCast={() => setRefreshKey((k) => k + 1)}
            onPinRemoved={() => {
              setSelectedPin(null);
              setRefreshKey((k) => k + 1);
            }}
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
        <AuthModalProvider>
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
              <Route path='/unsubscribe' element={<UnsubscribePage />} />
            </Routes>
          </div>
        </AuthModalProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
