// Cheques: a payment with mode 'cheque' plus its number (ref), date written on it (ref_date, can be later = post-dated) and
// where it is (status). The "Cheques" account holds cheques received and not deposited, minus cheques issued and not yet
// cleared. Moving a cheque is an ordinary transfer between that account and a bank, so balances and statements follow.
// A bounced cheque is removed like a deleted payment (the party owes / is owed again, its bill goes back to unpaid) and
// stays in the register marked Bounced. Same steps on the counter server and the cloud admin.
export const CHEQUE_STATUS = { pending: 'Not deposited', deposited: 'Deposited', cleared: 'Cleared', bounced: 'Bounced' };
export const chequeStatus = (p) => p.status || (p.reconciled ? 'deposited' : 'pending'); // older cheques marked deposited before statuses existed
const NOT_BANK = ['cash', 'cheque', 'points', 'exchange'];

// What one action does: a transfer to make (or null), fields to save on the cheque, and whether it leaves the books.
export function chequePlan(p, action, { to_mode, date } = {}, today) {
  if (!p || p.mode !== 'cheque') throw new Error('That is not a cheque');
  const st = chequeStatus(p), d = date || today, no = p.ref ? ` ${p.ref}` : '', isIn = p.direction === 'in';
  const move = (mode, to, note) => ({ kind: 'transfer', mode, to_mode: to, amount: p.amount, date: d, note });
  const bank = () => { if (!to_mode || NOT_BANK.includes(to_mode)) throw new Error('Pick the bank account'); return to_mode; };
  if (st === 'bounced') throw new Error('This cheque already bounced');
  if (action === 'deposit') {
    if (!isIn) throw new Error('Only cheques you received are deposited');
    if (st !== 'pending') throw new Error(`Already ${CHEQUE_STATUS[st].toLowerCase()}`);
    if (p.ref_date && d < p.ref_date) throw new Error(`This cheque is dated ${p.ref_date}: the bank takes it on or after that day`);
    const to = bank();
    return { transfer: move('cheque', to, `Cheque${no} deposited`), patch: { status: 'deposited', deposit_to: to, reconciled: d } };
  }
  if (action === 'clear') {
    if (isIn) {
      if (st !== 'deposited') throw new Error('Deposit it first');
      return { transfer: null, patch: { status: 'cleared' } };
    }
    if (st !== 'pending') throw new Error('Already cleared');
    const from = bank(); // a cheque we gave: the money leaves our bank when it is presented
    return { transfer: move(from, 'cheque', `Cheque${no} cleared`), patch: { status: 'cleared', deposit_to: from, reconciled: d } };
  }
  if (action === 'bounce') {
    const moved = p.deposit_to && ['deposited', 'cleared'].includes(st);
    return { transfer: moved ? (isIn ? move(p.deposit_to, 'cheque', `Cheque${no} bounced`) : move('cheque', p.deposit_to, `Cheque${no} bounced`)) : null,
      patch: { status: 'bounced' }, remove: true };
  }
  throw new Error('Unknown cheque action');
}

// The register: every cheque of a branch, newest first, bounced ones included.
export function chequeList(payments, partyName, invoiceNo, today) {
  return payments.filter((p) => p.mode === 'cheque' && p.party_id && (!p.deleted || p.status === 'bounced')) // party_id: real cheques, not the deposit transfers
    .map((p) => ({ id: p.id, date: p.date, direction: p.direction, party: partyName(p.party_id) || p.note || '', amount: p.amount, ref: p.ref || '', ref_date: p.ref_date || '',
      status: chequeStatus(p), deposit_to: p.deposit_to || '', bill: invoiceNo(p.invoice_id) || '', note: p.note || '', post_dated: !!(p.ref_date && p.ref_date > today) }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
