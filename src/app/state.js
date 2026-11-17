import { APP_META, createInitialState } from '../data/defaults.js';
import { QURAN_SURAHS } from '../data/quran-surahs.js';
import { getGuideForSubject } from '../data/study-schedule.js';
import { createAudioOrchestrator } from '../services/audio-orchestrator.js';
import { createPwaInstaller } from '../services/pwa-installer.js';
import { getZonedParts, pad2, parseHHMMToMinutes, toArabicDigits } from '../services/clock.js';
import { evaluateActiveAlerts } from '../services/notifications.js';
import { buildPrayerCacheKey, fetchMonthlyPrayerTimes, resolvePrayerState } from '../services/prayer-times.js';
import { computeQiyamNightTimes } from '../services/qiyam.js';
import {
  clearAllDownloadedSurahs,
  deleteDownloadedSurah,
  downloadSurahsBatch,
  getLocalBundledSurahSet,
  listDownloadedSurahsMeta,
} from '../services/quran-storage.js';
import {
  computeWeeklyStudyStats,
  resolveBlockStageFromElapsed,
  resolveDailyStudyPlan,
  toggleStudyBlockCompletion,
} from '../services/smart-scheduler.js';
import { shouldInterruptScreensaverForAlert } from '../services/screensaver.js';
import { getAccurateNowMs, syncAccurateNetworkTime } from '../services/time-sync.js';
import { fetchWeatherForecast, getWeatherSnapshot } from '../services/weather.js';
import { loadAppState, saveAppState } from '../storage/repository.js';

