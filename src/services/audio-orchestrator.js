import { getSurahByNumber } from '../data/quran-surahs.js';
import { createAudioEngine } from './audio.js';
import {
  getDownloadedSurahBlob,
  getLocalBundledSurahSet,
  getSurahSourceUrls,
  padSurahCode,
} from './quran-storage.js';

export function resolveRepeatIterations(repeatMode) {
  if (repeatMode === 'loop') return Infinity;
  if (repeatMode === '3') return 3;
  if (repeatMode === '5') return 5;
  return 1;
}

export function getNextSurahInQueue({ currentSurah, mode, playlist = [], playlistLoop = true, repeatRemaining }) {
  if (mode === 'single') {
    if (repeatRemaining === Infinity || repeatRemaining > 1) {
      return {
        surahNumber: currentSurah,
        nextRepeatRemaining: repeatRemaining === Infinity ? Infinity : repeatRemaining - 1,
        continuePlaying: true,
      };
    }
    return { surahNumber: currentSurah, nextRepeatRemaining: 0, continuePlaying: false };
  }

  if (mode === 'playlist') {
    const cleanList = (playlist || []).length > 0 ? playlist.map(Number) : [currentSurah];
    const idx = cleanList.indexOf(Number(currentSurah));
    if (idx === -1) {
      return { surahNumber: cleanList[0], nextRepeatRemaining: 1, continuePlaying: true };
    }
    if (idx + 1 < cleanList.length) {
      return { surahNumber: cleanList[idx + 1], nextRepeatRemaining: 1, continuePlaying: true };
    }
    if (playlistLoop) {
      return { surahNumber: cleanList[0], nextRepeatRemaining: 1, continuePlaying: true };
    }
    return { surahNumber: currentSurah, nextRepeatRemaining: 0, continuePlaying: false };
  }

  // وضع الختمة المتتابعة (١ -> ١١٤ -> ١)
  const next = Number(currentSurah) >= 114 ? 1 : Number(currentSurah) + 1;
  return { surahNumber: next, nextRepeatRemaining: 1, continuePlaying: true };
}

export function getPrevSurahInQueue({ currentSurah, mode, playlist = [] }) {
  if (mode === 'playlist' && playlist.length > 0) {
    const idx = playlist.indexOf(Number(currentSurah));
    if (idx > 0) return playlist[idx - 1];
    return playlist[playlist.length - 1];
  }
  return Number(currentSurah) <= 1 ? 114 : Number(currentSurah) - 1;
}

