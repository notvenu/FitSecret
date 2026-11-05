'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Share2, RotateCcw, ImageOff, Stethoscope, Info } from 'lucide-react';
import { recommend, goalsFromText, type FinderProduct, type Attributes, type Answers, type Chip } from '@fitsecret/shared/finder';
import { useCart, type CartLine } from '@/components/cart';
import { useLang, useT } from '@/components/Lang';
import { Flower } from '@/components/Tree';
import { inr0, pourToCart, waLink, WhatsApp } from '@/components/ui';
import { GOALS } from '@/lib/goals';

export type FItem = FinderProduct & { brand: string; image: string | null; mrp: number; at: Attributes; line: Omit<CartLine, 'qty'> };
type Step = 'who' | 'goal' | 'helper' | 'about' | 'safety' | 'computing' | 'result';
type A = Required<Pick<Answers, 'goals' | 'allergens'>> & Omit<Answers, 'goals' | 'allergens' | 'consult' | 'minor'> & { who?: string };

// "Plant Your Need" (GUIDED-FINDER spec, part A). Four steps, then one starter pick, two supporters and optional extras.
// Safety answers live only in this component's state: never stored, never sent. Only "consult mode" is remembered for the
// session, so product pages can show the same doctor note. Everything else is kept 30 minutes so a closed tab can resume.
const SAVE = 'fs_finder', CONSULT = 'fs_finder_consult';
const ORDER: Step[] = ['who', 'goal', 'about', 'safety', 'computing', 'result'];

