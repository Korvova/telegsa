
import ReactDOM from 'react-dom/client'
import App from './App'

// === debug console on ?debug ===
async function initDebug() {
  const hasDebug = new URLSearchParams(location.search).has('debug');
  if (hasDebug) {
    const eruda = await import('eruda');
    eruda.default.init({ tool: ['console', 'network'] });
    (window as any).eruda?.show?.();
    console.log('[debug] eruda started');
  }
}
initDebug();
// ===============================

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
