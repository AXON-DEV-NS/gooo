import { isLocalStorageAvailable } from '../storage/repository.js';

export function collectTvDiagnostics() {
  const width = globalThis.innerWidth || 0;
  const height = globalThis.innerHeight || 0;
  const screenW = globalThis.screen?.width || width;
  const screenH = globalThis.screen?.height || height;
  const dpr = Number(globalThis.devicePixelRatio || 1);

  let resolutionTier = 'مقاس مخصص';
  if (width >= 1900 && height >= 1060) resolutionTier = 'Full HD (1080p) أو أعلى';
  else if (width >= 1260 && height >= 700) resolutionTier = 'HD (720p) قياسي للتلفاز';
  else if (width < 960) resolutionTier = 'شاشة صغيرة / عرض متجاوب';

  let islamicCalendarSupported = false;
  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { year: 'numeric' });
    const formatted = fmt.format(new Date('2026-11-16T12:00:00Z'));
    const yearNum = Number(String(formatted).replace(/\D/g, ''));
    islamicCalendarSupported = yearNum >= 1300 && yearNum <= 1700;
  } catch {
    islamicCalendarSupported = false;
  }

  const cssVarsSupported =
    typeof globalThis.CSS?.supports === 'function'
      ? globalThis.CSS.supports('--test', '0') && globalThis.CSS.supports('display', 'grid')
      : true;

  return {
    viewportWidth: width,
    viewportHeight: height,
    screenWidth: screenW,
    screenHeight: screenH,
    dpr,
    resolutionTier,
    isLandscape16x9: width > 0 && height > 0 ? Math.abs(width / height - 16 / 9) < 0.15 : false,
    userAgent: globalThis.navigator?.userAgent || 'غير متاح',
    online: globalThis.navigator?.onLine ?? true,
    localStorageOk: isLocalStorageAvailable(),
    audioElementSupported: typeof globalThis.Audio !== 'undefined',
    webAudioSupported: Boolean(globalThis.AudioContext || globalThis.webkitAudioContext),
    fetchSupported: typeof globalThis.fetch === 'function' && typeof globalThis.AbortController === 'function',
    serviceWorkerSupported: Boolean(globalThis.navigator?.serviceWorker),
    cssGridAndVarsSupported: cssVarsSupported,
    islamicCalendarSupported,
    checkedAt: new Date().toISOString(),
  };
}
