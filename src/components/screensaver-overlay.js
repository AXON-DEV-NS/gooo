import { getSurahByNumber } from '../data/quran-surahs.js';
import {
  formatScreensaverData,
  getAntiBurnInOffset,
  getDiscoveredBackgrounds,
  isScreensaverNightDimmed,
  selectActiveBackground,
} from '../services/screensaver.js';
import { clearNode, el } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const WEATHER_ICON_PATHS = {
  sun: [
    'M12 3v2',
    'M12 19v2',
    'M4.93 4.93l1.41 1.41',
    'M17.66 17.66l1.41 1.41',
    'M3 12h2',
    'M19 12h2',
    'M6.34 17.66l-1.41 1.41',
    'M19.07 4.93l-1.41 1.41',
    'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z',
  ],
  cloud: ['M17.5 19H9a5 5 0 1 1 1.07-9.88A6 6 0 0 1 21 12.5A4.5 4.5 0 0 1 17.5 19z'],
  rain: [
    'M17.5 16H9a5 5 0 1 1 1.07-9.88A6 6 0 0 1 21 9.5A4.5 4.5 0 0 1 17.5 16z',
    'M10 19l-1 3',
    'M14 19l-1 3',
    'M18 19l-1 3',
  ],
  storm: [
    'M17.5 16H9a5 5 0 1 1 1.07-9.88A6 6 0 0 1 21 9.5A4.5 4.5 0 0 1 17.5 16z',
    'M13 16l-2 4h3l-2 3',
  ],
  fog: ['M4 10h16', 'M4 14h16', 'M6 18h12'],
};

export function createWeatherLineIcon(key = 'cloud', size = 20) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const paths = WEATHER_ICON_PATHS[key] || WEATHER_ICON_PATHS.cloud;
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

