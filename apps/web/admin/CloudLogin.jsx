import { useEffect, useState } from 'react';
import { enterDemo } from './session.js';
import { call } from './backend.js';

// /admin is a showcase of the POS for now: no login, it opens straight into a sandbox with the full catalogue and sample stock.
// The data lives in this tab only. Supabase staff sign-in (signIn in session.js) comes back when the admin goes live.
let started = null; // once per page load, even if React mounts this twice
const start = () => (started ??= (async () => {
  enterDemo();
  await call('/setup', { branch: { name: 'Fit Secrets Vijayawada', code: 'VJA', state_code: '37', is_online: true }, catalog: true, demoStock: true });
})());

export default function CloudLogin({ onDone }) {
  const [err, setErr] = useState('');
  useEffect(() => {
    start().then(() => { started = null; onDone(); }, (e) => setErr(e.message));
  }, []);
  return <div className="grid h-screen place-items-center text-sm text-black/40">{err || 'Starting FitSecret…'}</div>;
}
