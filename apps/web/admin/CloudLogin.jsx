import { useState } from 'react';
import { Btn, Field } from '../../pos/ui/src/ui.jsx';
import { signIn } from './session.js';

export default function CloudLogin({ boot, onDone }) {
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await signIn(f.email, f.password); onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-screen place-items-center bg-paper p-4">
      <form onSubmit={submit} className="rise w-full max-w-sm rounded-[14px] border border-black/10 bg-white p-6 shadow-sm">
        <img src={import.meta.env.BASE_URL + 'logo.png'} alt="Fit Secrets" className="mb-4 h-12 w-auto" />
        <h1 className="display text-xl">Staff sign in</h1>
        <p className="mb-5 text-sm text-black/55">{boot?.branch?.name || 'Fit Secrets'} · inventory &amp; billing</p>
        <div className="grid gap-3">
          <Field label="Email" type="email" autoFocus required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Field label="Password" type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Btn v="brand" type="submit" disabled={busy} className="w-full py-3">{busy ? 'Signing in…' : 'Sign in'}</Btn>
        </div>
      </form>
    </div>
  );
}