export function renderScreensaverPresetStage(presetId, data) {
  const weatherSpan = el(
    'span',
    { className: 'ss-weather-inline' },
    createWeatherLineIcon(data.weatherIconKey, 20),
    el('span', { dataset: { ssWeather: '1' } }, data.weatherText)
  );

  if (presetId === 'editorial_manuscript') {
    return el(
      'div',
      { className: 'ss-preset-editorial_manuscript ss-text-shadow' },
      el(
        'div',
        { className: 'ss-col-clock' },
        el('div', { className: 'ss-clock-digits ss-font-amiri tabular-nums', dataset: { ssClock: '1' } }, data.timeDigits),
        el('div', { className: 'ss-period-ruqaa ss-font-ruqaa ss-gold', dataset: { ssPeriod: '1' } }, data.periodLabel)
      ),
      el('div', { className: 'ss-gold-rule-v', 'aria-hidden': 'true' }),
      el(
        'div',
        { className: 'ss-col-info' },
        el('div', { className: 'ss-hijri-big ss-font-ruqaa ss-gold', dataset: { ssHijri: '1' } }, data.hijriFull),
        el('div', { className: 'ss-greg-sub ss-font-kufi', dataset: { ssGregorian: '1' } }, data.gregorianFull),
        el('div', { className: 'ss-weather-sub' }, weatherSpan)
      )
    );
  }

  if (presetId === 'gallery_corner') {
    return el(
      'div',
      { className: 'ss-preset-gallery_corner' },
      el(
        'div',
        { className: 'ss-gallery-card ss-text-shadow' },
        el(
          'div',
          { className: 'ss-clock-row' },
          el('span', { className: 'ss-clock-digits ss-font-amiri tabular-nums', dataset: { ssClock: '1' } }, data.timeDigits),
          el('span', { className: 'ss-period ss-font-ruqaa ss-gold', dataset: { ssPeriod: '1' } }, data.periodLabel)
        ),
        el('div', { className: 'ss-hijri-ruqaa ss-font-ruqaa ss-gold', dataset: { ssHijri: '1' } }, data.hijriFull),
        el(
          'div',
          { className: 'ss-meta-line' },
          el('span', { dataset: { ssGregorian: '1' } }, data.gregorianFull),
          weatherSpan
        )
      )
    );
  }

  if (presetId === 'diwan_minimalist') {
    const greeting = data.periodLabel === 'صباحاً' ? 'صباح النور والبركة' : 'طاب مساؤك بالسكينة';
    return el(
      'div',
      { className: 'ss-preset-diwan_minimalist ss-text-shadow' },
      el('div', { className: 'ss-greeting-ruqaa ss-font-ruqaa ss-gold', dataset: { ssDay: '1' } }, `${greeting} · ${data.weekdayName}`),
      el(
        'div',
        { className: 'ss-clock-wrap' },
        el('div', { className: 'ss-clock-digits ss-font-kufi tabular-nums', dataset: { ssClock: '1' } }, data.timeDigits),
        el('div', { className: 'ss-period ss-font-ruqaa ss-gold', dataset: { ssPeriod: '1' } }, data.periodLabel)
      ),
      el(
        'div',
        { className: 'ss-bottom-whisper' },
        el('div', null, el('span', { dataset: { ssHijri: '1' } }, data.hijriDateOnly), ' · ', el('span', { dataset: { ssGregorian: '1' } }, data.gregorianFull), ' · ', weatherSpan),
        data.nextPrayerLine
          ? el('div', { className: 'ss-gold tabular-nums', dataset: { ssPrayer: '1' } }, data.nextPrayerLine)
          : null
      )
    );
  }

  if (presetId === 'andalusian_frame') {
    return el(
      'div',
      { className: 'ss-preset-andalusian_frame ss-text-shadow' },
      el(
        'div',
        { className: 'ss-top-clock' },
        el('div', { className: 'ss-clock-digits ss-font-amiri tabular-nums', dataset: { ssClock: '1' } }, data.timeDigits),
        el('div', { className: 'ss-period ss-font-ruqaa ss-gold', dataset: { ssPeriod: '1' } }, data.periodLabel)
      ),
      el(
        'div',
        { className: 'ss-bottom-info' },
        el('div', { className: 'ss-hijri-ruqaa ss-font-ruqaa ss-gold', dataset: { ssHijri: '1' } }, data.hijriFull),
        el(
          'div',
          { className: 'ss-bottom-row' },
          el('span', { className: 'ss-font-kufi', dataset: { ssGregorian: '1' } }, data.gregorianFull),
          weatherSpan
        )
      )
    );
  }

  // الافتراضي: ١. نمط «الرقعة الملكي» (Royal Ruq'ah)
  return el(
    'div',
    { className: 'ss-preset-royal_ruqah ss-text-shadow' },
    el('div', { className: 'ss-day-ruqaa ss-font-ruqaa ss-gold', dataset: { ssDay: '1' } }, data.weekdayName),
    el(
      'div',
      { className: 'ss-clock-row' },
      el('span', { className: 'ss-clock-digits ss-font-amiri tabular-nums', dataset: { ssClock: '1' } }, data.timeDigits),
      el('span', { className: 'ss-period ss-font-ruqaa', dataset: { ssPeriod: '1' } }, data.periodLabel)
    ),
    el('div', { className: 'ss-gold-rule-h', 'aria-hidden': 'true' }),
    el(
      'div',
      { className: 'ss-meta-strip' },
      el('span', { className: 'ss-font-ruqaa', dataset: { ssHijri: '1' } }, data.hijriFull),
      el('span', { className: 'ss-gold', 'aria-hidden': 'true' }, '✦'),
      el('span', { className: 'ss-font-kufi', dataset: { ssGregorian: '1' } }, data.gregorianFull),
      el('span', { className: 'ss-gold', 'aria-hidden': 'true' }, '✦'),
      weatherSpan
    )
  );
}

