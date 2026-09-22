import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
// For its side effect: starts listening for `beforeinstallprompt` now, before
// React mounts, because Chrome can fire it within moments of load.
import './lib/install';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
