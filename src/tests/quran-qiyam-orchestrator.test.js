import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSettings } from '../data/defaults.js';
import { QURAN_SURAHS } from '../data/quran-surahs.js';
import {
  createAudioOrchestrator,
  getNextSurahInQueue,
  resolveRepeatIterations,
} from '../services/audio-orchestrator.js';
import { zonedDateTimeToTimestampMs } from '../services/clock.js';
import { evaluateActiveAlerts } from '../services/notifications.js';
import { buildPrayerCacheKey } from '../services/prayer-times.js';
import { computeQiyamNightTimes } from '../services/qiyam.js';
import { getSurahSourceUrls } from '../services/quran-storage.js';

describe('Quran Al-Husary Mujawwad, Audio Priority & Qiyam module', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('provides all 114 Surahs and verified primary + fallback MP3 URLs', () => {
    expect(QURAN_SURAHS).toHaveLength(114);
    expect(QURAN_SURAHS[0].name).toBe('الفاتحة');
    expect(QURAN_SURAHS[113].name).toBe('الناس');

    const urls = getSurahSourceUrls(67);
    expect(urls[0]).toContain('cdn.mp3quran.net/audio/mahmoud-husary/r2/067.mp3');
    expect(urls[1]).toContain('archive.org/download/ShaykhMahmoudKhalilAl-husaryMujawwad/067.mp3');
    expect(urls[2]).toContain('download.quranicaudio.com');
  });

  it('handles single repeat counts (1/3/5/loop), playlist order, and khatmah sequence', () => {
    expect(resolveRepeatIterations('once')).toBe(1);
    expect(resolveRepeatIterations('3')).toBe(3);
    expect(resolveRepeatIterations('5')).toBe(5);
    expect(resolveRepeatIterations('loop')).toBe(Infinity);

    const step1 = getNextSurahInQueue({ currentSurah: 67, mode: 'single', repeatRemaining: 3 });
    expect(step1).toEqual({ surahNumber: 67, nextRepeatRemaining: 2, continuePlaying: true });

    const stepDone = getNextSurahInQueue({ currentSurah: 67, mode: 'single', repeatRemaining: 1 });
    expect(stepDone.continuePlaying).toBe(false);

    const plNext = getNextSurahInQueue({
      currentSurah: 67,
      mode: 'playlist',
      playlist: [67, 32, 18, 2],
      playlistLoop: true,
    });
    expect(plNext.surahNumber).toBe(32);

    const khatmahNext = getNextSurahInQueue({ currentSurah: 114, mode: 'khatmah' });
    expect(khatmahNext.surahNumber).toBe(1);
  });

  it('calculates exact astronomical last third of night for Qiyam and triggers verified Hadith alert when enabled', () => {
    const settings = createDefaultSettings();
    settings.qiyam.enabled = true;
    settings.qiyam.mode = 'last_third';

    const key = buildPrayerCacheKey(2026, 11, settings.location, settings.prayer.method);
    const cache = {
      prayerMonths: {
        [key]: {
          fetchedAt: new Date().toISOString(),
          source: 'Test Fixture',
          days: {
            '2026-11-16': { fajr: '04:50', shuruq: '06:20', dhuhr: '11:40', asr: '14:40', maghrib: '17:00', isha: '18:20' },
            '2026-11-17': { fajr: '05:00', shuruq: '06:21', dhuhr: '11:40', asr: '14:40', maghrib: '17:00', isha: '18:20' },
          },
        },
      },
    };

    // مدة الليل من 17:00 إلى 05:00 = 12 ساعة -> الثلث الأخير يبدأ بعد 8 ساعات = 01:00
    const eveningMs = zonedDateTimeToTimestampMs('2026-11-16', '22:00', 'Africa/Cairo');
    const qTimes = computeQiyamNightTimes(eveningMs, settings, cache);
    expect(qTimes.lastThirdHHMM).toBe('01:00');
    expect(qTimes.reminderHHMM).toBe('01:00');

    // الساعة 01:15 فجراً -> ينطلق تذكير قيام الليل بالحديث الصحيح
    const at0115Ms = zonedDateTimeToTimestampMs('2026-11-17', '01:15', 'Africa/Cairo');
    const qAt0115 = computeQiyamNightTimes(at0115Ms, settings, cache);
    const evalRes = evaluateActiveAlerts({
      nowMs: at0115Ms,
      prayerState: null,
      settings,
      tasks: [],
      alertLedger: {},
      qiyamTimes: qAt0115,
    });
    expect(evalRes.activeAlerts.some((a) => a.type === 'qiyam' && a.body.includes('البخاري'))).toBe(true);

    // عند التعطيل لا يظهر
    settings.qiyam.enabled = false;
    const disabledRes = evaluateActiveAlerts({
      nowMs: at0115Ms,
      prayerState: null,
      settings,
      tasks: [],
      alertLedger: {},
      qiyamTimes: qAt0115,
    });
    expect(disabledRes.activeAlerts.some((a) => a.type === 'qiyam')).toBe(false);
  });

  it('pauses Quran for Adhan/alert and auto-resumes from exact saved second upon acknowledgment', async () => {
    const fakeAudios = [];
    class MockAudio {
      constructor() {
        this.volume = 1;
        this.currentTime = 0;
        this.duration = 300;
        this.paused = true;
        this.listeners = {};
        fakeAudios.push(this);
      }
      addEventListener(evt, fn) {
        this.listeners[evt] = this.listeners[evt] || [];
        this.listeners[evt].push(fn);
      }
      removeEventListener() {}
      removeAttribute() {}
      load() {}
      play() {
        this.paused = false;
        (this.listeners.playing || []).forEach((fn) => fn());
        return Promise.resolve();
      }
      pause() {
        this.paused = true;
        (this.listeners.pause || []).forEach((fn) => fn());
      }
    }

    vi.stubGlobal('Audio', MockAudio);

    const settings = createDefaultSettings();
    const orch = createAudioOrchestrator({ getSettings: () => settings });

    await orch.playSurah(67, { mode: 'single', volume: 0.7 });
    const qAudio = fakeAudios[0];
    qAudio.currentTime = 123;
    (qAudio.listeners.timeupdate || []).forEach((fn) => fn());
    expect(orch.getQuranState().isPlaying).toBe(true);

    // مقاطعة بسبب الأذان
    await orch.playAlertCue('adhan', { volume: 0.8, soundEnabled: true });
    expect(orch.getQuranState().isInterrupted).toBe(true);
    expect(orch.getQuranState().isPlaying).toBe(false);

    // عند تأكيد التنبيه (أو انتهاء الأذان)، يستأنف القرآن تلقائياً من نفس الثانية
    await orch.onAlertAcknowledged();
    expect(orch.getQuranState().isInterrupted).toBe(false);
    expect(orch.getQuranState().isPlaying).toBe(true);
    expect(orch.getQuranState().surahNumber).toBe(67);

    // اختبار مؤقت إغلاق الصوت التلقائي
    const now = Date.now();
    orch.setSleepTimer(15, now);
    orch.tick(now + 15 * 60000 + 100);
    await new Promise((r) => setTimeout(r, 50));
    expect(orch.getQuranState().sleepTimerEndsAtMs).toBeNull();

    orch.destroy();
  });
});
