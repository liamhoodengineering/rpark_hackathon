import { useEffect, useState } from 'react';
import { api } from './api/client.js';
import Map from './components/Map.js';

/**
 * App shell. Routing, auth screens, report/vote UI, and hazard pins on the
 * Leaflet map are TODO for Team Members #5 and #6.
 */
export default function App() {
  const [apiStatus, setApiStatus] = useState<string>('checking…');

  useEffect(() => {
    api
      .health()
      .then((res) =>
        setApiStatus(res.status === 'ok' ? 'connected' : 'unexpected response'),
      )
      .catch(() => setApiStatus('unreachable'));
  }, []);

  return (
    <main className='app-shell'>
      <header>
        <h1>📍 PinPoint</h1>
        <p>Waze for Pedestrians — crowd-sourced hazard map</p>
      </header>

      <section className='status-card'>
        <p>
          API: <strong>{apiStatus}</strong>
        </p>
        <p className='hint'>
          This is the scaffold shell. Add hazard pins to the Leaflet map (Team
          Member #5) and the auth / vote UI (Team Member #6) from here.
        </p>
      </section>

      <Map />
    </main>
  );
}
