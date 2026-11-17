/**
 * كاشف الخمول والتحكم بالاستيقاظ بالريموت لشاشة التوقف.
 * يستهلك الضغطة الأولى بالريموت (preventDefault + stopImmediatePropagation)
 * لمنع تنفيذ أمر غير مقصود عند العودة للوحة الرئيسية.
 */
export function createIdleDetector({
  idleSeconds = 60,
  enabled = true,
  canEnterIdle = () => true,
  onActiveKey = null,
  onEnterIdle,
  onExitIdle,
}) {
  let active = false;
  let isEnabled = Boolean(enabled);
  let timeoutMs = Math.max(10, Number(idleSeconds) || 60) * 1000;
  let timerId = null;
  let lastMovePing = 0;
  let enteredAtMs = 0;

  function clearIdleTimer() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function scheduleIdleTimer() {
    clearIdleTimer();
    if (!isEnabled || active) return;
    timerId = setTimeout(() => {
      if (!isEnabled || active) return;
      if (typeof canEnterIdle === 'function' && !canEnterIdle()) {
        scheduleIdleTimer();
        return;
      }
      enter('inactivity');
    }, timeoutMs);
  }

  function enter(reason = 'inactivity') {
    if (active) return;
    active = true;
    enteredAtMs = Date.now();
    clearIdleTimer();
    if (typeof onEnterIdle === 'function') {
      onEnterIdle(reason);
    }
  }

  function exit(reason = 'user_input') {
    if (!active) {
      scheduleIdleTimer();
      return;
    }
    active = false;
    if (typeof onExitIdle === 'function') {
      onExitIdle(reason);
    }
    scheduleIdleTimer();
  }

  function handleInteractionCapture(event) {
    if (active) {
      if (event.type === 'mousemove' && Date.now() - enteredAtMs < 400) {
        return;
      }
      // استهلاك الضغطة الأولى بالريموت أو اللمس بالكامل لمنع تفعيل عناصر اللوحة خلف الشاشة
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();

      if (event.type === 'keydown' && typeof onActiveKey === 'function') {
        const handledInsideScreensaver = onActiveKey(event);
        if (handledInsideScreensaver) {
          return;
        }
      }
      exit('user_input');
      return;
    }

    if (event.type === 'mousemove') {
      const now = Date.now();
      if (now - lastMovePing < 800) return;
      lastMovePing = now;
    }
    scheduleIdleTimer();
  }

  const events = ['keydown', 'mousedown', 'touchstart', 'wheel', 'mousemove'];

  function attach() {
    if (typeof document === 'undefined') return;
    for (const evt of events) {
      document.addEventListener(evt, handleInteractionCapture, { capture: true });
    }
    scheduleIdleTimer();
  }

  function destroy() {
    clearIdleTimer();
    if (typeof document === 'undefined') return;
    for (const evt of events) {
      document.removeEventListener(evt, handleInteractionCapture, { capture: true });
    }
  }

  function updateConfig({ enabled: nextEnabled, idleSeconds: nextSeconds }) {
    if (typeof nextEnabled === 'boolean') {
      isEnabled = nextEnabled;
    }
    if (Number.isFinite(Number(nextSeconds))) {
      timeoutMs = Math.max(10, Number(nextSeconds)) * 1000;
    }
    if (!isEnabled && active) {
      exit('disabled');
    } else {
      scheduleIdleTimer();
    }
  }

  attach();

  return {
    isActive: () => active,
    enterPreview: () => enter('preview'),
    exit,
    resetActivity: () => scheduleIdleTimer(),
    updateConfig,
    destroy,
  };
}
