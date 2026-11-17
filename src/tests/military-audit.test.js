// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENSAVER_PRESETS } from '../data/screensaver-presets.js';
import { createDefaultSettings, createInitialState } from '../data/defaults.js';
import { createScreensaverOverlay } from '../components/screensaver-overlay.js';
import { mountApp } from '../main.js';
import { createAudioOrchestrator } from '../services/audio-orchestrator.js';
import { getHijriDate, getZonedParts, zonedDateTimeToTimestampMs } from '../services/clock.js';
import { createIdleDetector } from '../services/idle-detector.js';
import { evaluateActiveAlerts } from '../services/notifications.js';
import { computeLocalPrayerTimes, getPrayerTimesForDate } from '../services/prayer-times.js';
import { computeQiyamNightTimes, QIYAM_HADITH } from '../services/qiyam.js';
import { downloadSurahsBatch, listDownloadedSurahsMeta } from '../services/quran-storage.js';
import { resolveDailyStudyPlan } from '../services/smart-scheduler.js';
import { parseAndValidateBackup } from '../storage/backup.js';

function walkJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'tests') continue;
      files.push(...walkJsFiles(full));
    } else if (e.isFile() && e.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

describe('Military-Grade E2E Audit Protocols 1-6', () => {
  let mounted = null;

  afterEach(() => {
    vi.useRealTimers();
    mounted?.destroy?.();
    mounted = null;
    document.body.innerHTML = '';
    try {
      localStorage.clear();
    } catch {
      // تجاهل إذا كان localStorage محظوراً أثناء الاختبار
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('[Protocol 1] survives Legacy Toshiba TV sabotage (broken Intl, blocked Storage/IDB/AudioContext, failed video) and verifies pure ES5 watchdog', () => {
    const intlSpy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function () {
      throw new RangeError('islamic-umalqura unsupported');
    });
    const origStorageDesc = Object.getOwnPropertyDescriptor(window.navigator, 'storage');
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    Object.defineProperty(window.navigator, 'storage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });

    try {
      const t0 = performance.now();
      const root = document.createElement('div');
      root.innerHTML = '<div id="jawoo-boot-fallback">جاري تشغيل لوحة جووو...</div>';
      document.body.appendChild(root);

      mounted = mountApp(root);
      const bootMs = performance.now() - t0;

      expect(bootMs).toBeLessThan(2000);
      expect(window.__jawooBooted).toBe(true);
      expect(root.querySelector('.tv-shell')).not.toBeNull();
      expect(root.textContent).not.toContain('جاري تشغيل لوحة جووو...');
      expect(root.textContent).toContain('فاقوس');
      expect(root.textContent).toContain('الصلاة القادمة');

      // اختبار فشل تحميل فيديو الخلفية في شاشة التوقف -> التحول الآمن للخلفية المدمجة
      const overlay = createScreensaverOverlay(mounted.store);
      overlay.mount(mounted.store.getSnapshot());
      const overlayEl = document.querySelector('.ss-overlay');
      expect(overlayEl).not.toBeNull();
      const videoEl = overlayEl.querySelector('video');
      if (videoEl) {
        videoEl.onerror?.(new Event('error'));
        expect(overlayEl.querySelector('.ss-ambient-fallback')).not.toBeNull();
      }
      overlay.unmount();

      // التحقق من نقاء سكريبت ES5 داخل index.html وعدم وجود صيغ ES6+
      const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
      const inlineWatchdog = indexHtml.match(/<script>([\s\S]*?)<\/script>/)[1];
      const withoutStrings = inlineWatchdog.replace(/'[^']*'/g, "''");
      expect(withoutStrings).not.toMatch(/\b(const|let|class|async|await|import|export)\b/);
      expect(inlineWatchdog).not.toContain('=>');
      expect(inlineWatchdog).not.toContain('?.');
      expect(inlineWatchdog).not.toContain('??');
      expect(inlineWatchdog).not.toContain('`');
      expect(inlineWatchdog).toContain('6000');
      expect(inlineWatchdog).toContain('مسح الكاش وإعادة التشغيل');
    } finally {
      intlSpy.mockRestore();
      if (origStorageDesc) {
        Object.defineProperty(window.navigator, 'storage', origStorageDesc);
      }
    }
  });

  it('[Protocol 2] locks scrollTop at 0px drift and preserves active focus across 10 consecutive interactions & all 6 routes', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    mounted = mountApp(root);

    const getMain = () => root.querySelector('#main-content');
    const mainRef = getMain();

    // ١. تجربة 6 تبويبات رئيسية في شريط التنقل
    const navButtons = root.querySelectorAll('.bottom-nav .nav-item');
    expect(navButtons).toHaveLength(6);

    // ٢. الإعدادات: 5 نقرات متتالية على الخلفية والأنماط والثيم والخط عند scrollTop = 300
    mounted.store.navigate('settings');
    getMain().scrollTop = 300;
    const settingsFlow = [
      () => {
        const sel = root.querySelector('[data-focus-id="settings-ss-bg-select"]');
        sel.focus({ preventScroll: true });
        sel.value = '__ambient__';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        expect(document.activeElement?.dataset?.focusId).toBe('settings-ss-bg-select');
      },
      () => {
        const el = root.querySelector('[data-focus-id="settings-ss-preset-diwan_minimalist"]');
        el.focus({ preventScroll: true });
        el.click();
        expect(document.activeElement?.dataset?.focusId).toBe('settings-ss-preset-diwan_minimalist');
      },
      () => {
        const el = root.querySelector('[data-focus-id="settings-ss-preset-gallery_corner"]');
        el.focus({ preventScroll: true });
        el.click();
        expect(document.activeElement?.dataset?.focusId).toBe('settings-ss-preset-gallery_corner');
      },
      () => {
        const el = root.querySelector('[data-focus-id="settings-theme-night"]');
        el.focus({ preventScroll: true });
        el.click();
        expect(document.activeElement?.dataset?.focusId).toBe('settings-theme-night');
      },
      () => {
        const el = root.querySelector('[data-focus-id="settings-theme-light"]');
        el.focus({ preventScroll: true });
        el.click();
        expect(document.activeElement?.dataset?.focusId).toBe('settings-theme-light');
      },
    ];
    for (const runStep of settingsFlow) {
      runStep();
      expect(getMain()).toBe(mainRef);
      expect(getMain().scrollTop).toBe(300);
      expect(window.scrollY).toBe(0);
    }

    // ٣. القرآن الكريم + العادات + الصلاة + المذاكرة (5 نقرات متتالية إضافية = 10 نقرات)
    mounted.store.navigate('quran');
    getMain().scrollTop = 250;
    for (const fid of ['quran-mode-playlist', 'quran-surah-playlist-1', 'quran-timer-30']) {
      const btn = root.querySelector(`[data-focus-id="${fid}"]`);
      btn.focus({ preventScroll: true });
      btn.click();
      expect(getMain().scrollTop).toBe(250);
      expect(document.activeElement?.dataset?.focusId).toBe(fid);
    }

    mounted.store.navigate('habits');
    getMain().scrollTop = 120;
    const habitBtn = root.querySelector('[data-focus-id="habits-item-fajr"]');
    habitBtn.focus({ preventScroll: true });
    habitBtn.click();
    expect(getMain().scrollTop).toBe(120);
    expect(document.activeElement?.dataset?.focusId).toBe('habits-item-fajr');

    mounted.store.navigate('prayer');
    getMain().scrollTop = 90;
    const iqamaBtn = root.querySelector('[data-focus-id="prayer-iqama-toggle-fajr"]');
    iqamaBtn.focus({ preventScroll: true });
    iqamaBtn.click();
    expect(getMain().scrollTop).toBe(90);
    expect(document.activeElement?.dataset?.focusId).toBe('prayer-iqama-toggle-fajr');

    // ٤. اختبار أزرار الريموت (Escape يعود خطوة للخلف حتى الرئيسية دون فخ تركيز)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(mounted.store.getSnapshot().runtime.route).toBe('habits');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(mounted.store.getSnapshot().runtime.route).toBe('quran');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(mounted.store.getSnapshot().runtime.route).toBe('settings');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(mounted.store.getSnapshot().runtime.route).toBe('home');
  });

  it('[Protocol 3] stresses midnight rollover, Cairo DST transitions, Maghrib-Block1 collision, Ramadan/Eid/Sunnah occasions & Qiyam', () => {
    const settings = createDefaultSettings();
    const emptyCache = { prayerMonths: {} };

    // ١. تغير اليوم عند منتصف الليل (23:59:58 -> 00:00:05) بتوقيت القاهرة
    const beforeMidnight = zonedDateTimeToTimestampMs('2026-11-17', '23:59', 'Africa/Cairo') + 58000;
    const afterMidnight = beforeMidnight + 7000;
    expect(getZonedParts(new Date(beforeMidnight), 'Africa/Cairo').dateKey).toBe('2026-11-17');
    expect(getZonedParts(new Date(afterMidnight), 'Africa/Cairo').dateKey).toBe('2026-11-18');
    expect(resolveDailyStudyPlan({ nowMs: beforeMidnight, settings, studyProgress: createInitialState().studyProgress, cache: emptyCache }).dayName).toBe('الثلاثاء');
    expect(resolveDailyStudyPlan({ nowMs: afterMidnight, settings, studyProgress: createInitialState().studyProgress, cache: emptyCache }).dayName).toBe('الأربعاء');

    // ٢. التوقيت الصيفي والشتوي في القاهرة (30.7303, 31.7936 فاقوس)
    const winterDay = computeLocalPrayerTimes('2026-04-23', 30.7303, 31.7936, 'Africa/Cairo', 5);
    const summerDay = computeLocalPrayerTimes('2026-04-24', 30.7303, 31.7936, 'Africa/Cairo', 5);
    expect(Number(summerDay.dhuhr.slice(0, 2)) - Number(winterDay.dhuhr.slice(0, 2))).toBe(1);

    // ٣. تصادم أذان المغرب 16:55 مع بلوك المذاكرة الأول (16:30–17:10) يوم الأحد
    const key = '2026-11@30.730,31.794#m5';
    const collisionCache = {
      prayerMonths: {
        [key]: {
          fetchedAt: new Date().toISOString(),
          source: 'test',
          days: {
            '2026-11-15': {
              fajr: '04:50',
              shuruq: '06:20',
              dhuhr: '11:40',
              asr: '14:35',
              maghrib: '16:55',
              isha: '18:15',
            },
          },
        },
      },
    };
    const at1653 = zonedDateTimeToTimestampMs('2026-11-15', '16:53', 'Africa/Cairo');
    const plan = resolveDailyStudyPlan({
      nowMs: at1653,
      settings,
      studyProgress: createInitialState().studyProgress,
      cache: collisionCache,
    });
    expect(plan.activePrayerPause).not.toBeNull();
    expect(plan.activePrayerPause.prayerId).toBe('maghrib');
    expect(plan.blocks[0].startTime).toBe('16:30');
    expect(plan.blocks[0].endTime).toBe('17:27'); // تمديد ١٧ دقيقة (٢ قبل الأذان + ١٠ إقامة + ٥ بعد الصلاة)
    expect(plan.blocks[1].startTime).toBe('17:37'); // إزاحة البلوك الثاني تلقائياً

    // ٤. صيام الاثنين والخميس (ليلة الأحد والاربعاء بعد الساعة 20:00) + الأيام البيض + رمضان + عيد الفطر + قيام الليل
    const sunEvening = zonedDateTimeToTimestampMs('2026-11-15', '20:30', 'Africa/Cairo');
    const sunAlerts = evaluateActiveAlerts({ nowMs: sunEvening, prayerState: null, settings, tasks: [], alertLedger: {} });
    expect(sunAlerts.activeAlerts.some((a) => a.title.includes('صيام يوم الاثنين'))).toBe(true);

    const wedEvening = zonedDateTimeToTimestampMs('2026-11-18', '20:30', 'Africa/Cairo');
    const wedAlerts = evaluateActiveAlerts({ nowMs: wedEvening, prayerState: null, settings, tasks: [], alertLedger: {} });
    expect(wedAlerts.activeAlerts.some((a) => a.title.includes('صيام يوم الخميس'))).toBe(true);

    // أول أيام رمضان ١٤٤٧ هـ (١٩ فبراير ٢٠٢٦) يفعّل اقتراح وضع رمضان
    const ramadanDay = zonedDateTimeToTimestampMs('2026-02-19', '12:00', 'Africa/Cairo');
    const ramadanPlan = resolveDailyStudyPlan({ nowMs: ramadanDay, settings, studyProgress: createInitialState().studyProgress, cache: emptyCache });
    expect(ramadanPlan.ramadanSuggestionAvailable).toBe(true);

    const eidCustom = [{ id: 'eid-fitr-1', title: 'عيد الفطر المبارك', dateKey: '2026-11-15', isEid: true, category: 'إسلامية' }];
    const eidPlan = resolveDailyStudyPlan({ nowMs: sunEvening, settings, studyProgress: {}, cache: emptyCache, customEvents: eidCustom });
    expect(eidPlan.holidayStatus).toBe('eid');
    expect(eidPlan.blocks).toHaveLength(0);

    const qiyam = computeQiyamNightTimes(sunEvening, settings, collisionCache);
    expect(qiyam.lastThirdStartMs).toBeGreaterThan(qiyam.maghribMs);
    expect(qiyam.lastThirdStartMs).toBeLessThan(qiyam.fajrMs);
    expect(QIYAM_HADITH.source).toContain('البخاري');
  });

  it('[Protocol 4] proves Al-Husary stream failover, IndexedDB offline storage, 22:30 sleep fade, and 01:15 Adhan/Iqama resume', async () => {
    // ١. محاكاة قاعدة بيانات IndexedDB في الذاكرة للعمل بدون إنترنت
    const memStore = new Map();
    vi.stubGlobal('indexedDB', {
      open() {
        const req = { result: null, onupgradeneeded: null, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          const db = {
            objectStoreNames: { contains: () => true },
            close() {},
            transaction() {
              return {
                objectStore() {
                  return {
                    put(val) {
                      memStore.set(val.surahNumber, val);
                      const r = {};
                      queueMicrotask(() => r.onsuccess?.());
                      return r;
                    },
                    get(k) {
                      const r = { result: memStore.get(k) };
                      queueMicrotask(() => r.onsuccess?.());
                      return r;
                    },
                    openCursor() {
                      const entries = Array.from(memStore.values());
                      let idx = 0;
                      const r = { onsuccess: null, onerror: null };
                      const step = () => {
                        if (idx < entries.length) {
                          r.onsuccess?.({ target: { result: { value: entries[idx], continue() { idx += 1; queueMicrotask(step); } } } });
                        } else {
                          r.onsuccess?.({ target: { result: null } });
                        }
                      };
                      queueMicrotask(step);
                      return r;
                    },
                  };
                },
              };
            },
          };
          req.result = db;
          req.onsuccess?.();
        });
        return req;
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      blob: async () => new Blob([new Uint8Array(2048)], { type: 'audio/mpeg' }),
    }));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:jawoo-offline-018');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const dlRes = await downloadSurahsBatch([18]);
    expect(dlRes.completed).toBe(1);
    const meta = await listDownloadedSurahsMeta();
    expect(meta.count).toBe(1);

    // ٢. محاكاة فشل المصدر الأول ثم الانتقال تلقائياً للاحتياطي، وتصادم الأذان عند 01:15 (75 ثانية)
    const audioInstances = [];
    class FakeAudio {
      constructor(src) {
        this.src = src || '';
        this.volume = 1;
        this.currentTime = 0;
        this.duration = 600;
        this.readyState = 1;
        this.listeners = {};
        audioInstances.push(this);
      }
      addEventListener(ev, fn) {
        this.listeners[ev] = this.listeners[ev] || [];
        this.listeners[ev].push(fn);
      }
      removeEventListener() {}
      async play() {
        if (this.src && this.src.includes('cdn.mp3quran.net')) {
          throw new Error('CDN 503');
        }
        return Promise.resolve();
      }
      pause() {}
      removeAttribute(k) {
        if (k === 'src') this.src = '';
      }
      load() {}
    }
    vi.stubGlobal('Audio', FakeAudio);

    const qSettings = createDefaultSettings();
    const states = [];
    const orch = createAudioOrchestrator({
      getSettings: () => qSettings,
      onQuranStateChange: (s) => states.push(s),
    });

    // تشغيل سورة 18 (الكهف) محلياً من IndexedDB في وضع عدم الاتصال
    await orch.playSurah(18, { mode: 'single', volume: 0.75, isSleepSession: true });
    expect(orch.getQuranState().sourceType).toBe('indexeddb');
    expect(orch.getQuranState().isPlaying).toBe(true);

    // محاكاة وصول التلاوة إلى الثانية 01:15 (75s) ثم إطلاق الأذان ثم الإقامة
    const qPlayer = audioInstances[0];
    qPlayer.currentTime = 75;
    qPlayer.listeners.timeupdate?.forEach((fn) => fn());
    expect(orch.getQuranState().currentTimeSec).toBe(75);

    await orch.playAlertCue('adhan', { volume: 0.8, soundEnabled: true });
    expect(orch.getQuranState().isInterrupted).toBe(true);
    expect(orch.getQuranState().isPlaying).toBe(false);

    // إطلاق الإقامة أثناء التوقف يحافظ على نقطة الاستئناف 01:15
    await orch.playAlertCue('iqama', { volume: 0.8, soundEnabled: true });
    expect(orch.getQuranState().isInterrupted).toBe(true);

    // انتهاء صوت الأذان/الإقامة -> استئناف تلقائي من الثانية 75 بالضبط
    orch.stopAlertAudio();
    await new Promise((r) => setTimeout(r, 30));
    expect(orch.getQuranState().isPlaying).toBe(true);
    expect(orch.getQuranState().currentTimeSec).toBe(75);

    // فحص الفشل والتبديل التلقائي للسيرفر الاحتياطي عند البث (سورة 67 غير محملة محلياً)
    await orch.playSurah(67, { mode: 'single', volume: 0.6 });
    expect(qPlayer.src).toContain('archive.org');

    // فحص التعتيم والتلاشي التدريجي لمؤقت النوم في آخر 10 ثوانٍ
    const now = Date.now();
    orch.setSleepTimer(1, now);
    orch.setQuranVolume(0.8);
    orch.tick(now + 55000); // بقي 5 ثوانٍ -> نصف مستوى الصوت
    expect(qPlayer.volume).toBeCloseTo(0.4, 1);

    orch.destroy();
  });

  it('[Protocol 5 & 6] passes idle screensaver 60s + 5 presets, CSS 4% safe padding, manifest icons, and zero XSS / http:// / reload leaks', () => {
    vi.useFakeTimers();
    let entered = 0;
    let leakedKey = 0;
    const btn = document.createElement('button');
    btn.addEventListener('click', () => { leakedKey += 1; });
    document.body.appendChild(btn);

    const idle = createIdleDetector({
      enabled: true,
      idleSeconds: 60,
      onEnterIdle: () => { entered += 1; },
    });
    try {
      vi.advanceTimersByTime(60500);
      expect(entered).toBe(1);
      expect(idle.isActive()).toBe(true);

      const firstKey = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
      document.dispatchEvent(firstKey);
      const trailingKeyUp = new KeyboardEvent('keyup', { key: 'Enter', cancelable: true, bubbles: true });
      document.dispatchEvent(trailingKeyUp);
      const trailingClick = new MouseEvent('click', { cancelable: true, bubbles: true });
      btn.dispatchEvent(trailingClick);
      expect(firstKey.defaultPrevented).toBe(true);
      expect(trailingKeyUp.defaultPrevented).toBe(true);
      expect(trailingClick.defaultPrevented).toBe(true);
      expect(leakedKey).toBe(0);
      expect(idle.isActive()).toBe(false);
    } finally {
      idle.destroy();
      vi.useRealTimers();
    }

    expect(SCREENSAVER_PRESETS).toHaveLength(5);

    const layoutCss = fs.readFileSync(path.resolve('src/styles/layout.css'), 'utf8');
    const tokensCss = fs.readFileSync(path.resolve('src/styles/tokens.css'), 'utf8');
    expect(tokensCss).toContain('--safe-x');
    expect(tokensCss).toContain('--safe-y');
    expect(layoutCss).toContain('padding: var(--safe-y) var(--safe-x)');
    expect(layoutCss).toContain('overflow-x: hidden');

    // فحص أمني شامل لكل ملفات src/ و public/sw.js
    const prodJsFiles = [...walkJsFiles(path.resolve('src')), path.resolve('public/sw.js')];
    for (const filePath of prodJsFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).not.toMatch(/\.(innerHTML|outerHTML)\s*=/);
      expect(content).not.toContain('insertAdjacentHTML');
      expect(content).not.toContain('document.write');
      expect(content).not.toContain('window.location.reload');
      expect(content).not.toContain('href="#"');
      expect(content).not.toMatch(/https?:\/\/[^\s'"]+/g.test(content) ? /http:\/\/(?!www\.w3\.org\/2000\/svg)/ : /__never__/);
    }

    // رفض النسخة الاحتياطية الخبيثة
    const corrupt = parseAndValidateBackup('{"__proto__":{"admin":true},"bad":1}');
    expect(corrupt.ok).toBe(false);

    // التحقق من manifest.json والأيقونات الفعلية
    const manifest = JSON.parse(fs.readFileSync(path.resolve('public/manifest.json'), 'utf8'));
    expect(manifest.icons.some((i) => i.sizes === '192x192' && fs.existsSync(path.resolve('public', i.src.replace('./', ''))))).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === '512x512' && fs.existsSync(path.resolve('public', i.src.replace('./', ''))))).toBe(true);
  });
});
