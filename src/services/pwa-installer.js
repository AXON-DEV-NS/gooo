/**
 * خدمة تثبيت التطبيق على شاشة التلفاز (PWA Installer & Permissions Manager).
 * تلتقط حدث التثبيت وتُهيئ صلاحيات التخزين الدائم وتشغيل الصوت وتوفر دليلاً مبسطاً لتلفاز توشيبا.
 */

export function detectStandaloneMode(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return false;
  try {
    if (win.navigator && win.navigator.standalone === true) {
      return true;
    }
    if (typeof win.matchMedia === 'function') {
      if (win.matchMedia('(display-mode: fullscreen)').matches) return true;
      if (win.matchMedia('(display-mode: standalone)').matches) return true;
    }
  } catch {
    // تجاهل آمن في البيئات المحدودة
  }
  return false;
}

export async function checkStoragePersisted(nav = typeof navigator !== 'undefined' ? navigator : null) {
  try {
    if (nav?.storage && typeof nav.storage.persisted === 'function') {
      return Boolean(await nav.storage.persisted());
    }
  } catch {
    // غير مدعوم أو مقيد
  }
  return false;
}

export async function requestPersistentStorage(nav = typeof navigator !== 'undefined' ? navigator : null) {
  try {
    if (nav?.storage && typeof nav.storage.persist === 'function') {
      return Boolean(await nav.storage.persist());
    }
  } catch {
    // تجاهل آمن
  }
  return false;
}

export async function resumeBrowserAudioContext(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return false;
  const AudioCtx = win.AudioContext || win.webkitAudioContext;
  if (!AudioCtx) return false;
  try {
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      await ctx.resume();
    }
    if (typeof ctx.close === 'function') {
      await ctx.close().catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

export function createPwaInstaller({ win = typeof window !== 'undefined' ? window : null, onStatusChange } = {}) {
  let deferredPrompt = null;
  let initialized = false;
  const status = {
    isStandalone: detectStandaloneMode(win),
    canPromptInstall: false,
    storagePersisted: false,
    checkingInstall: false,
    audioUnlocked: false,
    lastInstallOutcome: null,
  };

  function emitStatus() {
    if (typeof onStatusChange === 'function') {
      onStatusChange({ ...status });
    }
  }

  function handleBeforeInstallPrompt(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    deferredPrompt = event;
    status.canPromptInstall = true;
    emitStatus();
  }

  function handleAppInstalled() {
    deferredPrompt = null;
    status.canPromptInstall = false;
    status.isStandalone = true;
    status.lastInstallOutcome = 'accepted';
    emitStatus();
  }

  async function refreshStatus() {
    status.isStandalone = detectStandaloneMode(win);
    status.storagePersisted = await checkStoragePersisted(win?.navigator);
    emitStatus();
    return { ...status };
  }

  function init() {
    if (initialized || !win || typeof win.addEventListener !== 'function') {
      return;
    }
    initialized = true;
    win.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    win.addEventListener('appinstalled', handleAppInstalled);
    void refreshStatus();
  }

  function destroy() {
    if (!initialized || !win || typeof win.removeEventListener !== 'function') {
      return;
    }
    initialized = false;
    win.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    win.removeEventListener('appinstalled', handleAppInstalled);
  }

  async function installAndGrantPermissions({ unlockAudio, onToast, onShowTvGuide } = {}) {
    status.checkingInstall = true;
    emitStatus();

    try {
      const persisted = await requestPersistentStorage(win?.navigator);
      if (persisted) {
        status.storagePersisted = true;
      }

      if (typeof unlockAudio === 'function') {
        try {
          const ok = await unlockAudio();
          status.audioUnlocked = status.audioUnlocked || Boolean(ok);
        } catch {
          // نكمل بمحاولة فتح سياق الصوت المباشر
        }
      }
      const resumed = await resumeBrowserAudioContext(win);
      if (resumed) {
        status.audioUnlocked = true;
      }

      status.isStandalone = detectStandaloneMode(win) || status.lastInstallOutcome === 'accepted';

      if (status.isStandalone) {
        if (typeof onToast === 'function') {
          onToast('التطبيق مثبت ويعمل في الوضع المستقل ✓', 'info');
        }
        return { mode: 'already_installed', status: { ...status } };
      }

      if (deferredPrompt && typeof deferredPrompt.prompt === 'function') {
        const promptEvent = deferredPrompt;
        await promptEvent.prompt();
        const choice = await (promptEvent.userChoice || Promise.resolve({ outcome: 'dismissed' }));
        deferredPrompt = null;
        status.canPromptInstall = false;
        status.lastInstallOutcome = choice?.outcome || 'dismissed';

        if (choice?.outcome === 'accepted') {
          status.isStandalone = true;
          if (typeof onToast === 'function') {
            onToast('تم تثبيت تطبيق جووو على الشاشة الرئيسية بنجاح ✓', 'info');
          }
          return { mode: 'prompt_accepted', status: { ...status } };
        }

        if (typeof onToast === 'function') {
          onToast('تم حفظ الصلاحيات، ويمكنك التثبيت في أي وقت.', 'info');
        }
        return { mode: 'prompt_dismissed', status: { ...status } };
      }

      if (typeof onShowTvGuide === 'function') {
        onShowTvGuide();
      }
      return { mode: 'fallback_guide', status: { ...status } };
    } finally {
      status.checkingInstall = false;
      emitStatus();
    }
  }

  return {
    init,
    destroy,
    refreshStatus,
    getStatus: () => ({ ...status }),
    installAndGrantPermissions,
    setDeferredPromptForTest(mockPrompt) {
      deferredPrompt = mockPrompt;
      status.canPromptInstall = Boolean(mockPrompt);
      emitStatus();
    },
  };
}
