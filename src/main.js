import '@fontsource/amiri/400.css';
import '@fontsource/amiri/700.css';
import '@fontsource/aref-ruqaa/400.css';
import '@fontsource/aref-ruqaa/700.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/reem-kufi/400.css';
import '@fontsource/reem-kufi/700.css';

import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/screensaver.css';

import { installRemoteNavigation, isRemoteBackEvent, isRemoteConfirmEvent } from './app/navigation.js';
import {
  captureUiFocusLock,
  assignFallbackFocusIds,
  restoreScrollPositions,
  restoreUiFocusLock,
} from './app/focus-lock.js';
import { createStore } from './app/state.js';
import { clearNode, el, patchElementInPlace } from './components/dom.js';
import { renderHeader } from './components/header.js';
import { renderModal } from './components/modal.js';
import { renderNavBar } from './components/nav-bar.js';
import { createScreensaverOverlay } from './components/screensaver-overlay.js';
import { renderToasts } from './components/toast.js';
import { renderContentPage } from './pages/content.js';
import { renderDiagnosticsPage } from './pages/diagnostics.js';
import { renderFocusPage } from './pages/focus.js';
import { renderHabitsPage } from './pages/habits.js';
import { renderHomePage } from './pages/home.js';
import { renderPrayerPage } from './pages/prayer.js';
import { renderQuranPage } from './pages/quran.js';
import { renderSettingsPage } from './pages/settings.js';
import { renderTasksPage } from './pages/tasks.js';
import { formatClock12Ar, formatDurationHMS, getZonedParts } from './services/clock.js';
import { createIdleDetector } from './services/idle-detector.js';
import { shouldInterruptScreensaverForAlert } from './services/screensaver.js';

const PAGE_RENDERERS = {
  home: renderHomePage,
  prayer: renderPrayerPage,
  study: renderTasksPage,
  tasks: renderTasksPage,
  focus: renderFocusPage,
  quran: renderQuranPage,
  habits: renderHabitsPage,
  content: renderContentPage,
  settings: renderSettingsPage,
  diagnostics: renderDiagnosticsPage,
};

function updateLiveNodes(snapshot) {
  const { appState, runtime } = snapshot;
  const tz = appState.settings.location.timezone || 'Africa/Cairo';
  const parts = getZonedParts(new Date(runtime.nowMs), tz);
  const clockStr = formatClock12Ar(parts.hour, parts.minute);

  document.querySelectorAll('[data-live-clock]').forEach((node) => {
    node.textContent = clockStr;
  });

  const remMs = runtime.prayerState?.nextPrayer?.remainingMs || 0;
  const countdownStr = `بقي ${formatDurationHMS(remMs, true)}`;
  document.querySelectorAll('[data-live-countdown]').forEach((node) => {
    node.textContent = countdownStr;
  });

  const iqama = runtime.prayerState?.activeIqama;
  if (iqama) {
    const iqStr = `إقامة ${iqama.label} (إعداد شخصي): بقي ${formatDurationHMS(iqama.remainingMs, true)}`;
    document.querySelectorAll('[data-live-iqama]').forEach((node) => {
      node.textContent = iqStr;
    });
  }

  const focusStr = formatDurationHMS(runtime.focus.remainingMs, true);
  document.querySelectorAll('[data-live-focus]').forEach((node) => {
    node.textContent = focusStr;
  });

  const focusBar = document.querySelector('[data-live-focus-bar]');
  if (focusBar) {
    const totalMs =
      (runtime.focus.totalDurationMs > 0
        ? runtime.focus.totalDurationMs
        : (runtime.focus.phase === 'focus'
            ? appState.settings.focus.focusMinutes
            : appState.settings.focus.breakMinutes) * 60000);
    const pct = totalMs > 0 ? Math.min(100, Math.max(0, Math.round(((totalMs - runtime.focus.remainingMs) / totalMs) * 100))) : 0;
    focusBar.style.width = `${pct}%`;
  }
}