export function createStore() {
  const loaded = loadAppState();
  let appState = loaded.state;

  const initialAccurate = getAccurateNowMs(appState.cache?.timeDrift, Date.now());
  const initialTz = appState.settings.location.timezone || 'Africa/Cairo';
  const initialDateKey = getZonedParts(new Date(initialAccurate.nowMs), initialTz).dateKey;

  const runtime = {
    route: 'home',
    routeHistory: [],
    nowMs: initialAccurate.nowMs,
    storageAvailable: loaded.storageAvailable,
    recoveredFromError: loaded.recoveredFromError,
    online: globalThis.navigator?.onLine ?? true,
    syncingPrayer: false,
    syncingWeather: false,
    syncingTime: false,
    prayerSyncError: null,
    weatherSyncError: null,
    prayerState: null,
    studyPlan: null,
    weeklyStats: null,
    qiyamTimes: null,
    alertsState: { activeAlerts: [], newlyTriggered: [], primaryAlert: null, inQuietHours: false },
    weatherSnapshot: getWeatherSnapshot(appState.cache, initialAccurate.nowMs),
    audioStatus: {
      sessionUnlocked: false,
      muted: false,
      isPlaying: false,
      lastError: null,
      lastTestAt: null,
    },
    quranState: {
      isPlaying: false,
      isLoading: false,
      isInterrupted: false,
      surahNumber: appState.quranProgress?.lastSurah || appState.settings?.quran?.selectedSurah || 1,
      mode: appState.settings?.quran?.mode || 'single',
      repeatRemaining: 1,
      currentTimeSec: appState.quranProgress?.lastTimeSec || 0,
      durationSec: 0,
      targetVolume: appState.settings?.quran?.volume ?? 0.75,
      sleepTimerEndsAtMs: null,
      isSleepSession: false,
      sourceType: null,
      error: null,
    },
    quranDownloads: {
      map: {},
      localBundled: Array.from(getLocalBundledSurahSet()),
      count: 0,
      totalBytes: 0,
      supported: true,
      batchProgress: null,
    },
    quranFilter: 'all', // 'all' | 'offline' | 'sleep_playlist'
    focus: {
      mode: 'custom_focus', // 'study_block' | 'custom_focus'
      phase: 'focus', // 'focus' | 'break'
      blockId: null,
      blockKind: 'focus',
      subject: null,
      tag: null,
      hasBreakAfter: false,
      guideText: null,
      status: 'idle', // 'idle' | 'running' | 'paused' | 'paused_for_prayer'
      pausedForPrayer: null,
      totalDurationMs: appState.settings.focus.focusMinutes * 60000,
      remainingMs: appState.settings.focus.focusMinutes * 60000,
      endsAtMs: null,
      lastStageIndex: 0,
    },
    selectedHabitsDateKey: initialDateKey,
    settingsTab: 'all',
    overscanGuideVisible: false,
    screensaverActive: false,
    screensaverPreviewRequested: false,
    observedKeys: [],
    modal: null,
    toasts: [],
  };

  const listeners = new Set();
  const tickListeners = new Set();

  function notify() {
    for (const fn of listeners) {
      fn(getSnapshot());
    }
  }

  function notifyTick() {
    for (const fn of tickListeners) {
      fn(getSnapshot());
    }
  }

  function pushToast(message, tone = 'info', durationMs = 4500) {
    const id = `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    runtime.toasts = [...runtime.toasts.slice(-3), { id, message, tone }];
    notify();
    if (durationMs > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, durationMs);
    }
  }

  function dismissToast(id) {
    runtime.toasts = runtime.toasts.filter((t) => t.id !== id);
    notify();
  }

  function logSystemEvent(level, message) {
    const entry = { at: new Date(runtime.nowMs).toISOString(), level, message };
    appState = {
      ...appState,
      systemLog: [...(appState.systemLog || []), entry].slice(-40),
    };
  }

  let downloadAbortController = null;

  const pwaInstaller = createPwaInstaller({
    onStatusChange: (pwaStatus) => {
      runtime.pwaStatus = pwaStatus;
      notify();
    },
  });
  runtime.pwaStatus = pwaInstaller.getStatus();

  const orchestrator = createAudioOrchestrator({
    getSettings: () => appState.settings,
    onAlertStateChange(nextAudio) {
      runtime.audioStatus = nextAudio;
      notify();
    },
    onQuranStateChange(nextQuran) {
      runtime.quranState = nextQuran;
      notify();
    },
    onProgressPersist({ surahNumber, currentTimeSec, mode }) {
      appState = {
        ...appState,
        quranProgress: {
          ...appState.quranProgress,
          lastSurah: surahNumber,
          lastTimeSec: currentTimeSec,
          ...(mode === 'khatmah' ? { khatmahSurah: surahNumber, khatmahTimeSec: currentTimeSec } : {}),
        },
      };
      persistState();
    },
    onBlocked(reason) {
      logSystemEvent('warning', reason);
      pushToast(reason, 'warning', 7000);
    },
  });

  async function refreshQuranDownloads() {
    const meta = await listDownloadedSurahsMeta();
    runtime.quranDownloads = {
      ...runtime.quranDownloads,
      map: meta.map,
      localBundled: Array.from(getLocalBundledSurahSet()),
      count: meta.count,
      totalBytes: meta.totalBytes,
      supported: meta.supported,
    };
    notify();
  }

  function applyDocumentTheme() {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    html.setAttribute('data-theme', appState.settings.display.theme || 'light');
    html.setAttribute('data-font-scale', appState.settings.display.fontScale || 'normal');
  }

  let lastStorageWarnMs = 0;

  function persistState() {
    const res = saveAppState(appState);
    runtime.storageAvailable = res.ok;
    if (!res.ok && res.reason) {
      logSystemEvent('warning', res.reason);
      if (Date.now() - lastStorageWarnMs > 30000) {
        lastStorageWarnMs = Date.now();
        pushToast(res.reason, 'warning', 6000);
      }
    }
  }

  function refreshAccurateNowMs() {
    const deviceNow = Date.now();
    const acc = getAccurateNowMs(appState.cache?.timeDrift, deviceNow);
    if (acc.driftReset) {
      appState = {
        ...appState,
        cache: {
          ...appState.cache,
          timeDrift: {
            offsetMs: 0,
            syncedAt: null,
            lastDeviceNowMs: deviceNow,
            lastAccurateNowMs: deviceNow,
            source: 'إعادة ضبط محلية',
          },
        },
      };
      logSystemEvent('info', acc.reason || 'تمت إعادة معايرة الساعة.');
      persistState();
    }
    runtime.nowMs = acc.nowMs;
    return acc.nowMs;
  }

  function interruptScreensaverIfNeeded() {
    if (!runtime.screensaverActive) return false;
    const interruptCheck = shouldInterruptScreensaverForAlert(runtime.alertsState, runtime.focus);
    if (interruptCheck.interrupt) {
      runtime.screensaverActive = false;
      runtime.screensaverPreviewRequested = false;
      return true;
    }
    return false;
  }

  function checkPrayerAutoPauseAndResume() {
    const pause = runtime.studyPlan?.activePrayerPause;
    if (runtime.focus.status === 'running' && pause) {
      const rem = Math.max(0, (runtime.focus.endsAtMs || runtime.nowMs) - runtime.nowMs);
      runtime.focus = {
        ...runtime.focus,
        status: 'paused_for_prayer',
        remainingMs: rem,
        endsAtMs: null,
        pausedForPrayer: pause,
      };
      interruptScreensaverIfNeeded();
      pushToast(pause.message, 'warning', 7000);
      if (appState.settings.focus.soundEnabled && !runtime.alertsState.inQuietHours) {
        orchestrator.playAlertCue('soft', {
          volume: appState.settings.audio.volume,
          soundEnabled: appState.settings.audio.soundEnabled,
        });
      }
      notify();
      return;
    }

    if (
      runtime.focus.status === 'paused_for_prayer' &&
      runtime.focus.pausedForPrayer &&
      runtime.nowMs >= runtime.focus.pausedForPrayer.resumeAtMs
    ) {
      const label = runtime.focus.pausedForPrayer.label;
      runtime.focus = {
        ...runtime.focus,
        status: 'running',
        endsAtMs: runtime.nowMs + runtime.focus.remainingMs,
        pausedForPrayer: null,
      };
      pushToast(`انتهت نافذة صلاة ${label} — تم استئناف البلوك تلقائياً.`, 'info', 6000);
      if (appState.settings.focus.soundEnabled && !runtime.alertsState.inQuietHours) {
        orchestrator.playAlertCue('focus', {
          volume: appState.settings.audio.volume,
          soundEnabled: appState.settings.audio.soundEnabled,
        });
      }
      notify();
    }

    if (interruptScreensaverIfNeeded()) {
      notify();
    }
  }

  function checkBlockStageTransition() {
    if (runtime.focus.status !== 'running' || runtime.focus.mode !== 'study_block') return;
    if (runtime.focus.blockKind === 'break') return;
    const elapsed = Math.max(0, runtime.focus.totalDurationMs - runtime.focus.remainingMs);
    const stageInfo = resolveBlockStageFromElapsed(
      runtime.focus.blockKind,
      elapsed,
      Math.round(runtime.focus.totalDurationMs / 60000)
    );
    if (stageInfo.stageIndex !== runtime.focus.lastStageIndex) {
      runtime.focus.lastStageIndex = stageInfo.stageIndex;
      pushToast(`${stageInfo.stage.label}: ${stageInfo.stage.instruction}`, 'info', 6000);
      if (appState.settings.focus.soundEnabled && !runtime.alertsState.inQuietHours) {
        orchestrator.playAlertCue('soft', {
          volume: appState.settings.audio.volume,
          soundEnabled: appState.settings.audio.soundEnabled,
        });
      }
      notify();
    }
  }

  function checkSleepAutoQuran() {
    const q = appState.settings.quran;
    if (!q?.autoPlayOnSleep) return;
    const tz = appState.settings.location.timezone || 'Africa/Cairo';
    const parts = getZonedParts(new Date(runtime.nowMs), tz);
    const curMins = parts.hour * 60 + parts.minute;
    const sleepMins = parseHHMMToMinutes(appState.settings.alerts?.sleepTime || '22:30');
    if (sleepMins === null) return;

    const withinSleepOnset = curMins >= sleepMins && curMins <= sleepMins + 10;
    if (!withinSleepOnset) return;
    if (appState.quranProgress?.sleepTriggeredDates?.[parts.dateKey]) return;

    // تسجيل تشغيل وضع النوم لهذا اليوم لمنع تكرار الإقفال عند استيقاظ المستخدم يدوياً
    appState = {
      ...appState,
      quranProgress: {
        ...appState.quranProgress,
        sleepTriggeredDates: {
          ...(appState.quranProgress?.sleepTriggeredDates || {}),
          [parts.dateKey]: true,
        },
      },
    };
    persistState();

    runtime.screensaverActive = true;
    runtime.screensaverPreviewRequested = false;

    const sleepMode = q.sleepMode || 'playlist';
    const startSurah =
      sleepMode === 'khatmah'
        ? appState.quranProgress?.khatmahSurah || 1
        : sleepMode === 'playlist'
          ? (q.playlist && q.playlist[0]) || 67
          : q.selectedSurah || 1;
    const startSec = sleepMode === 'khatmah' ? appState.quranProgress?.khatmahTimeSec || 0 : 0;

    const endsAtMs =
      q.sleepTimerMinutes === 0 && runtime.qiyamTimes?.fajrMs
        ? runtime.qiyamTimes.fajrMs
        : Number(q.sleepTimerMinutes || 30) > 0
          ? runtime.nowMs + Number(q.sleepTimerMinutes || 30) * 60000
          : null;

    orchestrator.playSurah(startSurah, {
      mode: sleepMode,
      startTimeSec: startSec,
      volume: q.sleepVolume ?? 0.35,
      isSleepSession: true,
      sleepTimerEndsAtMs: endsAtMs,
    });
    notify();
  }

  function recomputeTimeSlices(triggerAudioForNewAlerts = true) {
    refreshAccurateNowMs();
    runtime.prayerState = resolvePrayerState(runtime.nowMs, appState.settings, appState.cache);
    runtime.qiyamTimes = computeQiyamNightTimes(runtime.nowMs, appState.settings, appState.cache);
    runtime.weatherSnapshot = getWeatherSnapshot(appState.cache, runtime.nowMs);
    runtime.studyPlan = resolveDailyStudyPlan({
      nowMs: runtime.nowMs,
      settings: appState.settings,
      studyProgress: appState.studyProgress,
      cache: appState.cache,
      customEvents: appState.customEvents,
    });
    runtime.weeklyStats = computeWeeklyStudyStats(
      appState.studyProgress,
      runtime.studyPlan.dateKey,
      appState.settings
    );

    const prevPrimaryId = runtime.alertsState?.primaryAlert?.id || null;
    const evalRes = evaluateActiveAlerts({
      nowMs: runtime.nowMs,
      prayerState: runtime.prayerState,
      settings: appState.settings,
      tasks: appState.tasks,
      alertLedger: appState.alertLedger,
      studyPlan: runtime.studyPlan,
      qiyamTimes: runtime.qiyamTimes,
    });
    runtime.alertsState = evalRes;

    // تسجيل التنبيهات الجديدة فوراً لمنع تكرارها عند إعادة تحميل الصفحة
    if (evalRes.newlyTriggered.length > 0) {
      const nextLedger = { ...appState.alertLedger };
      const nowIso = new Date(runtime.nowMs).toISOString();
      for (const item of evalRes.newlyTriggered) {
        nextLedger[item.id] = {
          dateKey: item.dateKey,
          status: 'shown',
          updatedAt: nowIso,
        };
      }
      appState = { ...appState, alertLedger: nextLedger };
      persistState();

      if (triggerAudioForNewAlerts) {
        const topWithSound = evalRes.newlyTriggered.find((a) => a.soundCue);
        if (topWithSound) {
          orchestrator.playAlertCue(topWithSound.soundCue, {
            volume: appState.settings.audio.volume,
            soundEnabled: appState.settings.audio.soundEnabled,
            adhanTone: appState.settings.audio.adhanTone,
          });
        }
      }
    }

    if (triggerAudioForNewAlerts) {
      checkSleepAutoQuran();
    }

    checkPrayerAutoPauseAndResume();

    if (runtime.focus.status === 'running' && runtime.focus.endsAtMs !== null) {
      const rem = Math.max(0, runtime.focus.endsAtMs - runtime.nowMs);
      runtime.focus.remainingMs = rem;
      checkBlockStageTransition();
      if (rem === 0) {
        completeFocusPhase();
      }
    }

    const nextPrimaryId = runtime.alertsState?.primaryAlert?.id || null;
    if (prevPrimaryId !== nextPrimaryId) {
      notify();
    }
  }

  function completeFocusPhase() {
    const finishedPhase = runtime.focus.phase;
    const finishedMode = runtime.focus.mode;
    const finishedKind = runtime.focus.blockKind;
    const finishedBlockId = runtime.focus.blockId;
    const hasBreakAfter = runtime.focus.hasBreakAfter;
    const durationMinutes = Math.max(1, Math.round(runtime.focus.totalDurationMs / 60000));

    const tz = appState.settings.location.timezone || 'Africa/Cairo';
    const todayKey = getZonedParts(new Date(runtime.nowMs), tz).dateKey;

    const sessionRecord = {
      id: `focus-${Date.now().toString(36)}`,
      dateKey: todayKey,
      phase: finishedPhase,
      durationMinutes,
      completedAt: new Date(runtime.nowMs).toISOString(),
    };

    appState = {
      ...appState,
      focusSessions: [...(appState.focusSessions || []), sessionRecord],
    };

    // إنهاء بلوك دراسي يسجل تلقائياً في إنجاز اليوم ويحدّث عداد المراكم إن كان بلوك مراكم
    let completionMsg =
      finishedPhase === 'focus'
        ? 'انتهت جلسة التركيز — حان وقت الراحة'
        : 'انتهت الاستراحة — جاهز لجلسة جديدة';

    if (finishedMode === 'study_block' && finishedKind !== 'break' && finishedBlockId) {
      const block = runtime.studyPlan?.blocks?.find((b) => b.id === finishedBlockId);
      if (block && !block.completed) {
        const res = toggleStudyBlockCompletion(appState.studyProgress, todayKey, block);
        appState = { ...appState, studyProgress: res.studyProgress };
        if (res.backlogDecremented) {
          completionMsg = `رائع! أتممت بلوك مراكم (${block.subject}) — المتبقي الآن ${toArabicDigits(res.backlogRemaining)} بلوكات.`;
        } else {
          completionMsg = `أحسنت! اكتمل بلوك ${block.subject}.`;
        }
      }
    }

    persistState();

    // إذا كان للبلوك استراحة فاصلة (١٠ دقائق بين بلوك ١ و٢) نبدأ مؤقت الاستراحة تلقائياً
    if (finishedMode === 'study_block' && hasBreakAfter && finishedKind !== 'break') {
      const breakMs = 10 * 60000;
      runtime.focus = {
        mode: 'study_block',
        phase: 'break',
        blockId: finishedBlockId,
        blockKind: 'break',
        subject: 'استراحة فاصلة',
        tag: '١٠ دقائق',
        hasBreakAfter: false,
        guideText: 'تحرك قليلاً واشرب الماء بعيداً عن الشاشة قبل البلوك التالي.',
        status: 'running',
        pausedForPrayer: null,
        totalDurationMs: breakMs,
        remainingMs: breakMs,
        endsAtMs: runtime.nowMs + breakMs,
        lastStageIndex: 0,
      };
      completionMsg += ' بدأت استراحة ١٠ دقائق تلقائياً.';
    } else {
      const nextPhase = finishedPhase === 'focus' ? 'break' : 'focus';
      const nextMins =
        nextPhase === 'focus'
          ? appState.settings.focus.focusMinutes
          : appState.settings.focus.breakMinutes;

      runtime.focus = {
        mode: 'custom_focus',
        phase: nextPhase,
        blockId: null,
        blockKind: nextPhase,
        subject: null,
        tag: null,
        hasBreakAfter: false,
        guideText: null,
        status: 'idle',
        pausedForPrayer: null,
        totalDurationMs: nextMins * 60000,
        remainingMs: nextMins * 60000,
        endsAtMs: null,
        lastStageIndex: 0,
      };
    }

    pushToast(completionMsg, 'info', 6500);

    if (appState.settings.focus.soundEnabled && !runtime.alertsState.inQuietHours) {
      orchestrator.playAlertCue('focus', {
        volume: appState.settings.audio.volume,
        soundEnabled: appState.settings.audio.soundEnabled,
      });
    }

    recomputeTimeSlices(false);
    notify();
  }

  async function syncExternalData(force = false) {
    runtime.online = globalThis.navigator?.onLine ?? true;
    if (!runtime.online) {
      notify();
      return;
    }

    // ١. مزامنة الوقت وحفظ معامل الانحراف (Time Drift Correction)
    if (!runtime.syncingTime) {
      const lastSyncAt = appState.cache?.timeDrift?.syncedAt;
      const shouldSyncTime =
        force || !lastSyncAt || Date.now() - new Date(lastSyncAt).getTime() > 6 * 3600000;
      if (shouldSyncTime) {
        runtime.syncingTime = true;
        try {
          const driftResult = await syncAccurateNetworkTime();
          if (driftResult) {
            appState = {
              ...appState,
              cache: {
                ...appState.cache,
                timeDrift: driftResult,
              },
            };
            persistState();
            recomputeTimeSlices(false);
          }
        } finally {
          runtime.syncingTime = false;
        }
      }
    }

    const tz = appState.settings.location.timezone || 'Africa/Cairo';
    const parts = getZonedParts(new Date(runtime.nowMs), tz);
    const cacheKey = buildPrayerCacheKey(
      parts.year,
      parts.month,
      appState.settings.location,
      appState.settings.prayer.method
    );

    const existingMonth = appState.cache?.prayerMonths?.[cacheKey];
    const shouldFetchPrayer =
      force ||
      !existingMonth ||
      runtime.nowMs - new Date(existingMonth.fetchedAt).getTime() > 24 * 3600000;

    if (shouldFetchPrayer && !runtime.syncingPrayer) {
      runtime.syncingPrayer = true;
      runtime.prayerSyncError = null;
      notify();
      try {
        const monthData = await fetchMonthlyPrayerTimes(
          parts.year,
          parts.month,
          appState.settings.location,
          appState.settings.prayer.method
        );
        appState = {
          ...appState,
          cache: {
            ...appState.cache,
            prayerMonths: {
              ...(appState.cache?.prayerMonths || {}),
              [cacheKey]: monthData,
            },
          },
        };
        persistState();
      } catch {
        runtime.prayerSyncError = 'تعذر تحديث مواقيت الصلاة؛ يعمل الحساب الفلكي المحلي المدمج.';
        logSystemEvent('warning', runtime.prayerSyncError);
      } finally {
        runtime.syncingPrayer = false;
        recomputeTimeSlices(false);
        notify();
      }
    }

    if (appState.settings.display.showWeather && !runtime.syncingWeather) {
      const wSnap = getWeatherSnapshot(appState.cache, runtime.nowMs);
      if (force || !wSnap.available || wSnap.isStale) {
        runtime.syncingWeather = true;
        runtime.weatherSyncError = null;
        notify();
        try {
          const weatherData = await fetchWeatherForecast(appState.settings.location);
          appState = {
            ...appState,
            cache: {
              ...appState.cache,
              weather: weatherData,
            },
          };
          persistState();
        } catch {
          runtime.weatherSyncError = 'تعذر تحديث الطقس؛ تتوفر البدائل المحلية.';
          logSystemEvent('warning', runtime.weatherSyncError);
        } finally {
          runtime.syncingWeather = false;
          recomputeTimeSlices(false);
          notify();
        }
      }
    }
  }

  function updateAppState(updater) {
    const next = typeof updater === 'function' ? updater(appState) : updater;
    appState = next;
    applyDocumentTheme();
    persistState();
    recomputeTimeSlices(false);
    notify();
  }

  function navigate(route, pushHistory = true) {
    if (runtime.route === route) return;
    if (pushHistory && runtime.route) {
      runtime.routeHistory = [...runtime.routeHistory.slice(-15), runtime.route];
    }
    runtime.route = route;
    notify();
  }

  function goBack() {
    if (runtime.modal) {
      runtime.modal = null;
      notify();
      return true;
    }
    if (runtime.routeHistory.length > 0) {
      const prev = runtime.routeHistory[runtime.routeHistory.length - 1];
      runtime.routeHistory = runtime.routeHistory.slice(0, -1);
      runtime.route = prev;
      notify();
      return true;
    }
    if (runtime.route !== 'home') {
      runtime.route = 'home';
      notify();
      return true;
    }
    return false;
  }

  function getSnapshot() {
    return {
      appState,
      runtime,
    };
  }

  let tickTimer = null;
  let lastMinuteKey = '';

  function start() {
    pwaInstaller.init();
    applyDocumentTheme();
    recomputeTimeSlices(false);

    if (runtime.recoveredFromError) {
      pushToast('تم استرجاع الإعدادات الافتراضية بسبب تلف في البيانات المخزنة.', 'warning', 7000);
    }

    const parts = getZonedParts(new Date(runtime.nowMs), appState.settings.location.timezone);
    lastMinuteKey = `${parts.dateKey}-${parts.hour}-${parts.minute}`;

    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      refreshAccurateNowMs();
      const tz = appState.settings.location.timezone || 'Africa/Cairo';
      const curParts = getZonedParts(new Date(runtime.nowMs), tz);
      const curMinKey = `${curParts.dateKey}-${curParts.hour}-${curParts.minute}`;

      if (curMinKey !== lastMinuteKey) {
        const prevDate = lastMinuteKey.slice(0, 10);
        lastMinuteKey = curMinKey;
        if (prevDate && prevDate !== curParts.dateKey) {
          runtime.selectedHabitsDateKey = curParts.dateKey;
          syncExternalData(true);
        }
        recomputeTimeSlices(true);
        notify();
      } else {
        checkPrayerAutoPauseAndResume();
        if (runtime.focus.status === 'running' && runtime.focus.endsAtMs !== null) {
          runtime.focus.remainingMs = Math.max(0, runtime.focus.endsAtMs - runtime.nowMs);
          checkBlockStageTransition();
          if (runtime.focus.remainingMs === 0) {
            completeFocusPhase();
            return;
          }
        }
        runtime.prayerState = resolvePrayerState(runtime.nowMs, appState.settings, appState.cache);
        orchestrator.tick(runtime.nowMs);
        notifyTick();
      }
    }, 1000);

    refreshQuranDownloads();

    globalThis.addEventListener?.('online', () => {
      runtime.online = true;
      pushToast('عاد الاتصال بالإنترنت — جاري مزامنة الوقت والمواقيت والطقس.', 'info', 4000);
      syncExternalData(true);
      notify();
    });

    globalThis.addEventListener?.('offline', () => {
      runtime.online = false;
      pushToast('وضع العمل المحلي (بدون إنترنت) — الحساب الفلكي نشط.', 'warning', 5000);
      notify();
    });

    syncExternalData(false);
  }

  function destroy() {
    pwaInstaller.destroy();
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    if (downloadAbortController) {
      downloadAbortController.abort();
      downloadAbortController = null;
    }
    orchestrator.destroy();
  }

  return {
    getSnapshot,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    subscribeTick(fn) {
      tickListeners.add(fn);
      return () => tickListeners.delete(fn);
    },
    start,
    destroy,
    updateAppState,
    navigate,
    goBack,
    syncExternalData,
    pushToast,
    dismissToast,
    setModal(modalConfig) {
      runtime.modal = modalConfig;
      notify();
    },
    closeModal() {
      runtime.modal = null;
      notify();
    },
    setSelectedHabitsDateKey(dateKey) {
      runtime.selectedHabitsDateKey = dateKey;
      notify();
    },
    setSettingsTab(tabId) {
      runtime.settingsTab = tabId;
      notify();
    },
    toggleOverscanGuide() {
      runtime.overscanGuideVisible = !runtime.overscanGuideVisible;
      notify();
    },
    recordObservedKey(keyInfo) {
      runtime.observedKeys = [keyInfo, ...runtime.observedKeys].slice(0, 6);
      if (runtime.route === 'diagnostics') {
        const box = document.getElementById('diag-keys-log');
        if (box) {
          box.textContent = runtime.observedKeys
            .map((k) => `${k.key} (code: ${k.code || '-'}, keyCode: ${k.keyCode})`)
            .join(' | ');
        }
      }
    },
    dismissAlert(alertId, status = 'dismissed') {
      const tz = appState.settings.location.timezone || 'Africa/Cairo';
      const dateKey = getZonedParts(new Date(runtime.nowMs), tz).dateKey;
      updateAppState((prev) => ({
        ...prev,
        alertLedger: {
          ...prev.alertLedger,
          [alertId]: { dateKey, status, updatedAt: new Date(runtime.nowMs).toISOString() },
        },
      }));
      orchestrator.onAlertAcknowledged();
    },
    studyActions: {
      startBlock(block) {
        if (!block) return;
        const durMs = Math.max(1, Number(block.durationMinutes || 40)) * 60000;
        const guide = getGuideForSubject(block.subject, appState.settings.study?.weakestSubject);
        runtime.focus = {
          mode: 'study_block',
          phase: 'focus',
          blockId: block.id,
          blockKind: block.kind || 'study_block',
          subject: block.subject,
          tag: block.tag,
          hasBreakAfter: Boolean(block.hasBreakAfter),
          guideText: guide.text,
          status: 'running',
          pausedForPrayer: null,
          totalDurationMs: durMs,
          remainingMs: durMs,
          endsAtMs: runtime.nowMs + durMs,
          lastStageIndex: 0,
        };
        pushToast(`بدأ بلوك ${block.subject} (${toArabicDigits(block.durationMinutes)} دقيقة) — المرحلة ١: استرجاع نشط.`, 'info', 5500);
        checkPrayerAutoPauseAndResume();
        notify();
      },
      toggleBlockDone(block) {
        if (!block) return;
        const dateKey = runtime.studyPlan?.dateKey || getZonedParts(new Date(runtime.nowMs), appState.settings.location.timezone).dateKey;
        const res = toggleStudyBlockCompletion(appState.studyProgress, dateKey, block);
        updateAppState((prev) => ({
          ...prev,
          studyProgress: res.studyProgress,
        }));
        if (res.backlogDecremented) {
          pushToast(
            res.backlogRemaining === 0
              ? 'ممتاز! أنهيت جميع بلوكات المراكم المستهدفة — استمر على هذا الإنجاز!'
              : `أحسنت! نقص عداد المراكم بمقدار ١ — المتبقي ${toArabicDigits(res.backlogRemaining)} بلوكات.`,
            'info',
            5500
          );
        } else if (res.completedNow) {
          pushToast(`تم تسجيل إنجاز بلوك ${block.subject}.`, 'info');
        }
      },
      swapTodayBlocks() {
        const dateKey = runtime.studyPlan?.dateKey || getZonedParts(new Date(runtime.nowMs), appState.settings.location.timezone).dateKey;
        updateAppState((prev) => ({
          ...prev,
          studyProgress: {
            ...prev.studyProgress,
            swappedDates: {
              ...(prev.studyProgress?.swappedDates || {}),
              [dateKey]: !prev.studyProgress?.swappedDates?.[dateKey],
            },
          },
        }));
        pushToast('تم تبديل ترتيب البلوكين لهذا اليوم.', 'info');
      },
      toggleShiftOverrideToday() {
        const dateKey = runtime.studyPlan?.dateKey || getZonedParts(new Date(runtime.nowMs), appState.settings.location.timezone).dateKey;
        updateAppState((prev) => ({
          ...prev,
          studyProgress: {
            ...prev.studyProgress,
            overrideShiftDates: {
              ...(prev.studyProgress?.overrideShiftDates || {}),
              [dateKey]: !prev.studyProgress?.overrideShiftDates?.[dateKey],
            },
          },
        }));
      },
      adjustBacklog(delta) {
        updateAppState((prev) => ({
          ...prev,
          studyProgress: {
            ...prev.studyProgress,
            backlogRemaining: Math.max(0, Math.min(100, Number(prev.studyProgress?.backlogRemaining ?? 9) + delta)),
          },
        }));
      },
      activateRamadanMode(windowChoice = 'after_taraweeh') {
        updateAppState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            study: {
              ...prev.settings.study,
              ramadanMode: 'on',
              ramadanWindow: windowChoice,
            },
          },
        }));
        pushToast('تم تفعيل وضع رمضان الدراسي بنجاح.', 'info');
      },
      dismissRamadanPrompt() {
        updateAppState((prev) => ({
          ...prev,
          studyProgress: {
            ...prev.studyProgress,
            ramadanPromptDismissed: true,
          },
        }));
      },
    },
    focusActions: {
      start() {
        const defaultMins =
          runtime.focus.phase === 'focus'
            ? appState.settings.focus.focusMinutes
            : appState.settings.focus.breakMinutes;
        const rem = runtime.focus.remainingMs > 0 ? runtime.focus.remainingMs : defaultMins * 60000;
        const total = runtime.focus.totalDurationMs > 0 ? runtime.focus.totalDurationMs : rem;
        runtime.focus = {
          ...runtime.focus,
          status: 'running',
          pausedForPrayer: null,
          totalDurationMs: total,
          remainingMs: rem,
          endsAtMs: runtime.nowMs + rem,
        };
        checkPrayerAutoPauseAndResume();
        notify();
      },
      pause() {
        if (runtime.focus.status !== 'running') return;
        const rem = Math.max(0, (runtime.focus.endsAtMs || runtime.nowMs) - runtime.nowMs);
        runtime.focus = {
          ...runtime.focus,
          status: 'paused',
          remainingMs: rem,
          endsAtMs: null,
        };
        notify();
      },
      reset() {
        const mins =
          runtime.focus.mode === 'study_block'
            ? Math.max(1, Math.round(runtime.focus.totalDurationMs / 60000))
            : runtime.focus.phase === 'focus'
              ? appState.settings.focus.focusMinutes
              : appState.settings.focus.breakMinutes;
        runtime.focus = {
          ...runtime.focus,
          status: 'idle',
          pausedForPrayer: null,
          totalDurationMs: mins * 60000,
          remainingMs: mins * 60000,
          endsAtMs: null,
          lastStageIndex: 0,
        };
        notify();
      },
      switchPhase(targetPhase) {
        const nextPhase = targetPhase || (runtime.focus.phase === 'focus' ? 'break' : 'focus');
        const mins =
          nextPhase === 'focus'
            ? appState.settings.focus.focusMinutes
            : appState.settings.focus.breakMinutes;
        runtime.focus = {
          mode: 'custom_focus',
          phase: nextPhase,
          blockId: null,
          blockKind: nextPhase,
          subject: null,
          tag: null,
          hasBreakAfter: false,
          guideText: null,
          status: 'idle',
          pausedForPrayer: null,
          totalDurationMs: mins * 60000,
          remainingMs: mins * 60000,
          endsAtMs: null,
          lastStageIndex: 0,
        };
        notify();
      },
    },
    screensaverActions: {
      enter(isPreview = false) {
        if (!runtime.screensaverActive) {
          runtime.screensaverActive = true;
          runtime.screensaverPreviewRequested = Boolean(isPreview);
          notify();
        }
      },
      exit() {
        if (runtime.screensaverActive || runtime.screensaverPreviewRequested) {
          runtime.screensaverActive = false;
          runtime.screensaverPreviewRequested = false;
          notify();
        }
      },
      enterPreview() {
        runtime.screensaverPreviewRequested = true;
        runtime.screensaverActive = true;
        notify();
      },
    },
    quranActions: {
      playSurah(surahNumber, modeOverride = null) {
        const q = appState.settings.quran;
        const mode = modeOverride || q.mode || 'single';
        const num = Number(surahNumber || q.selectedSurah || 1);
        const startTimeSec =
          mode === 'khatmah' && appState.quranProgress?.khatmahSurah === num
            ? appState.quranProgress?.khatmahTimeSec || 0
            : 0;
        updateAppState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            quran: { ...prev.settings.quran, selectedSurah: num, mode },
          },
        }));
        return orchestrator.playSurah(num, { mode, startTimeSec, volume: q.volume });
      },
      togglePlayPause: () => orchestrator.togglePlayPause(),
      stop: () => orchestrator.stopQuran(),
      nextSurah: () => orchestrator.nextSurah(),
      prevSurah: () => orchestrator.prevSurah(),
      setVolume(vol) {
        const clamped = Math.max(0.05, Math.min(1, Number(vol) || 0.75));
        orchestrator.setQuranVolume(clamped);
        updateAppState((prev) => ({
          ...prev,
          settings: { ...prev.settings, quran: { ...prev.settings.quran, volume: clamped } },
        }));
      },
      setSleepTimer(minutes) {
        const mins = Number(minutes);
        orchestrator.setSleepTimer(mins, runtime.nowMs, runtime.qiyamTimes?.fajrMs);
        updateAppState((prev) => ({
          ...prev,
          settings: { ...prev.settings, quran: { ...prev.settings.quran, sleepTimerMinutes: mins } },
        }));
      },
      setFilter(filterKey) {
        runtime.quranFilter = filterKey;
        notify();
      },
      togglePlaylistSurah(surahNumber) {
        const num = Number(surahNumber);
        updateAppState((prev) => {
          const cur = prev.settings.quran.playlist || [];
          const exists = cur.includes(num);
          const next = exists ? cur.filter((x) => x !== num) : [...cur, num];
          return {
            ...prev,
            settings: {
              ...prev.settings,
              quran: { ...prev.settings.quran, playlist: next },
            },
          };
        });
      },
      async downloadSurahs(surahNumbers) {
        if (downloadAbortController) return;
        downloadAbortController = new AbortController();
        runtime.quranDownloads = {
          ...runtime.quranDownloads,
          batchProgress: { active: true, completed: 0, total: surahNumbers.length, currentSurah: surahNumbers[0], bytesDownloaded: 0, errors: 0 },
        };
        notify();
        try {
          const res = await downloadSurahsBatch(surahNumbers, {
            signal: downloadAbortController.signal,
            onProgress: (prog) => {
              runtime.quranDownloads = { ...runtime.quranDownloads, batchProgress: prog };
              notify();
            },
          });
          await refreshQuranDownloads();
          pushToast(
            res.errors > 0
              ? `اكتمل تنزيل ${toArabicDigits(res.completed)} سورة (تعذر ${toArabicDigits(res.errors)}).`
              : `تم تنزيل ${toArabicDigits(res.completed)} سورة للعمل بدون إنترنت.`,
            res.errors > 0 ? 'warning' : 'info'
          );
        } catch (err) {
          if (err?.name === 'AbortError') {
            pushToast('تم إلغاء التنزيل.', 'warning');
          } else {
            pushToast(err?.message || 'تعذر تنزيل السور.', 'danger', 6500);
          }
        } finally {
          downloadAbortController = null;
          runtime.quranDownloads = { ...runtime.quranDownloads, batchProgress: null };
          notify();
        }
      },
      downloadAllSurahs() {
        const all = QURAN_SURAHS.map((s) => s.number);
        return this.downloadSurahs(all);
      },
      cancelDownload() {
        downloadAbortController?.abort();
      },
      async deleteSurah(surahNumber) {
        await deleteDownloadedSurah(surahNumber);
        await refreshQuranDownloads();
        pushToast('تم مسح السورة من الذاكرة المحلية.', 'info');
      },
      async clearAllDownloads() {
        await clearAllDownloadedSurahs();
        await refreshQuranDownloads();
        pushToast('تم تحرير مساحة التخزين ومسح جميع السور المحملة.', 'info');
      },
      refreshDownloads: () => refreshQuranDownloads(),
    },
    audio: {
      unlockAndTest: () => orchestrator.unlockAndTestAlertAudio(appState.settings.audio.volume),
      playCue: (cue) =>
        orchestrator.playAlertCue(cue, {
          volume: appState.settings.audio.volume,
          soundEnabled: appState.settings.audio.soundEnabled,
          adhanTone: appState.settings.audio.adhanTone,
        }),
      stop: () => orchestrator.stopAlertAudio(),
      toggleMute: () => orchestrator.toggleAlertMute(),
    },
    pwaActions: {
      refreshStatus: () => pwaInstaller.refreshStatus(),
      installAndGrantPermissions: () =>
        pwaInstaller.installAndGrantPermissions({
          unlockAudio: () => orchestrator.unlockAndTestAlertAudio(appState.settings.audio.volume),
          onToast: (msg, type) => pushToast(msg, type, 5500),
          onShowTvGuide: () => {
            runtime.modal = {
              title: 'تثبيت تطبيق جووو على تلفاز توشيبا',
              body: 'تم تفعيل صلاحيات التخزين الدائم والصوت بنجاح. لإضافة «جووو» إلى الشاشة الرئيسية للتلفاز في خطوتين:',
              bullets: [
                '١. اضغط زر القائمة (Menu / ⋮) في أعلى متصفح التلفاز.',
                '٢. اختر «إضافة إلى الشاشة الرئيسية» (Add to Home screen) أو «تثبيت التطبيق» ثم أكّد بالضغط على موافق (OK).',
              ],
              confirmLabel: 'فهمت',
              onConfirm: () => {},
            };
            notify();
          },
        }),
      _installerForTest: pwaInstaller,
    },
    resetAllToDefaults() {
      const fresh = createInitialState();
      appState = fresh;
      persistState();
      applyDocumentTheme();
      recomputeTimeSlices(false);
      pushToast('تمت استعادة الإعدادات الافتراضية بنجاح.', 'info');
      notify();
    },
    getStorageKey() {
      return APP_META.storageKey;
    },
  };
}
