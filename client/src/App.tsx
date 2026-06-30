import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import MapView from './components/Map.js';
import { LiveLocationSync } from './components/LiveLocationSync.js';
import { NavBar } from './components/NavBar.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { VoteCard } from './components/VoteCard.js';
import { AuthProvider } from './contexts/AuthContext.js';
import { useGeolocation } from './hooks/useGeolocation.js';
import { LoginPage } from './pages/LoginPage.js';
import { ManageAlertsPage } from './pages/ManageAlertsPage.js';
import { MyPinsPage } from './pages/MyPinsPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
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
              path='/my-pins'
              element={
                <ProtectedRoute>
                  <MyPinsPage />
                </ProtectedRoute>
              }
            />
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
