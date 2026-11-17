const WMO_AR_LABELS = {
  0: 'سماء صافية',
  1: 'صافية غالباً',
  2: 'غائمة جزئياً',
  3: 'غائمة',
  45: 'ضباب خفيف',
  48: 'ضباب متجمد',
  51: 'رذاذ خفيف',
  53: 'رذاذ متوسط',
  55: 'رذاذ كثيف',
  61: 'أمطار خفيفة',
  63: 'أمطار متوسطة',
  65: 'أمطار غزيرة',
  80: 'زخات مطر خفيفة',
  81: 'زخات مطر متوسطة',
  82: 'زخات مطر غزيرة',
  95: 'عواصف رعدية',
};

export function describeWeatherCodeAr(code) {
  return WMO_AR_LABELS[Number(code)] || 'أحوال جوية معتدلة';
}

export async function fetchWeatherForecast(location, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${encodeURIComponent(location.lat)}` +
      `&longitude=${encodeURIComponent(location.lng)}` +
      `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
      `&daily=temperature_2m_max,temperature_2m_min` +
      `&timezone=${encodeURIComponent(location.timezone || 'Africa/Cairo')}` +
      `&forecast_days=1`;

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const payload = await res.json();
    const cur = payload?.current;
    if (!cur || typeof cur.temperature_2m !== 'number' || !Number.isFinite(cur.temperature_2m)) {
      throw new Error('استجابة طقس غير مكتملة');
    }

    return {
      temperature: Math.round(cur.temperature_2m),
      humidity: Math.round(cur.relative_humidity_2m ?? 0),
      windSpeed: Math.round(cur.wind_speed_10m ?? 0),
      weatherCode: Number(cur.weather_code ?? 0),
      descriptionAr: describeWeatherCodeAr(cur.weather_code),
      tempMax: Math.round(payload?.daily?.temperature_2m_max?.[0] ?? cur.temperature_2m),
      tempMin: Math.round(payload?.daily?.temperature_2m_min?.[0] ?? cur.temperature_2m),
      locationLabel: `${location.city}، ${location.governorate}`,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function getWeatherSnapshot(cache, nowMs = Date.now()) {
  const cached = cache?.weather;
  if (!cached || !cached.fetchedAt) {
    return {
      available: false,
      isStale: true,
      data: null,
      statusText: 'الطقس غير متاح حالياً',
    };
  }
  const ageMinutes = (nowMs - new Date(cached.fetchedAt).getTime()) / 60000;
  const isStale = !Number.isFinite(ageMinutes) || ageMinutes > 180;
  const expiredBeyondSixHours = !Number.isFinite(ageMinutes) || ageMinutes > 360;
  return {
    available: true,
    isStale,
    expiredBeyondSixHours,
    ageMinutes: Number.isFinite(ageMinutes) ? Math.round(ageMinutes) : null,
    data: cached,
    statusText: expiredBeyondSixHours
      ? 'انتهت صلاحية الطقس المحفوظ (> ٦ ساعات)'
      : isStale
        ? 'بيانات طقس محفوظة (غير محدثة)'
        : 'محدث',
  };
}