export function mountApp(rootElement) {
  const store = createStore();
  const screensaverOverlay = createScreensaverOverlay(store);

  const initialSs = store.getSnapshot().appState.settings.screensaver || {};
  const idleDetector = createIdleDetector({
    enabled: initialSs.enabled !== false,
    idleSeconds: initialSs.idleSeconds || 60,
    canEnterIdle: () => {
      const snap = store.getSnapshot();
      if (snap.runtime.modal) return false;
      return !shouldInterruptScreensaverForAlert(snap.runtime.alertsState, snap.runtime.focus).interrupt;
    },
    onActiveKey: (event) => {
      const snap = store.getSnapshot();
      const q = snap.runtime.quranState;
      const isQuranActive = Boolean(q && (q.isPlaying || q.isSleepSession || q.isInterrupted));
      if (!isQuranActive) return false;

      if (isRemoteBackEvent(event)) {
        return false; // الخروج إلى اللوحة الرئيسية
      }
      if (isRemoteConfirmEvent(event)) {
        store.quranActions.togglePlayPause();
        return true;
      }
      if (event.key === 'ArrowLeft') {
        store.quranActions.nextSurah();
        return true;
      }
      if (event.key === 'ArrowRight') {
        store.quranActions.prevSurah();
        return true;
      }
      return false;
    },
    onEnterIdle: (reason) => {
      store.screensaverActions.enter(reason === 'preview');
    },
    onExitIdle: () => {
      screensaverOverlay.unmount();
      store.screensaverActions.exit();
    },
  });

  const remote = installRemoteNavigation({
    onBack: () => {
      store.goBack();
    },
    onKeyObserved: (keyInfo) => {
      store.recordObservedKey(keyInfo);
    },
  });

  function syncScreensaver(snapshot) {
    const ssSettings = snapshot.appState.settings.screensaver || {};
    idleDetector.updateConfig({
      enabled: ssSettings.enabled !== false,
      idleSeconds: ssSettings.idleSeconds || 60,
    });

    if (snapshot.runtime.screensaverActive) {
      if (!idleDetector.isActive()) {
        idleDetector.enterPreview();
      }
      screensaverOverlay.mount(snapshot);
    } else if (screensaverOverlay.isMounted()) {
      screensaverOverlay.unmount();
      if (idleDetector.isActive()) {
        idleDetector.exit('priority_or_settings');
      }
    }
  }

  let lastRenderedRoute = null;
  let preModalFocusLock = null;

  function syncOverlayLayer(container, selector, nextNode, insertBeforeSelector = null) {
    const existing = container.querySelector(`:scope > ${selector}`);
    if (!nextNode) {
      if (existing) existing.remove();
      return;
    }
    if (existing) {
      patchElementInPlace(existing, nextNode);
      return;
    }
    const anchor = insertBeforeSelector ? container.querySelector(`:scope > ${insertBeforeSelector}`) : null;
    container.insertBefore(nextNode, anchor || null);
  }

  function renderFull(snapshot) {
    const { runtime } = snapshot;
    const focusLock = captureUiFocusLock();
    const routeChanged = lastRenderedRoute !== null && lastRenderedRoute !== runtime.route;
    lastRenderedRoute = runtime.route;

    if (routeChanged) {
      preModalFocusLock = null;
    } else if (runtime.modal && !preModalFocusLock && focusLock?.focusId) {
      preModalFocusLock = focusLock;
    }

    const pageRenderer = PAGE_RENDERERS[runtime.route] || renderHomePage;
    const nextHeader = renderHeader(snapshot, store);
    const nextPage = pageRenderer(snapshot, store);
    const nextNav = renderNavBar(runtime.route, store);
    const nextShell = el(
      'div',
      { className: 'tv-shell' },
      nextHeader,
      el('main', { className: 'app-main', id: 'main-content' }, nextPage),
      nextNav
    );
    assignFallbackFocusIds(nextShell, runtime.route);

    const modalNode = renderModal(runtime.modal, store);
    const toastNode = renderToasts(runtime.toasts, store);
    const overscanGuide = runtime.overscanGuideVisible
      ? el('div', { className: 'overscan-frame', 'aria-hidden': 'true' })
      : null;

    if (modalNode) assignFallbackFocusIds(modalNode, 'modal');

    const existingShell = rootElement.querySelector(':scope > .tv-shell');
    if (!existingShell) {
      clearNode(rootElement);
      rootElement.appendChild(nextShell);
      if (toastNode) rootElement.appendChild(toastNode);
      if (modalNode) rootElement.appendChild(modalNode);
      if (overscanGuide) rootElement.appendChild(overscanGuide);
    } else {
      if (routeChanged) {
        const curHeader = existingShell.querySelector(':scope > .app-header');
        const curMain = existingShell.querySelector(':scope > #main-content');
        const curNav = existingShell.querySelector(':scope > .bottom-nav');
        if (curHeader) patchElementInPlace(curHeader, nextHeader);
        if (curMain) {
          const nextMain = nextShell.querySelector(':scope > #main-content');
          while (curMain.firstChild) curMain.removeChild(curMain.firstChild);
          if (nextMain?.firstChild) {
            curMain.appendChild(nextMain.firstChild);
          }
          assignFallbackFocusIds(curMain, runtime.route);
        }
        if (curNav) patchElementInPlace(curNav, nextNav);
      } else {
        patchElementInPlace(existingShell, nextShell);
      }

      syncOverlayLayer(rootElement, '.toast-container', toastNode, '.modal-backdrop, .overscan-frame');
      syncOverlayLayer(rootElement, '.modal-backdrop', modalNode, '.overscan-frame');
      syncOverlayLayer(rootElement, '.overscan-frame', overscanGuide, null);
    }

    const mainEl = document.getElementById('main-content');
    if (routeChanged && mainEl) {
      mainEl.scrollTop = 0;
    } else if (!routeChanged && preModalFocusLock && runtime.modal) {
      restoreScrollPositions(preModalFocusLock);
    }

    if (runtime.modal) {
      remote.ensureFocus();
      if (!routeChanged && preModalFocusLock) {
        restoreScrollPositions(preModalFocusLock);
      }
    } else if (!routeChanged && preModalFocusLock && restoreUiFocusLock(preModalFocusLock, remote)) {
      preModalFocusLock = null;
    } else if (!routeChanged && restoreUiFocusLock(focusLock, remote)) {
      preModalFocusLock = null;
    } else if (!routeChanged && focusLock?.routeAttr) {
      preModalFocusLock = null;
      remote.focusSelector(`.nav-item[data-route="${focusLock.routeAttr}"]`, { preventScroll: true });
      restoreScrollPositions(focusLock);
    } else {
      preModalFocusLock = null;
      remote.ensureFocus();
    }

    syncScreensaver(snapshot);
  }

  store.subscribe(renderFull);
  store.subscribeTick((snap) => {
    updateLiveNodes(snap);
    if (snap.runtime.screensaverActive && screensaverOverlay.isMounted()) {
      screensaverOverlay.update(snap);
    }
  });
  store.start();
  renderFull(store.getSnapshot());

  // تسجيل عامل الخدمة للتشغيل دون إنترنت في نسخة الإنتاج فقط
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // بعض متصفحات التلفاز لا تدعم Service Worker؛ التطبيق يستمر بالعمل بصورة طبيعية
    });
  }

  return {
    store,
    remote,
    idleDetector,
    screensaverOverlay,
    destroy() {
      idleDetector.destroy();
      screensaverOverlay.unmount();
      remote.destroy();
      store.destroy();
    },
  };
}

const appRoot = document.getElementById('app');
if (appRoot) {
  mountApp(appRoot);
}
