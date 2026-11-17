/**
 * خدمة مزامنة الوقت وحفظ معامل الانحراف (Time Drift Correction)
 * لمعالجة فقدان ساعة التلفاز لضبطها عند فصل الكهرباء أو انقطاع الإنترنت.
 */

export function validateDeviceClockSanity(timeDrift, deviceNowMs = Date.now()) {
  if (!timeDrift || !Number.isFinite(timeDrift.offsetMs)) {
    return { valid: true, offsetMs: 0 };
  }

  const offsetMs = Number(timeDrift.offsetMs || 0);
  const adjusted = deviceNowMs + offsetMs;

  // اكتشاف ضبط الساعة يدوياً بعد انحراف كبير أو رجوع الساعة للخلف
  if (
    timeDrift.lastAccurateNowMs &&
    adjusted < Number(timeDrift.lastAccurateNowMs) - 60000
  ) {
    return {
      valid: false,
      offsetMs: 0,
      reason: 'تم اكتشاف تغيير يدوي في ساعة الجهاز؛ أُعيد ضبط معامل الانحراف.',
    };
  }

  if (
    timeDrift.lastDeviceNowMs &&
    Number(timeDrift.lastDeviceNowMs) < 1600000000000 &&
    deviceNowMs > 1700000000000 &&
    Math.abs(offsetMs) > 3600000
  ) {
    return {
      valid: false,
      offsetMs: 0,
      reason: 'تم ضبط ساعة التلفاز يدوياً؛ جاري الاعتماد على الساعة الحالية لحين المزامنة.',
    };
  }

  return { valid: true, offsetMs };
}

export function getAccurateNowMs(timeDrift, deviceNowMs = Date.now()) {
  const sanity = validateDeviceClockSanity(timeDrift, deviceNowMs);
  return {
    nowMs: deviceNowMs + sanity.offsetMs,
    driftReset: !sanity.valid,
    reason: sanity.reason || null,
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 4500) {
  const controller = typeof globalThis !== 'undefined' && typeof globalThis.AbortController === 'function'
    ? new globalThis.AbortController()
    : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const fetchOpts = controller
      ? { ...options, signal: controller.signal, cache: 'no-store' }
      : { ...options, cache: 'no-store' };
    return await fetch(url, fetchOpts);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export function computeDriftFromServerTime(serverMs, reqStartMs, reqEndMs, source) {
  const rtt = Math.max(0, reqEndMs - reqStartMs);
  const estimatedServerNow = serverMs + Math.round(rtt / 2);
  let offsetMs = estimatedServerNow - reqEndMs;
  // تجاهل الفوارق الطفيفة أقل من ١٥ ثانية لتفادي التذبذب
  if (Math.abs(offsetMs) < 15000) {
    offsetMs = 0;
  }
  return {
    offsetMs,
    syncedAt: new Date(estimatedServerNow).toISOString(),
    lastDeviceNowMs: reqEndMs,
    lastAccurateNowMs: reqEndMs + offsetMs,
    source,
  };
}

export async function syncAccurateNetworkTime(timeoutMs = 4500) {
  // ١. محاولة worldtimeapi
  try {
    const t0 = Date.now();
    const res = await fetchWithTimeout('https://worldtimeapi.org/api/timezone/Africa/Cairo', {}, timeoutMs);
    const t1 = Date.now();
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.unixtime === 'number') {
        return computeDriftFromServerTime(data.unixtime * 1000, t0, t1, 'WorldTimeAPI');
      }
      const parsed = Date.parse(data?.datetime);
      if (Number.isFinite(parsed)) {
        return computeDriftFromServerTime(parsed, t0, t1, 'WorldTimeAPI');
      }
    }
  } catch {
    // الانتقال للمصدر التالي
  }

  // ٢. محاولة قراءة ترويسة Date من نفس الخادم المستضيف للتطبيق
  try {
    const t0 = Date.now();
    const res = await fetchWithTimeout('./manifest.json', { method: 'HEAD' }, timeoutMs);
    const t1 = Date.now();
    const dateHeader = res.headers?.get?.('date');
    const parsed = dateHeader ? Date.parse(dateHeader) : NaN;
    if (Number.isFinite(parsed)) {
      return computeDriftFromServerTime(parsed, t0, t1, 'ترويسة وقت الخادم');
    }
  } catch {
    // الانتقال للمصدر التالي
  }

  // ٣. محاولة timeapi.io عبر ترويسة Date أو utc
  try {
    const t0 = Date.now();
    const res = await fetchWithTimeout('https://timeapi.io/api/Time/current/zone?timeZone=UTC', {}, timeoutMs);
    const t1 = Date.now();
    if (res.ok) {
      const data = await res.json();
      const iso = data?.dateTime ? `${data.dateTime.replace(/Z$/, '')}Z` : null;
      const parsed = iso ? Date.parse(iso) : NaN;
      if (Number.isFinite(parsed)) {
        return computeDriftFromServerTime(parsed, t0, t1, 'TimeAPI');
      }
    }
  } catch {
    // فشل جميع المصادر
  }

  return null;
}
