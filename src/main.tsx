import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

window.addEventListener('error', (event) => {
  const root = document.getElementById('root');
  if (root && root.innerHTML === '') {
    root.innerHTML = `
      <div style="padding: 20px; font-family: monospace; background: #fff; color: #cc0000; border: 2px solid #cc0000; margin: 20px; border-radius: 8px;">
        <h2 style="margin-top: 0;">Application Crash Detected</h2>
        <p><strong>Error:</strong> ${event.message}</p>
        <p><strong>Source:</strong> ${event.filename}:${event.lineno}:${event.colno}</p>
        <p style="margin-bottom: 0;">Check the browser console (F12) for more details.</p>
      </div>
    `;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const root = document.getElementById('root');
  if (root && root.innerHTML === '') {
    root.innerHTML = `
      <div style="padding: 20px; font-family: monospace; background: #fff; color: #cc0000; border: 2px solid #cc0000; margin: 20px; border-radius: 8px;">
        <h2 style="margin-top: 0;">Unhandled Promise Rejection</h2>
        <p><strong>Reason:</strong> ${event.reason}</p>
        <p style="margin-bottom: 0;">Check the browser console (F12) for more details.</p>
      </div>
    `;
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