const S = {
  en: {
    title: 'Plant your need', intro: 'Not sure what to pick? Four quick questions, then one product to start with.',
    step: 'Step {n} of 4', back: 'Back', next: 'Continue', skip: 'Skip',
    who: 'Who is this for?', who_me: 'Me', who_family: 'Someone in my family', who_gift: 'A gift', who_biz: 'My gym or business',
    biz: 'For a gym, clinic or shop we have wholesale prices and GST invoices.', biz_cta: 'Wholesale enquiry', biz_go: 'Show personal picks anyway',
    goal: 'What would you like help with?', goal_hint: 'Pick up to two.', unsure: "I'm not sure", own: 'Or tell us in your own words', own_ph: 'e.g. I want to gain weight',
    own_none: "We couldn't match that to a goal. Pick one below, or ask us on WhatsApp.",
    g_build: 'Build strength and muscle', g_lose: 'Manage weight', g_energy: 'More everyday energy', g_immunity: 'Support everyday immunity', g_digestion: 'Comfortable digestion', g_hair: 'Hair, skin and glow',
    helper: 'Three quick questions', h_workout: 'Do you work out?', h_tired: 'Do you often feel tired?', h_clean: 'Do you want to eat cleaner?', yes: 'Yes', no: 'No', h_done: 'Suggest a goal',
    about: 'A little about you', about_hint: 'All optional. Skip anything.',
    exp: 'Your experience', exp_new: 'New to supplements', exp_some: "I've tried a few", exp_regular: 'I use them regularly',
    diet: 'Food preference', d_veg: 'Vegetarian', d_vegan: 'Vegan', d_egg: 'Eggs are fine', d_any: 'No preference',
    allergy: 'Allergies to avoid', a_milk: 'Milk', a_nuts: 'Nuts', a_gluten: 'Gluten', a_soy: 'Soy', a_none: 'None',
    form: 'Preferred form', f_powder: 'Powder', f_capsule: 'Capsules / tablets', f_drink: 'Ready drink mix', f_food: 'Food (millets, oils, honey)', f_any: 'Any',
    budget: 'Budget per month', b_u500: 'Under ₹500', b_u1000: '₹500–1,000', b_u2000: '₹1,000–2,000', b_any: 'Flexible',
    safety: 'A few things so we suggest safely', safety_note: 'This is not a medical assessment. Your answers stay on this device.',
    s_preg: "I'm pregnant or breastfeeding", s_minor: "I'm under 18", s_meds: 'I take regular medicines', s_cond: 'I have a health condition (for example thyroid, blood pressure, diabetes, kidney or liver)', s_none: 'None of these',
    computing: 'Finding your starter plant…', result: 'Your starter plant', because: 'Because you said:', start: 'Start here', grows: 'Grows well with this', later: 'Later, when you are ready',
    kit: 'Your starter kit', kit_add: 'Add whole kit', added: 'Added', add: 'Add to cart', details: 'See details', share: 'Share', copied: 'Link copied', retake: 'Retake',
    human: 'Prefer to talk? Ask us on WhatsApp',
    doctor: 'Because of what you told us, please check with your doctor before starting any supplement. Here are gentle food-based options you can ask them about.',
    minor_note: 'Please choose together with a parent or guardian, and check with a doctor.',
    label: 'You told us about an allergy. We left out products that mention it, but always read the label before buying.',
    none: "We couldn't find a safe match online. Let's talk. A person will help you choose.", talk: 'Talk to us on WhatsApp',
    disclaimer: 'General wellness guidance based on product labels. Not medical advice. If you are pregnant, have a health condition or take medicines, check with your doctor first.',
    shared: 'Picks shared with you', shared_hint: 'Want picks for yourself?', resume: 'Picked up where you left off.',
    c_beginner: 'Beginner-friendly', c_vegan: 'Vegan', c_veg: 'Vegetarian', c_budget: 'Fits your budget', c_food: 'A food, not a supplement',
    c_form_powder: 'Powder', c_form_capsule: 'Capsules', c_form_drink: 'Drink mix', c_form_food: 'Food',
  },
  te: {
    title: 'మీ అవసరం చెప్పండి', intro: 'ఏది ఎంచుకోవాలో తెలియదా? నాలుగు చిన్న ప్రశ్నలు, తర్వాత మొదలుపెట్టడానికి ఒక ఉత్పత్తి.',
    step: '4లో {n}వ దశ', back: 'వెనక్కి', next: 'కొనసాగించు', skip: 'దాటవేయి',
    who: 'ఇది ఎవరి కోసం?', who_me: 'నా కోసం', who_family: 'కుటుంబంలో ఒకరి కోసం', who_gift: 'బహుమతి', who_biz: 'నా జిమ్ లేదా వ్యాపారం',
    biz: 'జిమ్, క్లినిక్ లేదా షాప్‌కు హోల్‌సేల్ ధరలు, GST ఇన్వాయిస్‌లు ఉన్నాయి.', biz_cta: 'హోల్‌సేల్ విచారణ', biz_go: 'అయినా వ్యక్తిగత సూచనలు చూపించు',
    goal: 'దేనికి సహాయం కావాలి?', goal_hint: 'రెండు వరకు ఎంచుకోండి.', unsure: 'నాకు తెలియదు', own: 'లేదా మీ మాటల్లో చెప్పండి', own_ph: 'ఉదా: బరువు పెరగాలి',
    own_none: 'దాన్ని ఒక లక్ష్యానికి సరిపోల్చలేకపోయాం. కింద ఒకటి ఎంచుకోండి, లేదా వాట్సాప్‌లో అడగండి.',
    g_build: 'బలం, కండరాలు', g_lose: 'బరువు నియంత్రణ', g_energy: 'రోజంతా శక్తి', g_immunity: 'రోజువారీ రోగనిరోధక శక్తి', g_digestion: 'సుఖమైన జీర్ణక్రియ', g_hair: 'జుట్టు, చర్మం, మెరుపు',
    helper: 'మూడు చిన్న ప్రశ్నలు', h_workout: 'మీరు వ్యాయామం చేస్తారా?', h_tired: 'తరచూ అలసటగా ఉంటుందా?', h_clean: 'ఆరోగ్యకరంగా తినాలనుకుంటున్నారా?', yes: 'అవును', no: 'కాదు', h_done: 'లక్ష్యం సూచించు',
    about: 'మీ గురించి కొంచెం', about_hint: 'అన్నీ ఐచ్ఛికం. ఏదైనా దాటవేయవచ్చు.',
    exp: 'మీ అనుభవం', exp_new: 'సప్లిమెంట్లు కొత్త', exp_some: 'కొన్ని వాడాను', exp_regular: 'క్రమం తప్పకుండా వాడతాను',
    diet: 'ఆహార అలవాటు', d_veg: 'శాకాహారం', d_vegan: 'వీగన్', d_egg: 'గుడ్లు పర్వాలేదు', d_any: 'ఏదైనా',
    allergy: 'దూరం పెట్టాల్సిన అలర్జీలు', a_milk: 'పాలు', a_nuts: 'గింజలు', a_gluten: 'గ్లూటెన్', a_soy: 'సోయా', a_none: 'ఏవీ లేవు',
    form: 'ఇష్టమైన రూపం', f_powder: 'పొడి', f_capsule: 'క్యాప్సూల్స్ / మాత్రలు', f_drink: 'డ్రింక్ మిక్స్', f_food: 'ఆహారం (మిల్లెట్లు, నూనెలు, తేనె)', f_any: 'ఏదైనా',
    budget: 'నెలకు బడ్జెట్', b_u500: '₹500 లోపు', b_u1000: '₹500–1,000', b_u2000: '₹1,000–2,000', b_any: 'పరిమితి లేదు',
    safety: 'సురక్షితంగా సూచించడానికి కొన్ని విషయాలు', safety_note: 'ఇది వైద్య పరీక్ష కాదు. మీ సమాధానాలు ఈ పరికరంలోనే ఉంటాయి.',
    s_preg: 'నేను గర్భవతిని లేదా పాలిస్తున్నాను', s_minor: 'నా వయసు 18 లోపు', s_meds: 'నేను క్రమం తప్పకుండా మందులు వాడతాను', s_cond: 'నాకు ఆరోగ్య సమస్య ఉంది (ఉదా: థైరాయిడ్, బీపీ, షుగర్, కిడ్నీ లేదా లివర్)', s_none: 'ఇవేవీ కాదు',
    computing: 'మీ మొక్కను వెతుకుతున్నాం…', result: 'మీ మొదటి మొక్క', because: 'మీరు చెప్పినందుకు:', start: 'ఇక్కడ మొదలుపెట్టండి', grows: 'దీనితో బాగా సరిపోతాయి', later: 'తర్వాత, మీరు సిద్ధమైనప్పుడు',
    kit: 'మీ స్టార్టర్ కిట్', kit_add: 'మొత్తం కిట్ జోడించు', added: 'జోడించాం', add: 'కార్ట్‌కు జోడించు', details: 'వివరాలు', share: 'షేర్', copied: 'లింక్ కాపీ అయింది', retake: 'మళ్లీ',
    human: 'మాట్లాడాలనుకుంటున్నారా? వాట్సాప్‌లో అడగండి',
    doctor: 'మీరు చెప్పిన దాని వల్ల, ఏ సప్లిమెంట్ మొదలుపెట్టే ముందైనా మీ డాక్టర్‌ను సంప్రదించండి. వారిని అడగడానికి కొన్ని ఆహార ఆధారిత ఎంపికలు ఇవి.',
    minor_note: 'తల్లిదండ్రులు లేదా సంరక్షకులతో కలిసి ఎంచుకోండి, డాక్టర్‌ను సంప్రదించండి.',
    label: 'మీరు అలర్జీ గురించి చెప్పారు. దాన్ని పేర్కొన్న ఉత్పత్తులను తీసేశాం, కానీ కొనే ముందు లేబుల్ తప్పక చదవండి.',
    none: 'ఆన్‌లైన్‌లో సురక్షితమైన ఎంపిక దొరకలేదు. మాట్లాడదాం. ఒక వ్యక్తి మీకు సహాయం చేస్తారు.', talk: 'వాట్సాప్‌లో మాట్లాడండి',
    disclaimer: 'ఉత్పత్తి లేబుళ్ల ఆధారంగా సాధారణ ఆరోగ్య సూచన. వైద్య సలహా కాదు. గర్భవతి అయితే, ఆరోగ్య సమస్య ఉంటే లేదా మందులు వాడుతుంటే ముందు డాక్టర్‌ను సంప్రదించండి.',
    shared: 'మీతో పంచుకున్న సూచనలు', shared_hint: 'మీ కోసం సూచనలు కావాలా?', resume: 'మీరు ఆపిన చోటు నుండి కొనసాగిస్తున్నాం.',
    c_beginner: 'కొత్తవారికి అనుకూలం', c_vegan: 'వీగన్', c_veg: 'శాకాహారం', c_budget: 'మీ బడ్జెట్‌లో', c_food: 'ఆహారం, సప్లిమెంట్ కాదు',
    c_form_powder: 'పొడి', c_form_capsule: 'క్యాప్సూల్స్', c_form_drink: 'డ్రింక్ మిక్స్', c_form_food: 'ఆహారం',
  },
};
type K = keyof typeof S.en;

