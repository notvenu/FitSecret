import 'server-only';
import { cookies } from 'next/headers';
import { asLang, translator } from './i18n';

export async function getLang() {
  return asLang((await cookies()).get('lang')?.value);
}
export async function getT() {
  return translator(await getLang());
}