export function createAudioOrchestrator({
  onAlertStateChange,
  onQuranStateChange,
  onBlocked,
  onProgressPersist,
  getSettings,
} = {}) {
  let quranEl = null;
  let activeObjectUrl = null;
  let fadeTimer = null;
  let resumeAfterAlertTimer = null;
  let interruptedSnapshot = null;
  let lastProgressSavedSec = 0;

  const state = {
    isPlaying: false,
    isLoading: false,
    isInterrupted: false,
    surahNumber: 1,
    mode: 'single',
    repeatRemaining: 1,
    currentTimeSec: 0,
    durationSec: 0,
    targetVolume: 0.75,
    sleepTimerEndsAtMs: null,
    isSleepSession: false,
    sourceType: null,
    error: null,
  };

  function emitQuran() {
    onQuranStateChange?.({ ...state });
  }

  function clearFadeTimer() {
    if (fadeTimer) {
      clearInterval(fadeTimer);
      fadeTimer = null;
    }
  }

  function revokeObjectUrl() {
    if (activeObjectUrl) {
      try {
        URL.revokeObjectURL(activeObjectUrl);
      } catch {
        // تجاهل آمن
      }
      activeObjectUrl = null;
    }
  }

  function smoothFadeVolume(targetVol, durationMs = 400) {
    clearFadeTimer();
    return new Promise((resolve) => {
      if (!quranEl) {
        resolve();
        return;
      }
      const startVol = Number(quranEl.volume ?? 0);
      const endVol = Math.max(0, Math.min(1, Number(targetVol)));
      if (Math.abs(startVol - endVol) < 0.02 || durationMs <= 0) {
        quranEl.volume = endVol;
        resolve();
        return;
      }
      const steps = 8;
      const stepMs = Math.max(20, Math.round(durationMs / steps));
      let step = 0;
      fadeTimer = setInterval(() => {
        step += 1;
        const ratio = step / steps;
        if (quranEl) {
          quranEl.volume = Math.max(0, Math.min(1, startVol + (endVol - startVol) * ratio));
        }
        if (step >= steps) {
          clearFadeTimer();
          resolve();
        }
      }, stepMs);
    });
  }

  function ensureQuranElement() {
    if (quranEl) return quranEl;
    if (typeof globalThis.Audio === 'undefined') return null;

    const audio = new globalThis.Audio();
    audio.preload = 'auto';

    audio.addEventListener('timeupdate', () => {
      state.currentTimeSec = Number(audio.currentTime || 0);
      state.durationSec = Number(audio.duration || 0);
      emitQuran();
      if (Math.abs(state.currentTimeSec - lastProgressSavedSec) >= 5) {
        lastProgressSavedSec = state.currentTimeSec;
        onProgressPersist?.({
          surahNumber: state.surahNumber,
          currentTimeSec: Math.floor(state.currentTimeSec),
          mode: state.mode,
        });
      }
    });

    audio.addEventListener('loadedmetadata', () => {
      state.durationSec = Number(audio.duration || 0);
      state.isLoading = false;
      emitQuran();
    });

    audio.addEventListener('playing', () => {
      state.isPlaying = true;
      state.isLoading = false;
      state.error = null;
      emitQuran();
    });

    audio.addEventListener('pause', () => {
      state.isPlaying = false;
      emitQuran();
    });

    audio.addEventListener('ended', () => {
      const settings = getSettings?.() || {};
      const qSettings = settings.quran || {};
      const next = getNextSurahInQueue({
        currentSurah: state.surahNumber,
        mode: state.mode,
        playlist: qSettings.playlist || [67, 32, 18, 2],
        playlistLoop: qSettings.playlistLoop !== false,
        repeatRemaining: state.repeatRemaining,
      });

      if (next.continuePlaying) {
        state.repeatRemaining = next.nextRepeatRemaining;
        playSurah(next.surahNumber, {
          mode: state.mode,
          startTimeSec: 0,
          keepRepeatCount: true,
          volume: state.targetVolume,
          isSleepSession: state.isSleepSession,
          sleepTimerEndsAtMs: state.sleepTimerEndsAtMs,
        });
      } else {
        state.isPlaying = false;
        state.currentTimeSec = 0;
        emitQuran();
      }
    });

    quranEl = audio;
    return quranEl;
  }

  async function resolveAudioSourceForSurah(surahNumber) {
    const localSet = getLocalBundledSurahSet();
    if (localSet.has(Number(surahNumber))) {
      return {
        primaryType: 'local',
        urls: [`./quran/husary-mujawwad/${padSurahCode(surahNumber)}.mp3`],
      };
    }

    const blob = await getDownloadedSurahBlob(surahNumber);
    if (blob) {
      revokeObjectUrl();
      activeObjectUrl = URL.createObjectURL(blob);
      return {
        primaryType: 'indexeddb',
        urls: [activeObjectUrl],
      };
    }

    return {
      primaryType: 'stream',
      urls: getSurahSourceUrls(surahNumber),
    };
  }

  async function playSurah(surahNumber, options = {}) {
    const settings = getSettings?.() || {};
    const qSettings = settings.quran || {};

    const num = Math.max(1, Math.min(114, Number(surahNumber) || 1));
    state.surahNumber = num;
    state.mode = options.mode || qSettings.mode || 'single';
    state.targetVolume = Math.max(0.05, Math.min(1, Number(options.volume ?? qSettings.volume ?? 0.75)));
    state.isSleepSession = Boolean(options.isSleepSession);
    if (options.sleepTimerEndsAtMs !== undefined) {
      state.sleepTimerEndsAtMs = options.sleepTimerEndsAtMs;
    }
    if (!options.keepRepeatCount) {
      state.repeatRemaining = resolveRepeatIterations(qSettings.repeatMode || 'loop');
    }
    state.isLoading = true;
    state.error = null;
    state.isInterrupted = false;
    interruptedSnapshot = null;
    emitQuran();

    const audio = ensureQuranElement();
    if (!audio) {
      state.isLoading = false;
      state.error = 'المتصفح لا يدعم عنصر تشغيل الصوت.';
      emitQuran();
      return { ok: false, reason: state.error };
    }

    const resolved = await resolveAudioSourceForSurah(num);
    state.sourceType = resolved.primaryType;

    const trySourceAtIndex = async (idx) => {
      if (idx >= resolved.urls.length) {
        state.isLoading = false;
        state.isPlaying = false;
        state.error = `تعذر تشغيل سورة ${getSurahByNumber(num).name} — تأكد من الاتصال أو التنزيل المحلي.`;
        emitQuran();
        return { ok: false, reason: state.error };
      }

      const url = resolved.urls[idx];
      audio.onerror = () => {
        trySourceAtIndex(idx + 1);
      };

      const seekSec = Math.max(0, Number(options.startTimeSec || 0));
      state.currentTimeSec = seekSec;
      if (seekSec > 0) {
        const applySeek = () => {
          try {
            audio.currentTime = seekSec;
          } catch {
            // تجاهل آمن قبل تحميل البيانات الوصفية
          }
          audio.removeEventListener?.('loadedmetadata', applySeek);
        };
        audio.addEventListener?.('loadedmetadata', applySeek, { once: true });
      }

      audio.src = url;
      audio.volume = 0;
      if (seekSec > 0 && Number(audio.readyState) >= 1) {
        try {
          audio.currentTime = seekSec;
        } catch {
          // تجاهل آمن
        }
      }

      try {
        await audio.play();
        state.isPlaying = true;
        state.isLoading = false;
        await smoothFadeVolume(state.targetVolume, 450);
        emitQuran();
        return { ok: true };
      } catch (err) {
        if (idx + 1 < resolved.urls.length && resolved.primaryType === 'stream') {
          return trySourceAtIndex(idx + 1);
        }
        state.isLoading = false;
        state.isPlaying = false;
        state.error = 'اضغط «تفعيل الصوت» من الشريط العلوي أو تحقق من الاتصال.';
        emitQuran();
        onBlocked?.(err?.message || state.error);
        return { ok: false, reason: state.error };
      }
    };

    return trySourceAtIndex(0);
  }

  async function pauseQuran(fadeMs = 250) {
    if (!quranEl) return;
    await smoothFadeVolume(0, fadeMs);
    try {
      quranEl.pause();
    } catch {
      // تجاهل آمن
    }
    state.isPlaying = false;
    onProgressPersist?.({
      surahNumber: state.surahNumber,
      currentTimeSec: Math.floor(state.currentTimeSec),
      mode: state.mode,
    });
    emitQuran();
  }

  async function resumeQuran() {
    if (!quranEl || !quranEl.src) {
      return playSurah(state.surahNumber, {
        mode: state.mode,
        startTimeSec: state.currentTimeSec,
        volume: state.targetVolume,
        isSleepSession: state.isSleepSession,
      });
    }
    try {
      quranEl.volume = 0;
      await quranEl.play();
      state.isPlaying = true;
      state.isInterrupted = false;
      await smoothFadeVolume(state.targetVolume, 450);
      emitQuran();
      return { ok: true };
    } catch {
      return { ok: false, reason: 'تعذر استئناف التلاوة' };
    }
  }

  function stopQuran() {
    clearFadeTimer();
    if (resumeAfterAlertTimer) {
      clearTimeout(resumeAfterAlertTimer);
      resumeAfterAlertTimer = null;
    }
    interruptedSnapshot = null;
    state.isInterrupted = false;
    state.sleepTimerEndsAtMs = null;
    state.isSleepSession = false;
    if (quranEl) {
      try {
        quranEl.pause();
        quranEl.removeAttribute('src');
        quranEl.load();
      } catch {
        // تجاهل آمن
      }
    }
    revokeObjectUrl();
    state.isPlaying = false;
    state.currentTimeSec = 0;
    emitQuran();
  }

  function setQuranVolume(vol) {
    state.targetVolume = Math.max(0.05, Math.min(1, Number(vol) || 0.75));
    if (quranEl && state.isPlaying && !state.isInterrupted) {
      quranEl.volume = state.targetVolume;
    }
    emitQuran();
  }

  function setSleepTimer(minutesFromNow, nowMs = Date.now(), fajrTargetMs = null) {
    if (minutesFromNow === 0 && fajrTargetMs && fajrTargetMs > nowMs) {
      state.sleepTimerEndsAtMs = fajrTargetMs;
    } else if (Number(minutesFromNow) > 0) {
      state.sleepTimerEndsAtMs = nowMs + Number(minutesFromNow) * 60000;
    } else {
      state.sleepTimerEndsAtMs = null;
    }
    emitQuran();
  }

  // محرك تنبيهات الأذان والمذاكرة وقيام الليل مع أولوية الصوت
  let transitioningAlert = false;
  const alertEngine = createAudioEngine({
    onStateChange: (next) => {
      onAlertStateChange?.(next);
      // عند توقف أو انتهاء صوت الأذان/التنبيه، نستأنف القرآن تلقائياً إن كان متوقفاً بسببه
      if (!transitioningAlert && !next.isPlaying && state.isInterrupted && interruptedSnapshot) {
        resumeIfInterrupted();
      }
    },
    onBlocked,
  });

  async function interruptForAlert(cueName, alertOptions = {}) {
    if (resumeAfterAlertTimer) {
      clearTimeout(resumeAfterAlertTimer);
      resumeAfterAlertTimer = null;
    }

    if (state.isPlaying && !state.isInterrupted) {
      interruptedSnapshot = {
        surahNumber: state.surahNumber,
        currentTimeSec: state.currentTimeSec,
        mode: state.mode,
        targetVolume: state.targetVolume,
        isSleepSession: state.isSleepSession,
      };
      state.isInterrupted = true;
      await pauseQuran(380);
    }

    transitioningAlert = true;
    let res;
    try {
      res = await alertEngine.playCue(cueName, alertOptions);
    } finally {
      transitioningAlert = false;
    }
    if (!res.ok && state.isInterrupted) {
      // في حال حُجب صوت التنبيه، نترك فرصة 6 ثوانٍ للعرض المرئي أو استئناف المستخدم بـ «تم الاطلاع»
      resumeAfterAlertTimer = setTimeout(() => {
        resumeIfInterrupted();
      }, 6000);
    }
    return res;
  }

  async function resumeIfInterrupted() {
    if (resumeAfterAlertTimer) {
      clearTimeout(resumeAfterAlertTimer);
      resumeAfterAlertTimer = null;
    }
    if (!state.isInterrupted || !interruptedSnapshot) return;
    const snap = interruptedSnapshot;
    interruptedSnapshot = null;
    state.isInterrupted = false;
    await playSurah(snap.surahNumber, {
      mode: snap.mode,
      startTimeSec: snap.currentTimeSec,
      volume: snap.targetVolume,
      isSleepSession: snap.isSleepSession,
      keepRepeatCount: true,
    });
  }

  function tick(nowMs = Date.now()) {
    if (!state.isPlaying || !state.sleepTimerEndsAtMs) return;
    const remMs = state.sleepTimerEndsAtMs - nowMs;
    if (remMs <= 0) {
      state.sleepTimerEndsAtMs = null;
      pauseQuran(600);
      return;
    }
    if (remMs <= 10000 && quranEl) {
      // خفض تدريجي في آخر ١٠ ثوانٍ من مؤقت النوم
      const ratio = Math.max(0, remMs / 10000);
      quranEl.volume = Math.max(0, state.targetVolume * ratio);
    }
  }

  function destroy() {
    stopQuran();
    alertEngine.stop();
  }

  return {
    getQuranState: () => ({ ...state }),
    getAlertStatus: () => alertEngine.getStatus(),
    unlockAndTestAlertAudio: (vol) => alertEngine.unlockAndTest(vol),
    playAlertCue: interruptForAlert,
    stopAlertAudio: () => {
      alertEngine.stop();
      resumeIfInterrupted();
    },
    toggleAlertMute: () => alertEngine.toggleMute(),
    onAlertAcknowledged: () => resumeIfInterrupted(),
    playSurah,
    pauseQuran,
    resumeQuran,
    stopQuran,
    togglePlayPause: () => (state.isPlaying ? pauseQuran(200) : resumeQuran()),
    nextSurah: () => {
      const settings = getSettings?.() || {};
      const qSettings = settings.quran || {};
      const next = getNextSurahInQueue({
        currentSurah: state.surahNumber,
        mode: state.mode,
        playlist: qSettings.playlist || [67, 32, 18, 2],
        playlistLoop: true,
        repeatRemaining: Infinity,
      });
      return playSurah(next.surahNumber, {
        mode: state.mode,
        startTimeSec: 0,
        volume: state.targetVolume,
        isSleepSession: state.isSleepSession,
      });
    },
    prevSurah: () => {
      const settings = getSettings?.() || {};
      const qSettings = settings.quran || {};
      const prev = getPrevSurahInQueue({
        currentSurah: state.surahNumber,
        mode: state.mode,
        playlist: qSettings.playlist || [67, 32, 18, 2],
      });
      return playSurah(prev, {
        mode: state.mode,
        startTimeSec: 0,
        volume: state.targetVolume,
        isSleepSession: state.isSleepSession,
      });
    },
    setQuranVolume,
    setSleepTimer,
    tick,
    destroy,
  };
}
