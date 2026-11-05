'use client';
import { createContext, useContext, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { translator, type Lang } from '@/lib/i18n';

const Ctx = createContext<Lang>('en');

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

export function useT() {
  const lang = useContext(Ctx);
  return useMemo(() => translator(lang), [lang]);
}

// Switch language in place: cookie, then re-render the server tree. Cart and scroll stay put.
export function LangToggle({ className = '' }: { className?: string }) {
  const lang = useContext(Ctx);
  const t = useT();
  const router = useRouter();
  const flip = () => {
    document.cookie = `lang=${lang === 'te' ? 'en' : 'te'};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  };
  return (
    <button type="button" onClick={flip} className={className} lang={lang === 'te' ? 'en' : 'te'} aria-label={lang === 'te' ? 'Switch to English' : 'తెలుగులో చూడండి'}>
      {t('lang.switch')}
    </button>
  );
}
