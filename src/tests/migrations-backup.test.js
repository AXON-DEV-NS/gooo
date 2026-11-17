import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, createInitialState } from '../data/defaults.js';
import { exportBackupJson, mergeRestoredBackup, parseAndValidateBackup } from '../storage/backup.js';
import { migrateState } from '../storage/migrations.js';

describe('migrations and backup validation', () => {
  it('migrates legacy v0 state while preserving user tasks and habits', () => {
    const legacy = {
      // بدون schemaVersion ومع إعدادات ناقصة
      settings: {
        location: { city: 'القاهرة' },
      },
      tasks: [
        {
          id: 'custom-1',
          title: 'مراجعة الفيزياء',
          category: 'مذاكرة',
          startTime: '15:00',
          endTime: '16:00',
          priority: 'عالية',
          status: 'pending',
          createdAt: '2026-11-15T10:00:00Z',
          updatedAt: '2026-11-15T10:00:00Z',
        },
      ],
      habitsByDate: {
        '2026-11-15': { fajr: true, dhuhr: true, quran: true },
      },
    };

    const migrated = migrateState(legacy);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.settings.location.city).toBe('القاهرة');
    expect(migrated.settings.location.timezone).toBe('Africa/Cairo');
    expect(migrated.settings.focus.focusMinutes).toBe(45);
    expect(migrated.tasks).toHaveLength(1);
    expect(migrated.tasks[0].title).toBe('مراجعة الفيزياء');
    expect(migrated.habitsByDate['2026-11-15'].quran).toBe(true);
  });

  it('exports valid JSON backup and round-trips through strict Zod validation', () => {
    const initial = createInitialState('2026-11-16T10:00:00Z');
    initial.habitsByDate['2026-11-15'] = {
      fajr: true,
      dhuhr: true,
      asr: false,
      maghrib: true,
      isha: true,
      quran: true,
      study: true,
      water: true,
      movement: false,
    };

    const json = exportBackupJson(initial, '2026-11-16T12:00:00Z');
    const parsed = parseAndValidateBackup(json);
    expect(parsed.ok).toBe(true);
    expect(parsed.summary.tasksCount).toBe(initial.tasks.length);
    expect(parsed.summary.habitDaysCount).toBe(1);

    const merged = mergeRestoredBackup(initial, parsed);
    expect(merged.habitsByDate['2026-11-15'].quran).toBe(true);
  });

  it('rejects malformed or non-jawoo backup payloads cleanly', () => {
    expect(parseAndValidateBackup('')).toMatchObject({ ok: false });
    expect(parseAndValidateBackup('{not json')).toMatchObject({ ok: false });
    expect(parseAndValidateBackup(JSON.stringify({ app: 'other', data: {} }))).toMatchObject({ ok: false });

    const invalidTime = JSON.parse(exportBackupJson(createInitialState()));
    invalidTime.data.tasks[0].startTime = '99:99';
    const res = parseAndValidateBackup(JSON.stringify(invalidTime));
    expect(res.ok).toBe(false);
  });
});