const GOAL_FLOWER = (g: string) => `var(--color-goal-${g})`;

export default function Finder({ items, phone, shared }: { items: FItem[]; phone: string; shared: string[] | null }) {
  const lang = useLang();
  const tt = useT();
  const s = (k: K, v?: Record<string, string | number>) => Object.entries(v || {}).reduce((x, [a, b]) => x.replace(`{${a}}`, String(b)), S[lang][k] || S.en[k]);
  const { add } = useCart();
  const [step, setStep] = useState<Step>(shared ? 'result' : 'who');
  const [a, setA] = useState<A>({ goals: [], allergens: [] });
  const [safety, setSafety] = useState<string[]>([]); // never persisted
  const [text, setText] = useState('');
  const [textMiss, setTextMiss] = useState(false);
  const [helper, setHelper] = useState<Record<string, boolean>>({});
  const [resumed, setResumed] = useState(false);
  const [kitDone, setKitDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);

  // resume within 30 minutes (answers only; the safety step is always asked again)
  useEffect(() => {
    if (shared) return;
    try {
      const v = JSON.parse(sessionStorage.getItem(SAVE) || 'null');
      if (v && Date.now() - v.ts < 30 * 60e3 && v.a?.goals) {
        setA(v.a);
        const st = ['who', 'goal', 'about'].includes(v.step) ? v.step : 'about';
        if (st !== 'who') { setStep(st); setResumed(true); }
      }
    } catch {}
  }, [shared]);
  useEffect(() => { if (!shared && step !== 'result' && step !== 'computing') try { sessionStorage.setItem(SAVE, JSON.stringify({ a, step, ts: Date.now() })); } catch {} }, [a, step, shared]);

  const consult = safety.some((x) => x !== 'none');
  const minor = safety.includes('minor');
  const rec = useMemo(() => (step === 'result' && !shared ? recommend(items, { ...a, consult, minor }) : null), [step, shared, items, a, consult, minor]);
  const go = (to: Step) => { setStep(to); window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
  const compute = () => {
    try { sessionStorage.setItem(CONSULT, consult ? '1' : ''); sessionStorage.setItem(SAVE, JSON.stringify({ a, step: 'result', ts: Date.now() })); } catch {}
    go('computing');
    setTimeout(() => setStep('result'), 700);
  };
  const toggle = <T extends string>(list: T[], v: T, max = 9) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v].slice(-max));
  const stage = { who: 0, goal: 1, helper: 1, about: 2, safety: 3, computing: 4, result: 5 }[step];
  const goalColor = a.goals[0] ? GOAL_FLOWER(a.goals[0]) : 'var(--color-leaf)';

  // shared link: products only, no answers
  const picks = shared ? shared.map((k) => byKey.get(k)).filter(Boolean) as FItem[] : null;
  const anchor = rec?.anchor ? byKey.get(rec.anchor.key) : picks?.[0];
  const supporters = rec ? rec.supporters.map((x) => byKey.get(x.key)!) : picks?.slice(1, 3) || [];
  const optional = rec ? rec.optional.map((x) => byKey.get(x.key)!) : picks?.slice(3) || [];
  const why = (k: string) => [rec?.anchor, ...(rec?.supporters || []), ...(rec?.optional || [])].find((x) => x?.key === k)?.why || [];
  const kit = [anchor, ...supporters].filter(Boolean) as FItem[];
  const kitTotal = kit.reduce((n, i) => n + i.price, 0);
  const shareUrl = typeof location !== 'undefined' ? `${location.origin}/finder?r=${[anchor, ...supporters, ...optional].filter(Boolean).map((i) => i!.key).join(',')}` : '';
  const wa = waLink(phone, anchor ? `Hi Fit Secrets, the finder suggested ${[anchor, ...supporters].filter(Boolean).map((i) => i!.name).join(', ')}. Can you help me choose?` : 'Hi Fit Secrets, can you help me choose a product?');

  const addKit = (el: HTMLElement) => {
    kit.forEach((i, n) => setTimeout(() => { add(i.line, 1, false); pourToCart(el); }, n * 150));
    setKitDone(true);
  };
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: s('result'), url: shareUrl }); else { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } } catch {}
  };
  const retake = () => { setA({ goals: [], allergens: [] }); setSafety([]); setKitDone(false); try { sessionStorage.removeItem(SAVE); } catch {} if (shared) location.href = '/finder'; else go('goal'); };
  const chipText = (c: Chip) => (c.k === 'goal' ? tt(`goal.${c.g}` as never) : c.k === 'form' ? s(`c_form_${c.form}` as K) : s(`c_${c.k}` as K));

  return (
    <div className="page-top min-h-dvh bg-sky pb-24">
      <div className="mx-auto max-w-[880px] px-4 md:px-8">
        <div className="flex items-end gap-4">
          <Plant stage={stage} color={goalColor} />
          <div className="pb-2">
            <h1 className="h2 text-indigo">{step === 'result' ? (shared ? s('shared') : s('result')) : s('title')}</h1>
            {stage < 4 && <p className="mt-1 text-sm text-ink-soft" aria-live="polite">{step === 'who' ? s('intro') : s('step', { n: Math.min(stage + 1, 4) })}</p>}
          </div>
        </div>
        {resumed && step !== 'result' && <p role="status" className="rise mt-4 rounded-full bg-lime px-4 py-2 text-sm font-semibold text-indigo">{s('resume')}</p>}

        <div key={step} className="mt-8 animate-[slide_320ms_var(--ease-grow)_both]">
          <style>{`@keyframes slide{from{opacity:0;transform:translateX(24px)}}`}</style>

          {step === 'who' && (
            <Card title={s('who')}>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['me', 'family', 'gift', 'biz'] as const).map((w) => (
                  <Big key={w} on={a.who === w} onClick={() => { setA({ ...a, who: w }); if (w !== 'biz') go('goal'); }}>{s(`who_${w}` as K)}</Big>
                ))}
              </div>
              {a.who === 'biz' && (
                <div className="rise mt-5 rounded-[20px] bg-marigold/30 p-4">
                  <p>{s('biz')}</p>
                  <div className="mt-3 flex flex-wrap gap-2"><Link href="/wholesale" className="btn btn-gold">{s('biz_cta')}</Link><button type="button" onClick={() => go('goal')} className="btn btn-ghost">{s('biz_go')}</button></div>
                </div>
              )}
            </Card>
          )}

          {step === 'goal' && (
            <Card title={s('goal')} hint={s('goal_hint')}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {GOALS.map((g) => {
                  const on = a.goals.includes(g.slug);
                  return (
                    <button key={g.slug} type="button" aria-pressed={on} onClick={() => setA({ ...a, goals: toggle(a.goals, g.slug, 2) })}
                      className={`group flex min-h-36 flex-col items-start gap-2 rounded-[20px] border-2 p-4 text-left transition-[background-color,transform] duration-[350ms] ease-[var(--ease-stamp)] ${on ? 'scale-[1.03] border-indigo bg-lime' : 'border-indigo/25 bg-paper hover:border-indigo'}`}>
                      <Flower color={GOAL_FLOWER(g.slug)} size={44} />
                      <span className="display text-lg leading-tight text-indigo">{tt(g.label)}</span>
                      <span className="text-sm text-ink-soft">{s(`g_${g.slug}` as K)}</span>
                      {on && <span className="ml-auto -mt-1 grid size-6 place-items-center rounded-full bg-indigo text-paper"><Check size={14} /></span>}
                    </button>
                  );
                })}
              </div>
              <form className="mt-6" onSubmit={(e) => { e.preventDefault(); const g = goalsFromText(text); setTextMiss(!g.length); if (g.length) setA({ ...a, goals: g }); }}>
                <label htmlFor="own" className="text-sm font-semibold">{s('own')}</label>
                <div className="mt-2 flex gap-2"><input id="own" className="field flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder={s('own_ph')} /><button className="btn btn-dark">OK</button></div>
                {textMiss && <p className="mt-2 text-sm">{s('own_none')} <a href={wa} target="_blank" rel="noreferrer" className="font-semibold text-indigo underline">WhatsApp</a></p>}
              </form>
              <Nav back={() => go('who')} next={() => go('about')} ok={a.goals.length > 0} s={s}>
                <button type="button" onClick={() => go('helper')} className="font-semibold text-indigo underline underline-offset-4">{s('unsure')}</button>
              </Nav>
            </Card>
          )}

          {step === 'helper' && (
            <Card title={s('helper')}>
              {(['workout', 'tired', 'clean'] as const).map((q) => (
                <div key={q} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-4">
                  <span className="font-semibold">{s(`h_${q}` as K)}</span>
                  <span className="flex gap-2">{[true, false].map((v) => <button key={String(v)} type="button" aria-pressed={helper[q] === v} onClick={() => setHelper({ ...helper, [q]: v })} className="chip">{s(v ? 'yes' : 'no')}</button>)}</span>
                </div>
              ))}
              <Nav back={() => go('goal')} s={s} ok={Object.values(helper).some(Boolean)} label={s('h_done')} next={() => {
                const g = [helper.workout && 'build', helper.tired && 'energy', helper.clean && 'lose'].filter(Boolean).slice(0, 2) as string[];
                setA({ ...a, goals: g }); go('goal');
              }}><a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-indigo"><WhatsApp size={16} />WhatsApp</a></Nav>
            </Card>
          )}

          {step === 'about' && (
            <Card title={s('about')} hint={s('about_hint')}>
              <Row label={s('exp')}>{(['new', 'some', 'regular'] as const).map((v) => <Chp key={v} on={a.experience === v} onClick={() => setA({ ...a, experience: a.experience === v ? null : v })}>{s(`exp_${v}` as K)}</Chp>)}</Row>
              <Row label={s('diet')}>{(['veg', 'vegan', 'egg', 'any'] as const).map((v) => <Chp key={v} on={(a.diet ?? 'any') === v && (v !== 'any' || a.diet === null)} onClick={() => setA({ ...a, diet: v === 'any' ? null : v })}>{s(`d_${v}` as K)}</Chp>)}</Row>
              <Row label={s('allergy')}>
                {(['milk', 'nuts', 'gluten', 'soy'] as const).map((v) => <Chp key={v} on={a.allergens.includes(v)} onClick={() => setA({ ...a, allergens: toggle(a.allergens, v) })}>{s(`a_${v}` as K)}</Chp>)}
                <Chp on={!a.allergens.length} onClick={() => setA({ ...a, allergens: [] })}>{s('a_none')}</Chp>
              </Row>
              <Row label={s('form')}>{(['powder', 'capsule', 'drink', 'food', 'any'] as const).map((v) => <Chp key={v} on={(a.form ?? 'any') === v} onClick={() => setA({ ...a, form: v === 'any' ? null : v })}>{s(`f_${v}` as K)}</Chp>)}</Row>
              <Row label={s('budget')}>{(['u500', 'u1000', 'u2000', 'any'] as const).map((v) => <Chp key={v} on={(a.budget ?? 'any') === v} onClick={() => setA({ ...a, budget: v === 'any' ? null : v })}>{s(`b_${v}` as K)}</Chp>)}</Row>
              <Nav back={() => go('goal')} next={() => go('safety')} ok s={s} />
            </Card>
          )}

          {step === 'safety' && (
            <Card title={s('safety')} hint={s('safety_note')}>
              <div className="grid gap-2">
                {(['preg', 'minor', 'meds', 'cond'] as const).map((v) => (
                  <label key={v} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] border-2 border-indigo/25 bg-paper px-4 py-3 has-[:checked]:border-indigo has-[:checked]:bg-lime">
                    <input type="checkbox" className="size-5 accent-[var(--color-indigo)]" checked={safety.includes(v)} onChange={() => setSafety(toggle(safety.filter((x) => x !== 'none'), v))} />{s(`s_${v}` as K)}
                  </label>
                ))}
                <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] border-2 border-indigo/25 bg-paper px-4 py-3 has-[:checked]:border-indigo has-[:checked]:bg-lime">
                  <input type="checkbox" className="size-5 accent-[var(--color-indigo)]" checked={safety.includes('none')} onChange={() => setSafety(safety.includes('none') ? [] : ['none'])} />{s('s_none')}
                </label>
              </div>
              <Nav back={() => go('about')} next={compute} ok={safety.length > 0} s={s} />
            </Card>
          )}

          {step === 'computing' && <p className="py-16 text-center text-lg font-semibold text-indigo" role="status">{s('computing')}</p>}

          {step === 'result' && (
            !anchor ? (
              <Card title={s('none')}>
                <a href={wa} target="_blank" rel="noreferrer" className="btn btn-gold"><WhatsApp size={18} />{s('talk')}</a>
                <button type="button" onClick={retake} className="btn btn-ghost ml-2"><RotateCcw size={16} />{s('retake')}</button>
              </Card>
            ) : (
              <div className="grid gap-6">
                {!shared && (
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{s('because')}</span>
                    {[...a.goals.map((g) => tt(`goal.${g}` as never)), a.diet && s(`d_${a.diet}` as K), a.experience && s(`exp_${a.experience}` as K)].filter(Boolean).map((x) => <span key={x as string} className="rounded-full border-2 border-indigo bg-paper px-3 py-0.5 font-semibold text-indigo">{x}</span>)}
                  </p>
                )}
                {consult && <Note icon={<Stethoscope size={22} />}>{s('doctor')}{minor && <> {s('minor_note')}</>}</Note>}
                {a.allergens.length > 0 && !shared && <Note icon={<Info size={22} />}>{s('label')}</Note>}

                <section aria-label={s('start')}>
                  <p className="mb-2 font-bold text-coral">{s('start')}</p>
                  <PickCard i={anchor} why={why(anchor.key)} chip={chipText} big s={s} onAdd={(el) => { add(anchor.line, 1, false); pourToCart(el); }} />
                </section>
                {supporters.length > 0 && (
                  <section>
                    <h2 className="h3 text-indigo">{s('grows')}</h2>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">{supporters.map((i, n) => <div key={i.key} className="animate-[slide_400ms_var(--ease-grow)_both]" style={{ animationDelay: `${200 + n * 120}ms` }}><PickCard i={i} why={why(i.key)} chip={chipText} s={s} onAdd={(el) => { add(i.line, 1, false); pourToCart(el); }} /></div>)}</div>
                  </section>
                )}
                {optional.length > 0 && (
                  <details className="rounded-[20px] border-2 border-indigo/25 bg-paper p-4">
                    <summary className="font-semibold text-indigo">{s('later')} ({optional.length})</summary>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">{optional.map((i) => <PickCard key={i.key} i={i} why={why(i.key)} chip={chipText} s={s} onAdd={(el) => { add(i.line, 1, false); pourToCart(el); }} />)}</div>
                  </details>
                )}
                {kit.length > 1 && (
                  <div className="sticker flex flex-wrap items-center justify-between gap-4 rounded-[24px] bg-indigo p-5 text-paper">
                    <div><p className="font-semibold">{s('kit')} · {kit.length}</p><p className="num display text-3xl">{inr0(kitTotal)}</p></div>
                    <button type="button" onClick={(e) => addKit(e.currentTarget)} className="btn btn-dark">{kitDone ? <><Check size={18} />{s('added')}</> : s('kit_add')}</button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <a href={wa} target="_blank" rel="noreferrer" className="btn btn-ghost"><WhatsApp size={18} />{s('human')}</a>
                  <button type="button" onClick={share} className="btn btn-ghost"><Share2 size={16} />{copied ? s('copied') : s('share')}</button>
                  <button type="button" onClick={retake} className="btn btn-ghost"><RotateCcw size={16} />{shared ? s('shared_hint') : s('retake')}</button>
                </div>
                <p className="text-xs text-ink-soft">{s('disclaimer')}</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="sticker rounded-[28px] bg-paper p-5 md:p-8">
      <h2 className="h3 text-indigo">{title}</h2>
      {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
const Big = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" aria-pressed={on} onClick={onClick} className={`min-h-16 rounded-[18px] border-2 px-5 py-4 text-left text-lg font-semibold text-indigo transition-[background-color,transform] duration-[350ms] ease-[var(--ease-stamp)] ${on ? 'scale-[1.02] border-indigo bg-lime' : 'border-indigo/25 bg-paper hover:border-indigo'}`}>{children}</button>
);
const Chp = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => <button type="button" aria-pressed={on} onClick={onClick} className="chip">{children}</button>;
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <fieldset className="border-b border-line py-4 last-of-type:border-0"><legend className="mb-2 text-sm font-semibold">{label}</legend><div className="flex flex-wrap gap-2">{children}</div></fieldset>
);
function Nav({ back, next, ok, s, label, children }: { back: () => void; next: () => void; ok: boolean; s: (k: K) => string; label?: string; children?: React.ReactNode }) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <button type="button" onClick={back} className="btn btn-ghost"><ArrowLeft size={18} />{s('back')}</button>
      <span className="flex-1">{children}</span>
      <button type="button" onClick={next} disabled={!ok} className="btn btn-gold">{label || s('next')}<ArrowRight size={18} /></button>
    </div>
  );
}
const Note = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
  <p className="flex gap-3 rounded-[20px] border-2 border-indigo bg-paper p-4 text-indigo"><span className="mt-0.5 shrink-0 text-coral">{icon}</span><span>{children}</span></p>
);

function PickCard({ i, why, chip, big, s, onAdd }: { i: FItem; why: Chip[]; chip: (c: Chip) => string; big?: boolean; s: (k: K) => string; onAdd: (el: HTMLElement) => void }) {
  const [done, setDone] = useState(false);
  const goal = i.goals[0];
  return (
    <div className={`sticker grid gap-4 rounded-[24px] bg-paper p-4 ${big ? 'stamp md:grid-cols-[240px_1fr] md:p-5' : 'grid-cols-[96px_1fr]'}`}>
      <div className={`relative overflow-hidden rounded-[18px] ${big ? 'aspect-square' : 'size-24'}`} style={{ background: goal ? `color-mix(in srgb, var(--color-goal-${goal}) 30%, white)` : 'var(--color-sky)' }}>
        {i.image ? <Image src={i.image} alt="" fill sizes={big ? '240px' : '96px'} className="object-contain p-3 mix-blend-multiply" /> : <ImageOff className="absolute inset-0 m-auto text-mist" />}
      </div>
      <div className="flex min-w-0 flex-col">
        {i.brand && <p className="text-xs text-ink-soft">{i.brand}</p>}
        <h3 className={`font-bold text-indigo ${big ? 'h3' : 'line-clamp-2 leading-snug'}`}>{i.name}</h3>
        <p className="num mt-1 font-extrabold text-indigo">{inr0(i.price)}{i.mrp > i.price && <s className="ml-2 text-sm font-normal text-ink-soft">{inr0(i.mrp)}</s>}</p>
        {why.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">{why.map((c, n) => <li key={n} className="stamp inline-flex items-center gap-1 rounded-full bg-lime px-2.5 py-0.5 text-xs font-bold text-indigo" style={{ animationDelay: `${300 + n * 80}ms` }}><Check size={12} />{chip(c)}</li>)}</ul>
        )}
        <div className={`mt-auto flex flex-wrap gap-2 pt-3 ${big ? '' : 'text-sm'}`}>
          <button type="button" onClick={(e) => { onAdd(e.currentTarget); setDone(true); }} className={`btn btn-gold ${big ? '' : 'min-h-10 px-4 py-2 text-sm'}`}>{done ? <><Check size={16} />{s('added')}</> : s('add')}</button>
          <Link href={`/p/${i.key}`} className={`btn btn-ghost ${big ? '' : 'min-h-10 px-4 py-2 text-sm'}`}>{s('details')}</Link>
        </div>
      </div>
    </div>
  );
}

