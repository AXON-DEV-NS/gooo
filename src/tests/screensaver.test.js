// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScreensaverOverlay, renderScreensaverPresetStage } from '../components/screensaver-overlay.js';
import { createDefaultSettings } from '../data/defaults.js';
import { SCREENSAVER_PRESETS } from '../data/screensaver-presets.js';
import { zonedDateTimeToTimestampMs } from '../services/clock.js';
import { createIdleDetector } from '../services/idle-detector.js';
import {
  formatScreensaverData,
  getAntiBurnInOffset,
  getDiscoveredBackgrounds,
  isScreensaverNightDimmed,
  selectActiveBackground,
  shouldInterruptScreensaverForAlert,
} from '../services/screensaver.js';

describe('luxury Arabic idle screensaver & animated backgrounds', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('auto-discovers animated background files from public/Animated backgrounds', () => {
    const catalog = getDiscoveredBackgrounds();
    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog.length).toBeGreaterThanOrEqual(6);
    expect(catalog[0].url).toContain('./Animated%20backgrounds/');

    // اختبار أوضاع الاختيار
    const first = selectActiveBackground(catalog, { backgroundMode: 'auto_rotate' }, 0);
    const second = selectActiveBackground(catalog, { backgroundMode: 'auto_rotate' }, 1);
    expect(first.filename).not.toBe(second.filename);

    const specific = selectActiveBackground(
      catalog,
      { backgroundMode: 'single', selectedBackground: catalog[2].filename },
      0
    );
    expect(specific.filename).toBe(catalog[2].filename);

    expect(selectActiveBackground(catalog, { backgroundMode: 'ambient' }, 0)).toBeNull();
    expect(selectActiveBackground([], { backgroundMode: 'auto_rotate' }, 0)).toBeNull();
  });

  it('formats 100% Arabic screensaver clock (صباحاً/مساءً), Hijri, Gregorian, and weather', () => {
    const settings = createDefaultSettings();
    const eveningMs = zonedDateTimeToTimestampMs('2026-11-16', '19:45', 'Africa/Cairo');
    const dataEvening = formatScreensaverData({
      nowMs: eveningMs,
      settings,
      weatherSnapshot: {
        available: true,
        expiredBeyondSixHours: false,
        data: { temperature: 24, descriptionAr: 'سماء صافية', weatherCode: 0 },
      },
      prayerState: { nextPrayer: { label: 'الفجر', remainingMs: 3600000 } },
    });

    expect(dataEvening.timeDigits).toBe('٧:٤٥');
    expect(dataEvening.periodLabel).toBe('مساءً');
    expect(dataEvening.hijriFull).toContain('هـ');
    expect(dataEvening.gregorianFull).toContain('نوفمبر');
    expect(dataEvening.gregorianFull).toContain('م');
    expect(dataEvening.weatherText).toContain('٢٤°');
    expect(dataEvening.nextPrayerLine).toContain('الصلاة القادمة: الفجر');

    const morningMs = zonedDateTimeToTimestampMs('2026-11-16', '08:05', 'Africa/Cairo');
    const dataMorning = formatScreensaverData({ nowMs: morningMs, settings, weatherSnapshot: null, prayerState: null });
    expect(dataMorning.timeDigits).toBe('٨:٠٥');
    expect(dataMorning.periodLabel).toBe('صباحاً');
  });

  it('renders all 5 unified cohesive presets cleanly', () => {
    const settings = createDefaultSettings();
    const data = formatScreensaverData({
      nowMs: zonedDateTimeToTimestampMs('2026-11-16', '20:15', 'Africa/Cairo'),
      settings,
      weatherSnapshot: null,
      prayerState: { nextPrayer: { label: 'الفجر', remainingMs: 120000 } },
    });

    expect(SCREENSAVER_PRESETS).toHaveLength(5);
    for (const preset of SCREENSAVER_PRESETS) {
      const node = renderScreensaverPresetStage(preset.id, data);
      expect(node.className).toContain(`ss-preset-${preset.id}`);
      expect(node.textContent).toContain('٨:١٥');
    }
  });

  it('activates on inactivity and consumes first remote key without leaking to underlying app', () => {
    vi.useFakeTimers();
    let entered = 0;
    let exited = 0;
    let underlyingKeyCalls = 0;

    const underlyingListener = () => {
      underlyingKeyCalls += 1;
    };
    document.addEventListener('keydown', underlyingListener);

    const detector = createIdleDetector({
      idleSeconds: 60,
      enabled: true,
      onEnterIdle: () => { entered += 1; },
      onExitIdle: () => { exited += 1; },
    });

    vi.advanceTimersByTime(60000);
    expect(entered).toBe(1);
    expect(detector.isActive()).toBe(true);

    // ضغطة ريموت أولى أثناء شاشة التوقف: تستيقظ الشاشة وتُستهلك الضغطة ولا تصل للعناصر الخلفية
    const firstKey = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
    document.dispatchEvent(firstKey);
    expect(firstKey.defaultPrevented).toBe(true);
    expect(exited).toBe(1);
    expect(detector.isActive()).toBe(false);
    expect(underlyingKeyCalls).toBe(0);

    // ضغطة ثانية بعد العودة تصل للوحة الرئيسية بصورة طبيعية
    const secondKey = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true, bubbles: true });
    document.dispatchEvent(secondKey);
    expect(underlyingKeyCalls).toBe(1);

    detector.destroy();
    document.removeEventListener('keydown', underlyingListener);
  });

  it('interrupts immediately for priority alerts, dims at night, and rotates anti burn-in offsets', () => {
    const settings = createDefaultSettings();
    expect(
      shouldInterruptScreensaverForAlert(
        { activeAlerts: [{ type: 'adhan', title: 'حان أذان المغرب' }] },
        { status: 'idle' }
      ).interrupt
    ).toBe(true);

    expect(
      shouldInterruptScreensaverForAlert(
        { activeAlerts: [] },
        { status: 'paused_for_prayer', pausedForPrayer: { message: 'توقف لصلاة المغرب' } }
      ).interrupt
    ).toBe(true);

    expect(isScreensaverNightDimmed({ inQuietHours: true }, settings)).toBe(true);
    expect(getAntiBurnInOffset(0, true)).toEqual([0, 0]);
    expect(getAntiBurnInOffset(1, true)).toEqual([2, 0]);
    expect(getAntiBurnInOffset(3, false)).toEqual([0, 0]);
  });

  it('unmounts video and releases media src and timers cleanly on exit to prevent memory leaks', () => {
    const settings = createDefaultSettings();
    const fakeStore = {
      getSnapshot: () => ({
        appState: { settings },
        runtime: {
          nowMs: zonedDateTimeToTimestampMs('2026-11-16', '15:00', 'Africa/Cairo'),
          alertsState: { activeAlerts: [], inQuietHours: false },
          weatherSnapshot: null,
          prayerState: { nextPrayer: { label: 'العصر', remainingMs: 1800000 } },
        },
      }),
    };

    const overlay = createScreensaverOverlay(fakeStore);
    for (let cycle = 0; cycle < 3; cycle += 1) {
      overlay.mount(fakeStore.getSnapshot());
      const video = document.querySelector('#jawoo-screensaver video');
      expect(video).not.toBeNull();
      const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => {});
      const loadSpy = vi.spyOn(video, 'load').mockImplementation(() => {});

      overlay.unmount();
      expect(pauseSpy).toHaveBeenCalled();
      expect(loadSpy).toHaveBeenCalled();
      expect(video.hasAttribute('src')).toBe(false);
      expect(document.getElementById('jawoo-screensaver')).toBeNull();
    }
  });
});
