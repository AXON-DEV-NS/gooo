import { z } from 'zod';
import { SCHEMA_VERSION } from '../data/defaults.js';

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const hhmmSchema = z.string().regex(HHMM_REGEX, 'صيغة الوقت يجب أن تكون HH:MM');
export const dateKeySchema = z.string().regex(DATE_KEY_REGEX, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD');

export const TaskSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().min(1, 'عنوان المهمة مطلوب').max(140),
  category: z.string().trim().min(1).max(40).default('عام'),
  startTime: hhmmSchema,
  endTime: hhmmSchema,
  priority: z.enum(['عالية', 'متوسطة', 'عادية']).default('متوسطة'),
  status: z.enum(['pending', 'in_progress', 'completed']).default('pending'),
  createdAt: z.string().max(60),
  updatedAt: z.string().max(60),
});

export const HabitDaySchema = z.object({
  fajr: z.boolean().default(false),
  dhuhr: z.boolean().default(false),
  asr: z.boolean().default(false),
  maghrib: z.boolean().default(false),
  isha: z.boolean().default(false),
  quran: z.boolean().default(false),
  study: z.boolean().default(false),
  water: z.boolean().default(false),
  movement: z.boolean().default(false),
  updatedAt: z.string().max(60).optional(),
});

export const StudyBlockOverrideSchema = z.object({
  id: z.string().min(1).max(40),
  subject: z.string().trim().min(1).max(40),
  tag: z.string().trim().min(1).max(40),
  startTime: hhmmSchema,
  endTime: hhmmSchema,
  durationMinutes: z.number().int().min(10).max(120),
});

export const StudySettingsSchema = z.object({
  weeklyTargetHours: z.number().min(1).max(60).default(12),
  backlogTotalInitial: z.number().int().min(0).max(100).default(9),
  weakestSubject: z.enum(['عربي', 'برمجة', 'تاريخ', 'إنجليزي']).default('عربي'),
  autoShiftOnPrayer: z.boolean().default(true),
  prayerPauseBeforeMinutes: z.number().int().min(0).max(15).default(2),
  prayerResumeAfterMinutes: z.number().int().min(0).max(20).default(5),
  ramadanMode: z.enum(['auto', 'on', 'off']).default('auto'),
  ramadanWindow: z.enum(['after_taraweeh', 'before_fajr']).default('after_taraweeh'),
  customBlocksByDay: z.record(z.string().max(4), z.array(StudyBlockOverrideSchema)).default({}),
});

export const StudyProgressSchema = z.object({
  backlogRemaining: z.number().int().min(0).max(200).default(9),
  completedBlocksByDate: z.record(dateKeySchema, z.record(z.string().max(60), z.boolean())).default({}),
  swappedDates: z.record(dateKeySchema, z.boolean()).default({}),
  overrideShiftDates: z.record(dateKeySchema, z.boolean()).default({}),
  ramadanPromptDismissed: z.boolean().default(false),
});

export const FocusSessionSchema = z.object({
  id: z.string().min(1).max(80),
  dateKey: dateKeySchema,
  phase: z.enum(['focus', 'break']),
  durationMinutes: z.number().int().min(1).max(180),
  completedAt: z.string().max(60),
});

export const AlertLedgerEntrySchema = z.object({
  dateKey: dateKeySchema,
  status: z.enum(['shown', 'dismissed', 'completed']),
  updatedAt: z.string().max(60),
});

export const CustomEventSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  dateKey: dateKeySchema,
  category: z.string().trim().min(1).max(40).default('مناسبة شخصية'),
  isEstimated: z.boolean().default(false),
});

export const QuranSettingsSchema = z.object({
  mode: z.enum(['single', 'playlist', 'khatmah']).default('single'),
  selectedSurah: z.number().int().min(1).max(114).default(1),
  repeatMode: z.enum(['once', '3', '5', 'loop']).default('loop'),
  playlist: z.array(z.number().int().min(1).max(114)).max(114).default([67, 32, 18, 2]),
  playlistLoop: z.boolean().default(true),
  volume: z.number().min(0).max(1).default(0.75),
  autoPlayOnSleep: z.boolean().default(false),
  sleepMode: z.enum(['single', 'playlist', 'khatmah']).default('playlist'),
  sleepVolume: z.number().min(0).max(1).default(0.35),
  sleepTimerMinutes: z.number().int().min(0).max(480).default(30),
});

export const QiyamSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(['last_third', 'before_fajr']).default('last_third'),
  beforeFajrMinutes: z.number().int().min(10).max(180).default(45),
});

export const QuranProgressSchema = z.object({
  khatmahSurah: z.number().int().min(1).max(114).default(1),
  khatmahTimeSec: z.number().min(0).max(86400).default(0),
  lastSurah: z.number().int().min(1).max(114).default(1),
  lastTimeSec: z.number().min(0).max(86400).default(0),
  sleepTriggeredDates: z.record(dateKeySchema, z.boolean()).default({}),
});

export const ScreensaverSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  idleSeconds: z.number().int().min(10).max(1800).default(60),
  preset: z
    .enum([
      'royal_ruqah',
      'editorial_manuscript',
      'gallery_corner',
      'diwan_minimalist',
      'andalusian_frame',
    ])
    .default('royal_ruqah'),
  backgroundMode: z.enum(['auto_rotate', 'single', 'ambient']).default('auto_rotate'),
  selectedBackground: z.string().max(180).default(''),
  rotateIntervalMinutes: z.number().int().min(1).max(60).default(5),
  nightDimmingEnabled: z.boolean().default(true),
  antiBurnInEnabled: z.boolean().default(true),
});

