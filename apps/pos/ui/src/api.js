import { useEffect, useState, useCallback } from 'react';
import { call } from '@backend';

let token = localStorage.getItem('fs_token');
export const setToken = (t) => { token = t; t ? localStorage.setItem('fs_token', t) : localStorage.removeItem('fs_token'); };

export async function api(path, body, method) {
  try { return await call(path, body, method, token); } catch (e) {
    if (e.status === 401 && !path.startsWith('/login')) { setToken(null); window.dispatchEvent(new Event('fs-auth')); }
    throw e;
  }
}

export function useApi(path) {
  const [state, set] = useState({ data: null, error: null, loading: true });
  const reload = useCallback(() => {
    if (!path) return;
    set((s) => ({ ...s, loading: true }));
    api(path).then((data) => set({ data, error: null, loading: false }), (error) => set((s) => ({ ...s, error, loading: false })));
  }, [path]);
  useEffect(reload, [reload]);
  return { ...state, reload };
}

// Tiny global toast bus
export const toast = (msg, kind = 'ok') => window.dispatchEvent(new CustomEvent('fs-toast', { detail: { msg, kind, id: Math.random() } }));
export const fail = (e) => toast(e.message || String(e), 'err');

// Hash router
export function useRoute() {
  const [h, setH] = useState(location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => setH(location.hash.slice(1) || '/');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(qs)) };
}
export const go = (p) => { location.hash = p; };

export function downloadCsv(name, rows) {
  if (!rows?.length) return toast('Nothing to export', 'err');
  const cols = Object.keys(rows[0]);
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: name + '.csv' });
  a.click();
  URL.revokeObjectURL(a.href);
}
