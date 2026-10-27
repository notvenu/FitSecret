// Parties → Follow-ups: who to message today. Refills due (supplements run out on a rhythm), regulars who stopped coming, and dues.
// One tap opens WhatsApp with the message ready; rows messaged today are greyed out on this device.
import { useState } from 'react';
import { inr, today } from '@fitsecret/shared';
import { useApi } from '../api.js';
import { Money, Table, Badge, SideNav, SectionPage, cx } from '../ui.jsx';
import { InsightStrip } from './Insights.jsx';

const wa = (phone, text) => `https://wa.me/91${String(phone).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(text)}`;
const done = () => { try { return JSON.parse(localStorage.getItem('fs_contacted') || '{}'); } catch { return {}; } };

export default function FollowUps({ route, branch, user }) {
  const [tab, setTab] = useState(['refills', 'lapsed', 'dues'].includes(route.query.tab) ? route.query.tab : 'refills');
  const refills = useApi('/reports/x/refills');
  const lapsed = useApi('/reports/x/lapsed');
  const parties = useApi('/parties');
  const [sent, setSent] = useState(done);
  const shop = branch?.name || 'Fit Secrets';
  const mark = (k) => { const m = { ...done(), [k]: today() }; localStorage.setItem('fs_contacted', JSON.stringify(m)); setSent(m); };
  const today_ = (k) => sent[k] === today();
  const Send = ({ k, phone, text }) => (phone
    ? <a href={wa(phone, text)} target="_blank" rel="noreferrer" onClick={() => mark(k)}
      className={cx('rounded-full px-3 py-1 text-xs font-semibold', today_(k) ? 'bg-black/5 text-black/45' : 'bg-brand text-ink hover:bg-ink hover:text-white')}>{today_(k) ? 'Sent ✓' : 'WhatsApp'}</a>
    : <span className="text-xs text-black/35">no phone</span>);
  const dues = parties.data?.filter((p) => p.type === 'customer' && p.balance > 0).sort((a, b) => b.balance - a.balance);
  const fade = (k) => today_(k) && 'opacity-50';

  return (
    <SectionPage nav={<SideNav title="Follow-ups" value={tab} onChange={setTab} groups={[{ items: [
      { key: 'refills', label: 'Refills due', desc: 'Last pack running out this week', badge: refills.data?.length },
      { key: 'lapsed', label: 'Not seen lately', desc: 'Nothing bought in 60 days', badge: lapsed.data?.length },
      { key: 'dues', label: 'Payment due', desc: 'Customers who owe you', badge: dues?.length }] }]} />}
      top={<InsightStrip user={user} branch={branch} sections={['customers']} limit={2} />}
      title={{ refills: 'Refills due', lapsed: 'Not seen lately', dues: 'Payment due' }[tab]}
      hint={{
        refills: 'Customers whose last pack should be running out within a week. Set “Lasts (days)” on items, or it learns from each customer’s own buying rhythm.',
        lapsed: 'Bought before, nothing in the last 60 days. Each WhatsApp button opens the message ready to send.',
        dues: 'Customers who owe you money. The message includes your UPI ID when it is set.',
      }[tab]}>
      <div className="card">
        {tab === 'refills' && <Table rows={refills.data} empty="Nobody due this week. Add “Lasts (days)” to items (Items → Edit) to start tracking." rowClass={(r) => fade('r' + r.party_id + r.item)} columns={[
          { k: 'name', label: 'Customer', r: (r) => <><span className="font-medium">{r.name}</span> <span className="text-black/40">{r.phone}</span></> },
          { k: 'item', label: 'Last bought' }, { k: 'last_bought', label: 'On' },
          { k: 'days_left', label: 'Runs out', r: (r) => <Badge c={r.days_left < 0 ? 'red' : r.days_left <= 2 ? 'amber' : 'green'}>{r.days_left < 0 ? `${-r.days_left}d ago` : r.days_left === 0 ? 'today' : `in ${r.days_left}d`}</Badge> },
          { label: '', r: (r) => <Send k={'r' + r.party_id + r.item} phone={r.phone}
            text={`Hi ${r.name}, your ${r.item} from ${shop} should be running low around now. Shall we keep one ready for you? Just reply here and we'll pack it.`} /> },
        ]} />}
        {tab === 'lapsed' && <Table rows={lapsed.data} empty="No lapsed regulars 💪" rowClass={(r) => fade('l' + r.party_id)} columns={[
          { k: 'name', label: 'Customer', r: (r) => <><span className="font-medium">{r.name}</span> <span className="text-black/40">{r.phone}</span></> },
          { k: 'last_visit', label: 'Last visit' }, { k: 'bills', label: 'Bills', right: true }, { k: 'spent', label: 'Spent', right: true, r: (r) => <Money v={r.spent} /> },
          { label: '', r: (r) => <Send k={'l' + r.party_id} phone={r.phone}
            text={`Hi ${r.name}, we haven't seen you at ${shop} in a while! New stock is in. Drop by or reply here and we'll keep your usual ready.`} /> },
        ]} />}
        {tab === 'dues' && <Table rows={dues} empty="Nobody owes you anything" rowClass={(r) => fade('d' + r.id)} columns={[
          { k: 'name', label: 'Customer', r: (r) => <><span className="font-medium">{r.name}</span> <span className="text-black/40">{r.phone}</span></> },
          { k: 'group_name', label: 'Group' }, { k: 'balance', label: 'Owes', right: true, r: (r) => <Money v={r.balance} className="font-semibold text-amber-700" /> },
          { label: '', r: (r) => <Send k={'d' + r.id} phone={r.phone}
            text={`Hi ${r.name}, a gentle reminder from ${shop}: your pending balance is ${inr(r.balance)}.${branch?.settings?.invoice?.upi ? ` You can pay by UPI to ${branch.settings.invoice.upi}.` : ''} Thank you!`} /> },
        ]} />}
      </div>
    </SectionPage>
  );
}
