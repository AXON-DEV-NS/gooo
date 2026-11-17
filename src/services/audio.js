const CUE_FILES = {
  adhan: './audio/adhan-alert.wav',
  pre_adhan: './audio/soft-bell.wav',
  iqama: './audio/soft-bell.wav',
  soft: './audio/soft-bell.wav',
  focus: './audio/focus-bell.wav',
};

export function createAudioEngine({ onStateChange, onBlocked } = {}) {
  let activeElement = null;
  let activeContext = null;
  let activeStopTimer = null;

  const status = {
    sessionUnlocked: false,
    muted: false,
    isPlaying: false,
    lastError: null,
    lastTestAt: null,
  };

  function emit() {
    if (typeof onStateChange === 'function') {
      onStateChange({ ...status });
    }
  }

  function stop() {
    if (activeStopTimer) {
      clearTimeout(activeStopTimer);
      activeStopTimer = null;
    }
    if (activeElement) {
      try {
        activeElement.pause();
        activeElement.currentTime = 0;
      } catch {
        // تجاهل آمن عند إيقاف عنصر صوتي غير مهيأ
      }
      activeElement = null;
    }
    if (status.isPlaying) {
      status.isPlaying = false;
      emit();
    }
  }

  function setMuted(muted) {
    status.muted = Boolean(muted);
    if (status.muted) {
      stop();
    } else {
      emit();
    }
  }

  function toggleMute() {
    setMuted(!status.muted);
    return status.muted;
  }

  function playWebAudioChime(volume = 0.75, freqs = [523.25, 659.25]) {
    const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioCtx) {
      throw new Error('المتصفح لا يدعم Web Audio API');
    }
    if (!activeContext) {
      activeContext = new AudioCtx();
    }
    if (activeContext.state === 'suspended') {
      return activeContext.resume().then(() => triggerOscillator(activeContext, volume, freqs));
    }
    return triggerOscillator(activeContext, volume, freqs);
  }

  function triggerOscillator(ctx, volume, freqs) {
    const now = ctx.currentTime;
    const clampedVol = Math.max(0.05, Math.min(1, Number(volume) || 0.75));
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.25);
      gain.gain.setValueAtTime(0.001, now + idx * 0.25);
      gain.gain.exponentialRampToValueAtTime(clampedVol * 0.25, now + idx * 0.25 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.25 + 0.9);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.25);
      osc.stop(now + idx * 0.25 + 0.95);
    });
    status.isPlaying = true;
    emit();
    activeStopTimer = setTimeout(() => {
      status.isPlaying = false;
      emit();
    }, freqs.length * 300 + 800);
    return Promise.resolve();
  }

  async function unlockAndTest(volume = 0.75) {
    stop();
    status.lastError = null;
    try {
      const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (AudioCtx) {
        if (!activeContext) activeContext = new AudioCtx();
        if (activeContext.state === 'suspended') {
          await activeContext.resume();
        }
      }

      if (typeof globalThis.Audio !== 'undefined') {
        const audio = new globalThis.Audio('./audio/soft-bell.wav');
        audio.volume = Math.max(0, Math.min(1, Number(volume) || 0.75));
        activeElement = audio;
        audio.onended = () => {
          status.isPlaying = false;
          activeElement = null;
          emit();
        };
        await audio.play();
        status.isPlaying = true;
      } else {
        await playWebAudioChime(volume, [523.25, 659.25]);
      }

      status.sessionUnlocked = true;
      status.lastTestAt = new Date().toISOString();
      emit();
      return { ok: true };
    } catch (err) {
      // محاولة أخيرة عبر Web Audio في حال تعذر تحميل WAV
      try {
        await playWebAudioChime(volume, [523.25, 659.25]);
        status.sessionUnlocked = true;
        status.lastTestAt = new Date().toISOString();
        emit();
        return { ok: true };
      } catch (fallbackErr) {
        const reason = 'تعذر تشغيل الصوت في المتصفح (قد يتطلب سماحاً يدوياً أو جهاز صوت متصل).';
        status.sessionUnlocked = false;
        status.lastError = err?.message || fallbackErr?.message || reason;
        status.isPlaying = false;
        emit();
        return { ok: false, reason };
      }
    }
  }

  async function playCue(cueName, { volume = 0.75, soundEnabled = true, adhanTone = 'calm_chime' } = {}) {
    if (!soundEnabled || status.muted) {
      return { ok: false, skipped: true, reason: 'الصوت مكتوم أو معطل' };
    }

    stop();
    const file =
      cueName === 'adhan' && adhanTone === 'soft_bell'
        ? CUE_FILES.soft
        : CUE_FILES[cueName] || CUE_FILES.soft;

    try {
      if (typeof globalThis.Audio !== 'undefined') {
        const audio = new globalThis.Audio(file);
        audio.volume = Math.max(0, Math.min(1, Number(volume) || 0.75));
        activeElement = audio;
        audio.onended = () => {
          status.isPlaying = false;
          activeElement = null;
          emit();
        };
        audio.onerror = () => {
          status.isPlaying = false;
          activeElement = null;
          emit();
        };
        await audio.play();
        status.isPlaying = true;
        status.sessionUnlocked = true;
        status.lastError = null;
        emit();
        return { ok: true };
      }
      throw new Error('عنصر Audio غير متاح');
    } catch {
      // إذا كان الصوت مفعلاً بالجلسة نحاول نغمة Web Audio؛ وإلا نبلغ الواجهة لعرض التنبيه المرئي
      if (status.sessionUnlocked) {
        try {
          const freqs = cueName === 'adhan' ? [293.66, 369.99, 440, 587.33] : [523.25, 659.25];
          await playWebAudioChime(volume, freqs);
          status.lastError = null;
          return { ok: true };
        } catch {
          // يسقط للإبلاغ المرئي أدناه
        }
      }

      const reason = 'حظر المتصفح تشغيل الصوت التلقائي — اضغط «تفعيل الصوت» من الشريط العلوي.';
      status.lastError = reason;
      status.isPlaying = false;
      emit();
      if (typeof onBlocked === 'function') {
        onBlocked(reason);
      }
      return { ok: false, reason };
    }
  }

  return {
    getStatus: () => ({ ...status }),
    unlockAndTest,
    playCue,
    stop,
    setMuted,
    toggleMute,
  };
}
