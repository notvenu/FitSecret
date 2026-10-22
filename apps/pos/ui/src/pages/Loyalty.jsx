// Vyapar's Parties → Loyalty Points: customers earn points on sales and spend them at the counter (Billing → Redeem).
import { inr } from '@fitsecret/shared';
import { api, useApi, toast, fail, downloadCsv } from '../api.js';
import { Btn, Field, Money, Page, Table, useForm } from '../ui.jsx';

export default function Loyalty({ boot, reload, user }) {
  const cfg = boot.branch?.settings?.loyalty || {};
  const list = useApi('/reports/x/loyalty');
  const [f, , bind] = useForm({ enabled: !!cfg.enabled, earn_per_100: cfg.earn_per_100 ?? 1, point_value: cfg.point_value ?? 1 });
  const save = async (e) => {
    e.preventDefault();
    try {
      await api('/t/branches', { id: boot.branch.id, settings: { ...boot.branch.settings, loyalty: { enabled: f.enabled, earn_per_100: +f.earn_per_100 || 0, point_value: +f.point_value || 0 } } });
      toast('Loyalty settings saved'); reload();
    } catch (e) { fail(e); }
  };
  const total = list.data?.reduce((s, r) => s + r.value, 0) || 0;
  return (
    <Page title="Loyalty Points" actions={<Btn onClick={() => downloadCsv('loyalty', list.data)}>Export</Btn>}>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card">
          <div className="flex justify-between border-b border-line px-4 py-2.5 text-sm"><span className="font-semibold">Customers with points</span><span>Outstanding value <Money v={total} className="font-semibold" /></span></div>
          <Table rows={list.data} empty={cfg.enabled ? 'No points earned yet. Points come with sales to named customers.' : 'Loyalty points are off. Turn them on →'} columns={[
            { k: 'name', label: 'Customer', r: (r) => <span className="font-medium">{r.name}</span> }, { k: 'phone', label: 'Phone' },
            { k: 'earned', label: 'Earned', right: true }, { k: 'redeemed', label: 'Redeemed', right: true },
            { k: 'balance', label: 'Balance', right: true, r: (r) => <b>{r.balance}</b> }, { k: 'value', label: 'Worth', right: true, r: (r) => <Money v={r.value} /> },
            { label: '', r: (r) => r.phone && r.balance > 0 && <a className="text-xs font-semibold text-brand-d hover:underline" target="_blank" rel="noreferrer"
              href={`https://wa.me/91${r.phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(`Hi ${r.name}, you have ${r.balance} Fit Secrets loyalty points worth ${inr(r.value)}. Use them on your next purchase!`)}`}>WhatsApp</a> },
          ]} />
        </div>
        {user.role === 'admin' && (
          <form onSubmit={save} className="card space-y-3 self-start p-4 text-sm">
            <h2 className="font-semibold">Settings</h2>
            <label className="flex items-center gap-2"><input {...bind('enabled', 'checkbox')} /> Enable loyalty points</label>
            <Field label="Points earned per ₹100 spent" {...bind('earn_per_100')} inputMode="decimal" />
            <Field label="Value of 1 point (₹)" {...bind('point_value')} inputMode="decimal" />
            <p className="text-xs text-black/50">Example: {f.earn_per_100} point per ₹100 and ₹{f.point_value} per point gives {((+f.earn_per_100 || 0) * (+f.point_value || 0)).toFixed(2)}% back. Redeemed points are recorded as a payment mode “points” on the bill.</p>
            <Btn v="primary" type="submit" className="w-full">Save</Btn>
          </form>
        )}
      </div>
    </Page>
  );
}
