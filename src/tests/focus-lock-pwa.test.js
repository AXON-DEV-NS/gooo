// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { el } from '../components/dom.js';
import { mountApp } from '../main.js';
import { getHijriDate, getZonedParts, safeFormatLocalDateTimeAr } from '../services/clock.js';
import { createPwaInstaller } from '../services/pwa-installer.js';
import { isIndexedDbAvailable } from '../services/quran-storage.js';
import { parseAndValidateBackup } from '../storage/backup.js';
import { isLocalStorageAvailable, loadAppState } from '../storage/repository.js';

describe('Zero-Reload Focus/Scroll Lock & PWA Installation', () => {
  let mounted = null;

  afterEach(() => {
    vi.useRealTimers();
    mounted?.destroy?.();
    mounted = null;
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps active element focusId and exact scrollTop locked across 6+ consecutive settings changes without reload', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    mounted = mountApp(root);
    mounted.store.navigate('settings');

    const getMain = () => root.querySelector('#main-content');
    expect(getMain()).not.toBeNull();
    getMain().scrollTop = 380;

    const interactions = [
      {
        focusId: 'settings-theme-night',
        check: (snap) => expect(snap.appState.settings.display.theme).toBe('night'),
      },
      {
        focusId: 'settings-theme-light',
        check: (snap) => expect(snap.appState.settings.display.theme).toBe('light'),
      },
      {
        focusId: 'settings-font-large',
        check: (snap) => expect(snap.appState.settings.display.fontScale).toBe('large'),
      },
      {
        focusId: 'settings-volume-up',
        check: (snap) => expect(snap.appState.settings.audio.volume).toBeGreaterThan(0.75),
      },
      {
        focusId: 'settings-study-backlog-minus',
        check: (snap) => expect(snap.appState.studyProgress.backlogRemaining).toBe(8),
      },
      {
        focusId: 'settings-quran-sleep-timer-45',
        check: (snap) => expect(snap.appState.settings.quran.sleepTimerMinutes).toBe(45),
      },
      {
        focusId: 'settings-qiyam-before-fajr-30',
        check: (snap) => expect(snap.appState.settings.qiyam.beforeFajrMinutes).toBe(30),
      },
    ];

    for (const step of interactions) {
      const target = root.querySelector(`[data-focus-id="${step.focusId}"]`);
      expect(target).not.toBeNull();
      target.focus({ preventScroll: true });
      target.click();

      const snap = mounted.store.getSnapshot();
      step.check(snap);
      expect(snap.runtime.route).toBe('settings');
      expect(getMain().scrollTop).toBe(380);
      expect(document.activeElement?.dataset?.focusId).toBe(step.focusId);

      const savedRaw = localStorage.getItem(mounted.store.getStorageKey());
      expect(savedRaw).toBeTruthy();
    }

    // تبديل تبويب داخل الإعدادات يحافظ على التركيز على زر التبويب نفسه
    const tabBtn = root.querySelector('[data-focus-id="settings-tab-quran_sleep"]');
    expect(tabBtn).not.toBeNull();
    tabBtn.focus({ preventScroll: true });
    tabBtn.click();
    expect(document.activeElement?.dataset?.focusId).toBe('settings-tab-quran_sleep');
    expect(getMain().scrollTop).toBe(380);

    // الانتقال لصفحة أخرى يعيد التمرير لبداية الصفحة الجديدة فقط
    mounted.store.navigate('study');
    expect(mounted.store.getSnapshot().runtime.route).toBe('study');
    expect(getMain().scrollTop).toBe(0);
  });

  it('ensures all rendered buttons in Settings specify explicit type="button" and prominent PWA install card opens TV guide cleanly without losing focus', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    mounted = mountApp(root);
    mounted.store.navigate('settings');

    const cardTitles = Array.from(root.querySelectorAll('.card-title')).map((el) => el.textContent.trim());
    expect(cardTitles[0]).toBe('تثبيت التطبيق والصلاحيات');

    const installBtn = root.querySelector('[data-focus-id="settings-pwa-install-btn"]');
    expect(installBtn).not.toBeNull();
    expect(installBtn.textContent).toContain('تثبيت تطبيق جووو على الشاشة الرئيسية');

    const allButtons = Array.from(root.querySelectorAll('button'));
    for (const btn of allButtons) {
      expect(btn.getAttribute('type')).toBe('button');
    }

    // الضغط الفعلي على زر التثبيت يفتح نافذة إرشاد توشيبا دون أي خطأ، ثم يعيد التركيز بعد الإغلاق
    root.querySelector('#main-content').scrollTop = 140;
    installBtn.focus({ preventScroll: true });
    await mounted.store.pwaActions.installAndGrantPermissions();

    const modal = root.querySelector('.modal-backdrop');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('تثبيت تطبيق جووو على تلفاز توشيبا');

    const closeBtn = modal.querySelector('button');
    closeBtn.click();
    expect(root.querySelector('.modal-backdrop')).toBeNull();
    expect(document.activeElement?.dataset?.focusId).toBe('settings-pwa-install-btn');
    expect(root.querySelector('#main-content').scrollTop).toBe(140);
  });

  it('captures beforeinstallprompt, requests persistent storage & audio unlock, and handles standalone/fallback modes', async () => {
    const listeners = {};
    const persistMock = vi.fn().mockResolvedValue(true);
    const persistedMock = vi.fn().mockResolvedValue(false);
    const resumeMock = vi.fn().mockResolvedValue();
    const closeMock = vi.fn().mockResolvedValue();

    function FakeAudioContext() {
      this.state = 'suspended';
      this.resume = resumeMock;
      this.close = closeMock;
    }

    const mockWin = {
      addEventListener: (name, fn) => {
        listeners[name] = fn;
      },
      removeEventListener: (name) => {
        delete listeners[name];
      },
      matchMedia: () => ({ matches: false }),
      navigator: {
        storage: { persist: persistMock, persisted: persistedMock },
      },
      AudioContext: FakeAudioContext,
    };

    const installer = createPwaInstaller({ win: mockWin });
    installer.init();
    expect(typeof listeners.beforeinstallprompt).toBe('function');

    // الحالة ١: عدم توفر موجه التثبيت -> يفتح دليل التلفاز مع حفظ الصلاحيات
    const onShowTvGuide = vi.fn();
    const unlockAudio = vi.fn().mockResolvedValue(true);
    const guideRes = await installer.installAndGrantPermissions({ unlockAudio, onShowTvGuide });
    expect(guideRes.mode).toBe('fallback_guide');
    expect(onShowTvGuide).toHaveBeenCalledTimes(1);
    expect(persistMock).toHaveBeenCalledTimes(1);
    expect(unlockAudio).toHaveBeenCalledTimes(1);
    expect(resumeMock).toHaveBeenCalledTimes(1);

    // الحالة ٢: التقاط حدث beforeinstallprompt وتشغيل نافذة التثبيت الأصلية
    const preventDefault = vi.fn();
    const promptFn = vi.fn().mockResolvedValue();
    listeners.beforeinstallprompt({
      preventDefault,
      prompt: promptFn,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(installer.getStatus().canPromptInstall).toBe(true);

    const onToast = vi.fn();
    const promptRes = await installer.installAndGrantPermissions({ unlockAudio, onToast });
    expect(promptFn).toHaveBeenCalledTimes(1);
    expect(promptRes.mode).toBe('prompt_accepted');
    expect(installer.getStatus().isStandalone).toBe(true);
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('تم تثبيت تطبيق جووو'), 'info');

    // الحالة ٣: عند الفتح في وضع fullscreen/standalone يعرض حالة التثبيت النشطة
    const standaloneRes = await installer.installAndGrantPermissions({ unlockAudio, onToast });
    expect(standaloneRes.mode).toBe('already_installed');
    expect(onToast).toHaveBeenLastCalledWith('التطبيق مثبت ويعمل في الوضع المستقل ✓', 'info');

    // تحقق مستقل عبر matchMedia display-mode: fullscreen
    const fsInstaller = createPwaInstaller({
      win: { ...mockWin, matchMedia: (q) => ({ matches: String(q).includes('fullscreen') }) },
    });
    const fsRes = await fsInstaller.installAndGrantPermissions({ unlockAudio, onToast });
    expect(fsRes.mode).toBe('already_installed');

    installer.destroy();
  });

  it('ships valid Arabic RTL manifest.json, real PNG icons, and safe sw.js precache', () => {
    const manifestPath = path.resolve('public/manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.name).toBe('جووو — لوحة التشغيل الذكية');
    expect(manifest.short_name).toBe('جووو');
    expect(manifest.lang).toBe('ar');
    expect(manifest.dir).toBe('rtl');
    expect(manifest.display).toBe('fullscreen');
    expect(manifest.display_override).toEqual(['fullscreen', 'standalone']);
    expect(manifest.orientation).toBe('landscape');
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.background_color).toBe('#FAF7F2');
    expect(manifest.theme_color).toBe('#1B4D3E');

    const icon192 = fs.statSync(path.resolve('public/icons/icon-192.png'));
    const icon512 = fs.statSync(path.resolve('public/icons/icon-512.png'));
    const iconMaskable = fs.statSync(path.resolve('public/icons/icon-maskable-512.png'));
    expect(icon192.size).toBeGreaterThan(2000);
    expect(icon512.size).toBeGreaterThan(5000);
    expect(iconMaskable.size).toBeGreaterThan(5000);

    const swSource = fs.readFileSync(path.resolve('public/sw.js'), 'utf8');
    expect(swSource).toContain('./manifest.json');
    expect(swSource).toContain('./icons/icon-192.png');
    expect(swSource).toContain('./icons/icon-512.png');
    expect(swSource).toContain('mp4|webm|gif');

    const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
    expect(indexHtml).toContain('href="./manifest.json"');
    expect(indexHtml).toContain('href="./icons/icon-192.png"');
  });

  it('performs true in-place surgical DOM updates (same node identities & zero scroll jump) across settings, screensaver bg/presets, quran & habits', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div>جاري تشغيل لوحة جووو...</div>';
    document.body.appendChild(root);
    mounted = mountApp(root);
    expect(root.textContent).not.toContain('جاري تشغيل لوحة جووو...');
    expect(root.firstElementChild?.classList?.contains('tv-shell')).toBe(true);

    // ١. الإعدادات: الحفاظ على نفس عقدة #main-content والزر والقائمة المنسدلة للخلفيات دون إعادة بناء
    mounted.store.navigate('settings');
    const mainNode = root.querySelector('#main-content');
    mainNode.scrollTop = 420;

    const bgSelectBefore = root.querySelector('[data-focus-id="settings-ss-bg-select"]');
    const presetBtnBefore = root.querySelector('[data-focus-id="settings-ss-preset-diwan_minimalist"]');
    expect(bgSelectBefore).not.toBeNull();
    expect(presetBtnBefore).not.toBeNull();

    bgSelectBefore.focus({ preventScroll: true });
    bgSelectBefore.value = '__ambient__';
    bgSelectBefore.dispatchEvent(new Event('change', { bubbles: true }));
    expect(root.querySelector('#main-content')).toBe(mainNode);
    expect(root.querySelector('[data-focus-id="settings-ss-bg-select"]')).toBe(bgSelectBefore);
    expect(mainNode.scrollTop).toBe(420);
    expect(mounted.store.getSnapshot().appState.settings.screensaver.backgroundMode).toBe('ambient');

    presetBtnBefore.focus({ preventScroll: true });
    presetBtnBefore.click();
    expect(root.querySelector('#main-content')).toBe(mainNode);
    expect(root.querySelector('[data-focus-id="settings-ss-preset-diwan_minimalist"]')).toBe(presetBtnBefore);
    expect(presetBtnBefore.getAttribute('aria-pressed')).toBe('true');
    expect(mainNode.scrollTop).toBe(420);

    // ٢. القرآن الكريم: تبديل قائمة السور يحافظ على نفس عقدة السورة والموضع
    mounted.store.navigate('quran');
    mainNode.scrollTop = 260;
    const surahPlaylistBtn = root.querySelector('[data-focus-id="quran-surah-playlist-1"]');
    expect(surahPlaylistBtn).not.toBeNull();
    surahPlaylistBtn.focus({ preventScroll: true });
    surahPlaylistBtn.click();
    expect(root.querySelector('#main-content')).toBe(mainNode);
    expect(root.querySelector('[data-focus-id="quran-surah-playlist-1"]')).toBe(surahPlaylistBtn);
    expect(mainNode.scrollTop).toBe(260);
    expect(document.activeElement).toBe(surahPlaylistBtn);

    // ٣. العادات: التبديل يحدّث الكلاس و aria-pressed في مكانه
    mounted.store.navigate('habits');
    mainNode.scrollTop = 180;
    const habitBtn = root.querySelector('[data-focus-id="habits-item-fajr"]');
    expect(habitBtn).not.toBeNull();
    habitBtn.focus({ preventScroll: true });
    habitBtn.click();
    expect(root.querySelector('[data-focus-id="habits-item-fajr"]')).toBe(habitBtn);
    expect(habitBtn.getAttribute('aria-pressed')).toBe('true');
    expect(mainNode.scrollTop).toBe(180);
  });

  it('enforces XSS safety, prototype-pollution sanitization on JSON backups, HTTPS endpoints, and no href="#"', () => {
    // ١. تعقيم نصوص dom.js وحظر سمات innerHTML
    const dangerousText = '<script>window.__xss=1</script><img src=x onerror=alert(1)>';
    const node = el('div', { innerHTML: '<b>hacked</b>', className: 'safe-box' }, dangerousText);
    expect(node.querySelector('script')).toBeNull();
    expect(node.querySelector('img')).toBeNull();
    expect(node.querySelector('b')).toBeNull();
    expect(node.textContent).toBe(dangerousText);

    // ٢. رفض ملفات النسخ الاحتياطي الضخمة جداً وتصفية مفاتيح التلويث
    const hugeRes = parseAndValidateBackup('x'.repeat(2_000_010));
    expect(hugeRes.ok).toBe(false);

    const poisonedJson = JSON.stringify({
      app: 'jawoo',
      schemaVersion: 2,
      exportedAt: '2026-11-17T00:00:00.000Z',
      data: {
        settings: {},
        tasks: [],
        habitsByDate: JSON.parse('{"2026-11-17":{"fajr":true},"__proto__":{"polluted":true}}'),
        focusSessions: [],
        alertLedger: {},
        customEvents: [],
      },
    });
    const parsed = parseAndValidateBackup(poisonedJson);
    if (parsed.ok) {
      expect(Object.hasOwn(parsed.stateData.habitsByDate, '__proto__')).toBe(false);
    }
    expect({}.polluted).toBeUndefined();
  });

  it('guards legacy TV browser limitations (Intl RangeError, blocked localStorage/indexedDB, ES5 watchdog script)', () => {
    // ١. إذا رمى Intl.DateTimeFormat خطأ RangeError يتكفّل البديل الحسابي بالهجري وتنسيق الوقت بأمان
    const intlSpy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function () {
      throw new RangeError('Unsupported calendar');
    });
    const parts = getZonedParts(new Date('2026-11-17T08:00:00Z'), 'Africa/Cairo');
    expect(parts.year).toBe(2026);
    const hijri = getHijriDate(new Date('2026-11-17T08:00:00Z'), 'Africa/Cairo');
    expect(hijri.formattedAr).toContain('هـ');
    expect(safeFormatLocalDateTimeAr('2026-11-17T08:00:00Z')).toContain('٢٠٢٦');
    intlSpy.mockRestore();

    // ٢. إذا كان localStorage أو indexedDB مقيداً (throws SecurityError) لا يتوقف التشغيل
    const throwingStorage = {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('SecurityError');
      },
      removeItem() {
        throw new Error('SecurityError');
      },
    };
    expect(isLocalStorageAvailable(throwingStorage)).toBe(false);
    const loaded = loadAppState(throwingStorage);
    expect(loaded.storageAvailable).toBe(false);
    expect(loaded.state.settings.location.city).toBe('فاقوس');

    vi.stubGlobal('indexedDB', undefined);
    expect(isIndexedDbAvailable()).toBe(false);

    // ٣. التحقق من أن سكريبت مراقب الإقلاع في index.html مكتوب بـ ES5 نقي دون صيغ حديثة ويحتوي مهلة 6 ثوانٍ
    const html = fs.readFileSync(path.resolve('index.html'), 'utf8');
    const inlineMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    expect(inlineMatch).not.toBeNull();
    const watchdogCode = inlineMatch[1];
    expect(watchdogCode).not.toMatch(/\b(const|let|class|async|await)\b/);
    expect(watchdogCode).not.toContain('=>');
    expect(watchdogCode).not.toContain('`');
    expect(watchdogCode).toContain('window.onerror');
    expect(watchdogCode).toContain('6000');
    expect(watchdogCode).toContain('مسح الكاش وإعادة التشغيل');

    // ٤. محاكاة تعطل الإقلاع لأكثر من 6 ثوانٍ والتحقق من ظهور بطاقة الاسترداد وزر مسح الكاش وإلغاء تسجيل SW
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    const unregisterMock = vi.fn().mockResolvedValue(true);
    const cacheDeleteMock = vi.fn().mockResolvedValue(true);
    document.body.innerHTML = '<div id="app"><div id="jawoo-boot-fallback">جاري تشغيل لوحة جووو...</div></div>';
    window.caches = { keys: vi.fn().mockResolvedValue(['jawoo-static-v3']), delete: cacheDeleteMock };
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: vi.fn().mockResolvedValue([{ unregister: unregisterMock }]) },
    });

    new Function(watchdogCode)();
    window.onerror('SyntaxError: Unexpected token', 'app.js', 12, 1);
    vi.advanceTimersByTime(6100);

    const recovery = document.getElementById('jawoo-boot-recovery');
    expect(recovery).not.toBeNull();
    expect(recovery.textContent).toContain('SyntaxError: Unexpected token');
    const recoveryBtn = document.getElementById('jawoo-clear-cache-btn');
    expect(recoveryBtn).not.toBeNull();
    expect(recoveryBtn.textContent).toBe('مسح الكاش وإعادة التشغيل');

    vi.useRealTimers();
    delete window.caches;
  });
});