export function createScreensaverOverlay(store) {
  let overlayEl = null;
  let mediaLayerEl = null;
  let stageEl = null;
  let activeVideoEl = null;
  let rotationTimer = null;
  let burnInTimer = null;
  let rotationIndex = 0;
  let burnInStep = 0;
  let currentMediaUrl = null;
  let currentPresetId = null;

  function releaseActiveMedia() {
    if (activeVideoEl) {
      try {
        activeVideoEl.pause();
        activeVideoEl.onended = null;
        activeVideoEl.onerror = null;
        activeVideoEl.removeAttribute('src');
        activeVideoEl.load();
      } catch {
        // تجاهل آمن أثناء تفريغ الذاكرة
      }
      activeVideoEl = null;
    }
    currentMediaUrl = null;
    if (mediaLayerEl) {
      clearNode(mediaLayerEl);
    }
  }

  function mountAmbientFallback() {
    releaseActiveMedia();
    if (!mediaLayerEl) return;
    mediaLayerEl.appendChild(el('div', { className: 'ss-ambient-fallback' }));
  }

  function getWakeHintText(snapshot) {
    const q = snapshot.runtime?.quranState;
    if (q && (q.isPlaying || q.isSleepSession || q.isInterrupted)) {
      const surah = getSurahByNumber(q.surahNumber);
      const statusLabel = q.isInterrupted ? 'متوقف مؤقتاً للأذان/التنبيه' : q.isPlaying ? 'يُتلى الآن' : 'متوقف مؤقتاً';
      return `سورة ${surah.name} — الحصري المجوّد (${statusLabel}) · موافق: تشغيل/إيقاف · يمين/يسار: السورة · رجوع: اللوحة`;
    }
    return 'اضغط أي زر في الريموت للعودة إلى لوحة جووو';
  }

  function applyMediaForState(snapshot, nightDimmed) {
    if (!mediaLayerEl) return;
    const keepVideoForSleepQuran = Boolean(snapshot.runtime?.quranState?.isSleepSession || snapshot.runtime?.quranState?.isPlaying);
    if (nightDimmed && !keepVideoForSleepQuran) {
      if (currentMediaUrl !== '__night_ambient__') {
        mountAmbientFallback();
        currentMediaUrl = '__night_ambient__';
      }
      return;
    }

    const catalog = getDiscoveredBackgrounds();
    const chosen = selectActiveBackground(catalog, snapshot.appState.settings.screensaver, rotationIndex);

    if (!chosen) {
      if (currentMediaUrl !== '__ambient__') {
        mountAmbientFallback();
        currentMediaUrl = '__ambient__';
      }
      return;
    }

    if (currentMediaUrl === chosen.url) return;

    releaseActiveMedia();
    currentMediaUrl = chosen.url;

    if (chosen.mediaType === 'image') {
      const img = el('img', {
        className: 'ss-gif',
        src: chosen.url,
        alt: '',
        loading: 'eager',
        decoding: 'async',
      });
      img.onerror = () => mountAmbientFallback();
      mediaLayerEl.appendChild(img);
      return;
    }

    const video = document.createElement('video');
    video.className = 'ss-video';
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.setAttribute('loop', '');
    video.setAttribute('playsinline', '');
    video.disableRemotePlayback = true;
    video.src = chosen.url;

    video.onerror = () => {
      mountAmbientFallback();
    };

    activeVideoEl = video;
    mediaLayerEl.appendChild(video);

    try {
      const playPromise = video.play?.();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // بعض المتصفحات ترفض التشغيل الصامت في بيئات اختبارية -> البديل الهادئ
          if (typeof document !== 'undefined' && video.paused) {
            // نُبقي العنصر صامتاً أو نتحول إذا فشل التحميل
          }
        });
      }
    } catch {
      // تجاهل آمن في بيئات الاختبار
    }
  }

  function applyBurnInShift(snapshot) {
    if (!stageEl) return;
    const enabled = snapshot.appState.settings.screensaver?.antiBurnInEnabled !== false;
    const [dx, dy] = getAntiBurnInOffset(burnInStep, enabled);
    stageEl.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  }

  function mount(snapshot) {
    if (overlayEl) {
      update(snapshot);
      return;
    }

    const ssSettings = snapshot.appState.settings.screensaver || {};
    currentPresetId = ssSettings.preset || 'royal_ruqah';
    const nightDimmed = isScreensaverNightDimmed(snapshot.runtime.alertsState, snapshot.appState.settings);
    const data = formatScreensaverData({
      nowMs: snapshot.runtime.nowMs,
      settings: snapshot.appState.settings,
      weatherSnapshot: snapshot.runtime.weatherSnapshot,
      prayerState: snapshot.runtime.prayerState,
    });

    mediaLayerEl = el('div', { className: 'ss-media-layer' });
    stageEl = el('div', { className: 'ss-stage' }, renderScreensaverPresetStage(currentPresetId, data));

    overlayEl = el(
      'div',
      {
        id: 'jawoo-screensaver',
        className: 'ss-overlay',
        role: 'dialog',
        'aria-label': 'شاشة التوقف الذكية',
        dataset: {
          preset: currentPresetId,
          nightDim: nightDimmed ? 'true' : 'false',
          sleepQuran: snapshot.runtime?.quranState?.isSleepSession || snapshot.runtime?.quranState?.isPlaying ? 'true' : 'false',
        },
      },
      mediaLayerEl,
      el('div', { className: 'ss-scrim', 'aria-hidden': 'true' }),
      stageEl,
      el('div', { className: 'ss-wake-hint', dataset: { ssHint: '1' } }, getWakeHintText(snapshot))
    );

    document.body.appendChild(overlayEl);
    applyMediaForState(snapshot, nightDimmed);
    applyBurnInShift(snapshot);

    requestAnimationFrame(() => {
      overlayEl?.classList.add('is-visible');
    });

    // تبديل الخلفيات تلقائياً كل ٥ دقائق (أو المدة المختارة)
    const rotateMs = Math.max(1, Number(ssSettings.rotateIntervalMinutes || 5)) * 60000;
    rotationTimer = setInterval(() => {
      const snap = store.getSnapshot();
      const night = isScreensaverNightDimmed(snap.runtime.alertsState, snap.appState.settings);
      rotationIndex += 1;
      applyMediaForState(snap, night);
    }, rotateMs);

    // حركة حماية الشاشة من الاحتراق (2 بكسل كل 3 دقائق)
    burnInTimer = setInterval(() => {
      burnInStep += 1;
      applyBurnInShift(store.getSnapshot());
    }, 180000);
  }

  function update(snapshot) {
    if (!overlayEl || !stageEl) return;

    const ssSettings = snapshot.appState.settings.screensaver || {};
    const nextPreset = ssSettings.preset || 'royal_ruqah';
    const nightDimmed = isScreensaverNightDimmed(snapshot.runtime.alertsState, snapshot.appState.settings);

    overlayEl.dataset.preset = nextPreset;
    overlayEl.dataset.nightDim = nightDimmed ? 'true' : 'false';
    overlayEl.dataset.sleepQuran =
      snapshot.runtime?.quranState?.isSleepSession || snapshot.runtime?.quranState?.isPlaying ? 'true' : 'false';

    const hintNode = overlayEl.querySelector('[data-ss-hint]');
    if (hintNode) {
      hintNode.textContent = getWakeHintText(snapshot);
    }

    const data = formatScreensaverData({
      nowMs: snapshot.runtime.nowMs,
      settings: snapshot.appState.settings,
      weatherSnapshot: snapshot.runtime.weatherSnapshot,
      prayerState: snapshot.runtime.prayerState,
    });

    if (nextPreset !== currentPresetId) {
      currentPresetId = nextPreset;
      clearNode(stageEl);
      stageEl.appendChild(renderScreensaverPresetStage(currentPresetId, data));
    } else {
      // تحديث موضعي للنصوص فقط كل ثانية دون لمس الفيديو أو إعادة بناء DOM
      overlayEl.querySelectorAll('[data-ss-clock]').forEach((n) => { n.textContent = data.timeDigits; });
      overlayEl.querySelectorAll('[data-ss-period]').forEach((n) => { n.textContent = data.periodLabel; });
      overlayEl.querySelectorAll('[data-ss-day]').forEach((n) => { n.textContent = n.textContent.includes('·') ? `${data.periodLabel === 'صباحاً' ? 'صباح النور والبركة' : 'طاب مساؤك بالسكينة'} · ${data.weekdayName}` : data.weekdayName; });
      overlayEl.querySelectorAll('[data-ss-hijri]').forEach((n) => { n.textContent = currentPresetId === 'diwan_minimalist' ? data.hijriDateOnly : data.hijriFull; });
      overlayEl.querySelectorAll('[data-ss-gregorian]').forEach((n) => { n.textContent = data.gregorianFull; });
      overlayEl.querySelectorAll('[data-ss-weather]').forEach((n) => { n.textContent = data.weatherText; });
      overlayEl.querySelectorAll('[data-ss-prayer]').forEach((n) => { n.textContent = data.nextPrayerLine; });
    }

    applyMediaForState(snapshot, nightDimmed);
  }

  function unmount() {
    if (rotationTimer) {
      clearInterval(rotationTimer);
      rotationTimer = null;
    }
    if (burnInTimer) {
      clearInterval(burnInTimer);
      burnInTimer = null;
    }
    releaseActiveMedia();
    if (overlayEl && overlayEl.parentNode) {
      overlayEl.parentNode.removeChild(overlayEl);
    }
    overlayEl = null;
    mediaLayerEl = null;
    stageEl = null;
    currentPresetId = null;
  }

  return {
    isMounted: () => Boolean(overlayEl),
    mount,
    update,
    unmount,
  };
}