// Progress as a growing plant (A3): seed → stem → leaves in the goal colour → branches → bud → bloom.
// Each answer drops water (key change replays the droplet). Reduced motion: stages simply fade (globals.css).
function Plant({ stage, color }: { stage: number; color: string }) {
  return (
    <svg viewBox="0 0 80 100" className="h-24 w-20 shrink-0" role="img" aria-label={`Progress ${Math.min(stage, 4)} of 4`}>
      <circle key={stage} cx="40" cy="8" r="3" fill="#8FD3C4" className="animate-[drip_300ms_ease-in_both] motion-reduce:hidden" />
      <style>{`@keyframes drip{from{transform:translateY(0);opacity:1}to{transform:translateY(40px);opacity:0}}`}</style>
      <path d="M22 78h36l-4 20H26Z" fill="#E5483B" transform="translate(2 2)" /><path d="M22 78h36l-4 20H26Z" fill="#fff" stroke="#17237A" strokeWidth="2.5" strokeLinejoin="round" />
      <path pathLength={1} d="M40 78 C 38 64, 42 54, 40 40" fill="none" stroke="#2E9E5B" strokeWidth={stage >= 3 ? 4 : 2.5} strokeLinecap="round"
        style={{ strokeDasharray: 1, strokeDashoffset: stage >= 1 ? 1 - Math.min(stage, 4) / 4 : 1, transition: 'stroke-dashoffset 500ms var(--ease-grow), stroke-width 500ms' }} />
      {stage >= 2 && <g className="tree-pop" fill={color} stroke="#17237A" strokeWidth="1.5"><ellipse cx="33" cy="62" rx="7" ry="3.5" transform="rotate(-30 33 62)" /><ellipse cx="47" cy="56" rx="7" ry="3.5" transform="rotate(30 47 56)" /></g>}
      {stage >= 3 && <g className="tree-pop" fill="#C9F26B" stroke="#17237A" strokeWidth="1.5"><ellipse cx="34" cy="48" rx="6" ry="3" transform="rotate(-35 34 48)" /><ellipse cx="46" cy="44" rx="6" ry="3" transform="rotate(35 46 44)" /></g>}
      {stage === 4 && <circle cx="40" cy="38" r="5" fill={color} stroke="#17237A" strokeWidth="1.5" className="tree-pop animate-pulse" />}
      {stage >= 5 && <g transform="translate(40 34)"><g className="tree-pop">{[0, 60, 120, 180, 240, 300].map((r) => <ellipse key={r} cy="-7" rx="4" ry="7" fill={color} stroke="#17237A" strokeWidth="1.2" transform={`rotate(${r})`} />)}<circle r="3.5" fill="#FFB81F" stroke="#17237A" strokeWidth="1.2" /></g></g>}
    </svg>
  );
}
