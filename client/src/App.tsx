import { useRef, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { MapView } from './components/MapView.js';
import type { MapViewHandle } from './components/MapView.js';
import { NavBar } from './components/NavBar.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { ReportForm } from './components/ReportForm.js';
import { VoteCard } from './components/VoteCard.js';
import { AuthProvider } from './contexts/AuthContext.js';
import { useGeolocation } from './hooks/useGeolocation.js';
import { LoginPage } from './pages/LoginPage.js';
import { ManageAlertsPage } from './pages/ManageAlertsPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { UnsubscribePage } from './pages/UnsubscribePage.js';
import type { Pin, WatchArea } from './types/domain.js';

function MapPage() {
  const mapRef = useRef<MapViewHandle>(null);
  const { position } = useGeolocation();

  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [watchAreas] = useState<WatchArea[]>([]);

  const [reportMode, setReportMode] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [pendingLat, setPendingLat] = useState<number | null>(null);
  const [pendingLng, setPendingLng] = useState<number | null>(null);

  function openReportMode() {
    setSelectedPin(null);
    setShowReportForm(false);
    // Pre-fill location from GPS if available
    if (position) {
      setPendingLat(position.lat);
      setPendingLng(position.lng);
    } else {
      setPendingLat(null);
      setPendingLng(null);
    }
    setReportMode(true);
  }

  function handleLocationPicked(lat: number, lng: number) {
    setPendingLat(lat);
    setPendingLng(lng);
    setShowReportForm(true);
  }

  function handlePinCreated(pin: Pin) {
    setShowReportForm(false);
    setReportMode(false);
    setPendingLat(null);
    setPendingLng(null);
    setSelectedPin(pin);
    mapRef.current?.refreshPins();
  }

  function cancelReport() {
    setShowReportForm(false);
    setReportMode(false);
    setPendingLat(null);
    setPendingLng(null);
  }

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      <MapView
        ref={mapRef}
        onPinSelect={(pin) => {
          if (reportMode) return;
          setSelectedPin(pin);
        }}
        watchAreas={watchAreas}
        reportMode={reportMode}
        onLocationPicked={handleLocationPicked}
      />

      {/* Report FAB — hidden while report mode or form is open */}
      {!reportMode && !showReportForm && (
        <button className="report-fab" onClick={openReportMode}>
          ＋ Report
        </button>
      )}

      {/* Instruction pill shown while user is picking a location */}
      {reportMode && !showReportForm && (
        <div className="report-mode-hint">
          Click the map to place your hazard pin
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: '0.75rem' }}
            onClick={cancelReport}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Report form modal */}
      {showReportForm && (
        <ReportForm
          initialLat={pendingLat}
          initialLng={pendingLng}
          onSubmit={handlePinCreated}
          onCancel={cancelReport}
        />
      )}

      {/* Vote / pin detail card */}
      {selectedPin && !showReportForm && (
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
            onVoteCast={() => mapRef.current?.refreshPins()}
            onPinRemoved={() => {
              setSelectedPin(null);
              mapRef.current?.refreshPins();
            }}
          />
          <button
            type="button"
            style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
            className="btn btn-ghost btn-sm"
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
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
          <NavBar />
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            <Routes>
              <Route path="/" element={<MapPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route
                path="/alerts"
                element={
                  <ProtectedRoute>
                    <ManageAlertsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/unsubscribe" element={<UnsubscribePage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