export const SettingsSchema = z.object({
  location: z.object({
    city: z.string().trim().min(1).max(60),
    governorate: z.string().trim().min(1).max(60),
    country: z.string().trim().min(1).max(60),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    timezone: z.string().min(1).max(60),
  }),
  prayer: z.object({
    method: z.number().int().min(0).max(23),
    preAdhanMinutes: z.number().int().min(0).max(60),
    adhanAudioEnabled: z.boolean(),
    iqamaEnabled: z.boolean(),
    iqamaMinutes: z.object({
      fajr: z.number().int().min(0).max(60),
      dhuhr: z.number().int().min(0).max(60),
      asr: z.number().int().min(0).max(60),
      maghrib: z.number().int().min(0).max(60),
      isha: z.number().int().min(0).max(60),
    }),
    iqamaEnabledByPrayer: z.object({
      fajr: z.boolean(),
      dhuhr: z.boolean(),
      asr: z.boolean(),
      maghrib: z.boolean(),
      isha: z.boolean(),
    }),
  }),
  audio: z.object({
    soundEnabled: z.boolean(),
    volume: z.number().min(0).max(1),
    adhanTone: z.enum(['calm_chime', 'soft_bell', 'adhan_alert']),
  }),
  alerts: z.object({
    quietHoursEnabled: z.boolean(),
    quietStart: hhmmSchema,
    quietEnd: hhmmSchema,
    monThuEnabled: z.boolean(),
    monThuHour: z.number().int().min(12).max(23),
    whiteDaysEnabled: z.boolean(),
    whiteDaysHour: z.number().int().min(12).max(23),
    waterReminderEnabled: z.boolean(),
    waterIntervalMinutes: z.number().int().min(30).max(360),
    waterMaxDaily: z.number().int().min(1).max(12),
    movementReminderEnabled: z.boolean(),
    movementIntervalMinutes: z.number().int().min(30).max(360),
    sleepReminderEnabled: z.boolean(),
    sleepTime: hhmmSchema,
    sleepReminderMinutesBefore: z.number().int().min(5).max(120),
    phoneAwayTime: hhmmSchema.default('22:00'),
  }),
  focus: z.object({
    focusMinutes: z.number().int().min(5).max(120),
    breakMinutes: z.number().int().min(1).max(60),
    soundEnabled: z.boolean(),
  }),
  study: StudySettingsSchema.default({
    weeklyTargetHours: 12,
    backlogTotalInitial: 9,
    weakestSubject: 'عربي',
    autoShiftOnPrayer: true,
    prayerPauseBeforeMinutes: 2,
    prayerResumeAfterMinutes: 5,
    ramadanMode: 'auto',
    ramadanWindow: 'after_taraweeh',
    customBlocksByDay: {},
  }),
  habits: z.object({
    enableWater: z.boolean(),
    enableMovement: z.boolean(),
  }),
  calendar: z.object({
    hijriOffsetDays: z.number().int().min(-3).max(3),
  }),
  display: z.object({
    theme: z.enum(['light', 'night']),
    fontScale: z.enum(['normal', 'large']),
    showEducationalWords: z.boolean(),
    showWeather: z.boolean(),
  }),
  screensaver: ScreensaverSettingsSchema.default({
    enabled: true,
    idleSeconds: 60,
    preset: 'royal_ruqah',
    backgroundMode: 'auto_rotate',
    selectedBackground: '',
    rotateIntervalMinutes: 5,
    nightDimmingEnabled: true,
    antiBurnInEnabled: true,
  }),
  quran: QuranSettingsSchema.default({
    mode: 'single',
    selectedSurah: 1,
    repeatMode: 'loop',
    playlist: [67, 32, 18, 2],
    playlistLoop: true,
    volume: 0.75,
    autoPlayOnSleep: false,
    sleepMode: 'playlist',
    sleepVolume: 0.35,
    sleepTimerMinutes: 30,
  }),
  qiyam: QiyamSettingsSchema.default({
    enabled: false,
    mode: 'last_third',
    beforeFajrMinutes: 45,
  }),
});

export const AppStateSchema = z.object({
  schemaVersion: z.number().int().min(1).max(SCHEMA_VERSION + 10),
  settings: SettingsSchema,
  tasks: z.array(TaskSchema).max(200),
  habitsByDate: z.record(dateKeySchema, HabitDaySchema),
  studyProgress: StudyProgressSchema.default({
    backlogRemaining: 9,
    completedBlocksByDate: {},
    swappedDates: {},
    overrideShiftDates: {},
    ramadanPromptDismissed: false,
  }),
  quranProgress: QuranProgressSchema.default({
    khatmahSurah: 1,
    khatmahTimeSec: 0,
    lastSurah: 1,
    lastTimeSec: 0,
    sleepTriggeredDates: {},
  }),
  focusSessions: z.array(FocusSessionSchema).max(500),
  alertLedger: z.record(z.string().max(120), AlertLedgerEntrySchema),
  customEvents: z.array(CustomEventSchema).max(100),
});

export const BackupPayloadSchema = z.object({
  app: z.literal('jawoo'),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string().min(1).max(60),
  data: AppStateSchema.omit({ schemaVersion: true }),
});
