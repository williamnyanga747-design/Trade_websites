import { translate } from './format';

export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
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

  if (isInIframe()) {
    const title = translate('Print & Save PDF Guide', lang);
    const desc = translate(
      'Because this app is running inside the AI Studio preview iframe, your browser blocks the print dialog for security reasons. To print or save as PDF, please click the "Open in New Tab" button at the top right of the preview pane, then click Print there.',
      lang
    );
    onShowIframeWarning(title, desc);
  }
}
