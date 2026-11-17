export const SCHEMA_VERSION = 4;

export const APP_META = Object.freeze({
  name: 'جووو',
  version: '3.0.0',
  storageKey: 'jawoo_state_v1',
  diagnosticsDismissedKey: 'jawoo_tv_checked_v1',
});

export const PRAYER_IDS = ['fajr', 'shuruq', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const OBLIGATORY_PRAYER_IDS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export const PRAYER_LABELS = Object.freeze({
  fajr: 'الفجر',
  shuruq: 'الشروق',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
});

export const CALCULATION_METHODS = Object.freeze([
  { id: 5, name: 'الهيئة المصرية العامة للمساحة (الافتراضي)' },
  { id: 4, name: 'أم القرى — مكة المكرمة' },
  { id: 3, name: 'رابطة العالم الإسلامي' },
  { id: 2, name: 'الجمعية الإسلامية لأمريكا الشمالية (ISNA)' },
  { id: 1, name: 'جامعة العلوم الإسلامية — كراتشي' },
]);

export const LOCATION_PRESETS = Object.freeze([
  { id: 'faqus', label: 'فاقوس — الشرقية', city: 'فاقوس', governorate: 'الشرقية', country: 'مصر', lat: 30.7303, lng: 31.7936, timezone: 'Africa/Cairo' },
  { id: 'zagazig', label: 'الزقازيق — الشرقية', city: 'الزقازيق', governorate: 'الشرقية', country: 'مصر', lat: 30.5877, lng: 31.5020, timezone: 'Africa/Cairo' },
  { id: 'cairo', label: 'القاهرة', city: 'القاهرة', governorate: 'القاهرة', country: 'مصر', lat: 30.0444, lng: 31.2357, timezone: 'Africa/Cairo' },
  { id: 'alexandria', label: 'الإسكندرية', city: 'الإسكندرية', governorate: 'الإسكندرية', country: 'مصر', lat: 31.2001, lng: 29.9187, timezone: 'Africa/Cairo' },
  { id: 'mansoura', label: 'المنصورة — الدقهلية', city: 'المنصورة', governorate: 'الدقهلية', country: 'مصر', lat: 31.0409, lng: 31.3785, timezone: 'Africa/Cairo' },
]);

export function createDefaultSettings() {
  return {
    location: {
      city: 'فاقوس',
      governorate: 'الشرقية',
      country: 'مصر',
      lat: 30.7303,
      lng: 31.7936,
      timezone: 'Africa/Cairo',
    },
    prayer: {
      method: 5,
      preAdhanMinutes: 10,
      adhanAudioEnabled: true,
      iqamaEnabled: true,
      iqamaMinutes: {
        fajr: 20,
        dhuhr: 15,
        asr: 15,
        maghrib: 10,
        isha: 15,
      },
      iqamaEnabledByPrayer: {
        fajr: true,
        dhuhr: true,
        asr: true,
        maghrib: true,
        isha: true,
      },
    },
    audio: {
      soundEnabled: true,
      volume: 0.75,
      adhanTone: 'calm_chime',
    },
    alerts: {
      quietHoursEnabled: true,
      quietStart: '22:30',
      quietEnd: '04:00',
      monThuEnabled: true,
      monThuHour: 20,
      whiteDaysEnabled: true,
      whiteDaysHour: 20,
      waterReminderEnabled: true,
      waterIntervalMinutes: 90,
      waterMaxDaily: 6,
      movementReminderEnabled: false,
      movementIntervalMinutes: 120,
      sleepReminderEnabled: true,
      sleepTime: '22:30',
      sleepReminderMinutesBefore: 30,
      phoneAwayTime: '22:00',
    },
    focus: {
      focusMinutes: 45,
      breakMinutes: 10,
      soundEnabled: true,
    },
    study: {
      weeklyTargetHours: 12,
      backlogTotalInitial: 9,
      weakestSubject: 'عربي',
      autoShiftOnPrayer: true,
      prayerPauseBeforeMinutes: 2,
      prayerResumeAfterMinutes: 5,
      ramadanMode: 'auto', // 'auto' | 'on' | 'off'
      ramadanWindow: 'after_taraweeh', // 'after_taraweeh' | 'before_fajr'
      customBlocksByDay: {},
    },
    habits: {
      enableWater: true,
      enableMovement: true,
    },
    calendar: {
      hijriOffsetDays: 0,
    },
    display: {
      theme: 'light',
      fontScale: 'normal',
      showEducationalWords: true,
      showWeather: true,
    },
    screensaver: {
      enabled: true,
      idleSeconds: 60,
      preset: 'royal_ruqah',
      backgroundMode: 'auto_rotate', // 'auto_rotate' | 'single' | 'ambient'
      selectedBackground: '',
      rotateIntervalMinutes: 5,
      nightDimmingEnabled: true,
      antiBurnInEnabled: true,
    },
    quran: {
      mode: 'single', // 'single' | 'playlist' | 'khatmah'
      selectedSurah: 1,
      repeatMode: 'loop', // 'once' | '3' | '5' | 'loop'
      playlist: [67, 32, 18, 2],
      playlistLoop: true,
      volume: 0.75,
      autoPlayOnSleep: false,
      sleepMode: 'playlist', // 'single' | 'playlist' | 'khatmah'
      sleepVolume: 0.35,
      sleepTimerMinutes: 30, // 15 | 30 | 45 | 60 | 0 (until Fajr)
    },
    qiyam: {
      enabled: false,
      mode: 'last_third', // 'last_third' | 'before_fajr'
      beforeFajrMinutes: 45, // 30 | 45 | 60
    },
  };
}

export function createDefaultTasks(nowIso = new Date().toISOString()) {
  return [
    {
      id: 'task-morning-study',
      title: 'مراجعة المادة الأساسية وحل تطبيق عملي',
      category: 'مذاكرة',
      startTime: '16:00',
      endTime: '17:30',
      priority: 'عالية',
      status: 'in_progress',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'task-quran-wird',
      title: 'ورد القرآن اليومي وتدبر آية اليوم',
      category: 'ورد',
      startTime: '18:00',
      endTime: '18:30',
      priority: 'عالية',
      status: 'pending',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'task-prep-tomorrow',
      title: 'تجهيز جدول ومهام الغد قبل النوم',
      category: 'تنظيم',
      startTime: '21:30',
      endTime: '21:50',
      priority: 'متوسطة',
      status: 'pending',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];
}

export function createDefaultStudyProgress() {
  return {
    backlogRemaining: 9,
    completedBlocksByDate: {},
    swappedDates: {},
    overrideShiftDates: {},
    ramadanPromptDismissed: false,
  };
}

export function createDefaultQuranProgress() {
  return {
    khatmahSurah: 1,
    khatmahTimeSec: 0,
    lastSurah: 1,
    lastTimeSec: 0,
    sleepTriggeredDates: {},
  };
}

export function createInitialState(nowIso = new Date().toISOString()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: createDefaultSettings(),
    tasks: createDefaultTasks(nowIso),
    habitsByDate: {},
    studyProgress: createDefaultStudyProgress(),
    quranProgress: createDefaultQuranProgress(),
    focusSessions: [],
    alertLedger: {},
    customEvents: [],
    cache: {
      prayerMonths: {},
      weather: null,
      timeDrift: {
        offsetMs: 0,
        syncedAt: null,
        lastDeviceNowMs: null,
        lastAccurateNowMs: null,
        source: null,
      },
    },
    systemLog: [],
  };
}
