import { translate } from './format';

export function isInIframe(): boolean {
  return false;
}

export function handlePrintWithFallback(
  onShowIframeWarning: (title: string, desc: string) => void,
  lang?: 'en' | 'sw'
) {
  try {
    window.focus();
    window.print();
  } catch (e) {
    console.error('Print action exception:', e);
  }
}

