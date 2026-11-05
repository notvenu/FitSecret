import { useState } from 'react';
import { signIn } from './session.js';

// Sign-in for the Online Store admin (website /admin). Supabase email + password of a staff login.
export default function CloudLogin({ onDone }) {
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await signIn(f.email, f.password); onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-screen place-items-center bg-paper p-4">
      <form onSubmit={submit} className="rise w-full max-w-sm rounded-[14px] border border-black/10 bg-white p-6 shadow-sm">
        <div className="display text-2xl">Online Store admin</div>
        <p className="mb-5 text-sm text-black/55">Orders, products, offers and store settings for the website.</p>
        <label className="mb-3 block"><span className="mb-1 block text-xs font-medium text-black/60">Email</span>
          <input className="input" type="email" autoComplete="username" required autoFocus value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label className="mb-4 block"><span className="mb-1 block text-xs font-medium text-black/60">Password</span>
          <input className="input" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        {err && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</p>}
        <button disabled={busy} className="w-full rounded-full bg-ink py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
