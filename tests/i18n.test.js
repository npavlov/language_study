import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock localStorage before importing i18n
const store = {};
const localStorageMock = {
  getItem: vi.fn((key) => store[key] ?? null),
  setItem: vi.fn((key, value) => { store[key] = value; }),
  removeItem: vi.fn((key) => { delete store[key]; }),
};
vi.stubGlobal('localStorage', localStorageMock);

describe('i18n — default (Russian)', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const k of Object.keys(store)) delete store[k];
  });

  it('exports t with Russian strings when no settings exist', async () => {
    const { t, uiLang } = await import('../src/js/i18n.js');
    expect(uiLang).toBe('ru');
    expect(t.back_to_menu).toBe('В меню');
    expect(t.start).toBe('Начать');
  });

  it('langLabel returns localized language names', async () => {
    const { langLabel } = await import('../src/js/i18n.js');
    expect(langLabel('en')).toBe('Английский');
    expect(langLabel('sr')).toBe('Сербский');
    expect(langLabel('ru')).toBe('Русский');
    expect(langLabel('fr')).toBe('FR');
  });

  it('fmt replaces placeholders', async () => {
    const { fmt } = await import('../src/js/i18n.js');
    const result = fmt('already_exists', { term: 'hello' });
    expect(result).toBe('«hello» уже есть в словаре.');
  });

  it('fmt returns key when key is missing', async () => {
    const { fmt } = await import('../src/js/i18n.js');
    expect(fmt('nonexistent_key', { x: 1 })).toBe('nonexistent_key');
  });

  it('fmtDate formats ISO date with Russian months', async () => {
    const { fmtDate } = await import('../src/js/i18n.js');
    expect(fmtDate('2026-02-19')).toBe('19 Фев 2026');
    expect(fmtDate('2026-12-01')).toBe('1 Дек 2026');
    expect(fmtDate(null)).toBe('—');
  });

  it('fmtDuration formats seconds with Russian units', async () => {
    const { fmtDuration } = await import('../src/js/i18n.js');
    expect(fmtDuration(90)).toBe('1м 30с');
    expect(fmtDuration(45)).toBe('45с');
    expect(fmtDuration(0)).toBe('—');
  });

  it('t.months is a 12-element array', async () => {
    const { t } = await import('../src/js/i18n.js');
    expect(t.months).toHaveLength(12);
    expect(t.months[0]).toBe('Янв');
    expect(t.months[11]).toBe('Дек');
  });
});

describe('i18n — English', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const k of Object.keys(store)) delete store[k];
    store.ls_settings = JSON.stringify({ uiLanguage: 'en' });
  });

  it('exports English strings when uiLanguage is en', async () => {
    const { t, uiLang } = await import('../src/js/i18n.js');
    expect(uiLang).toBe('en');
    expect(t.back_to_menu).toBe('Menu');
    expect(t.start).toBe('Start');
    expect(t.session_complete).toBe('Session complete!');
  });

  it('langLabel returns English language names', async () => {
    const { langLabel } = await import('../src/js/i18n.js');
    expect(langLabel('en')).toBe('English');
    expect(langLabel('sr')).toBe('Serbian');
    expect(langLabel('ru')).toBe('Russian');
  });

  it('fmt works with English templates', async () => {
    const { fmt } = await import('../src/js/i18n.js');
    expect(fmt('word_added', { term: 'test' })).toBe('"test" added.');
  });

  it('fmtDate uses English month names', async () => {
    const { fmtDate } = await import('../src/js/i18n.js');
    expect(fmtDate('2026-02-19')).toBe('19 Feb 2026');
  });

  it('fmtDuration uses English time units', async () => {
    const { fmtDuration } = await import('../src/js/i18n.js');
    expect(fmtDuration(90)).toBe('1m 30s');
  });
});

describe('i18n — Serbian', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const k of Object.keys(store)) delete store[k];
    store.ls_settings = JSON.stringify({ uiLanguage: 'sr' });
  });

  it('exports Serbian strings when uiLanguage is sr', async () => {
    const { t, uiLang } = await import('../src/js/i18n.js');
    expect(uiLang).toBe('sr');
    expect(t.back_to_menu).toBe('Meni');
    expect(t.start).toBe('Počni');
    expect(t.session_complete).toBe('Sesija završena!');
  });

  it('langLabel returns Serbian language names', async () => {
    const { langLabel } = await import('../src/js/i18n.js');
    expect(langLabel('en')).toBe('Engleski');
    expect(langLabel('sr')).toBe('Srpski');
    expect(langLabel('ru')).toBe('Ruski');
  });

  it('fmt works with Serbian templates', async () => {
    const { fmt } = await import('../src/js/i18n.js');
    expect(fmt('delete_confirm', { term: 'reč' })).toBe('Obrisati „reč"?');
  });

  it('months has Serbian month names', async () => {
    const { t } = await import('../src/js/i18n.js');
    expect(t.months[4]).toBe('Maj');
    expect(t.months[7]).toBe('Avg');
  });
});

describe('i18n — fallback to Russian', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const k of Object.keys(store)) delete store[k];
  });

  it('falls back to ru for invalid uiLanguage', async () => {
    store.ls_settings = JSON.stringify({ uiLanguage: 'xx' });
    const { uiLang } = await import('../src/js/i18n.js');
    expect(uiLang).toBe('ru');
  });

  it('falls back to ru for malformed settings JSON', async () => {
    store.ls_settings = 'not-json';
    const { uiLang } = await import('../src/js/i18n.js');
    expect(uiLang).toBe('ru');
  });
});

describe('i18n — translation completeness', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const k of Object.keys(store)) delete store[k];
  });

  it('EN and SR have all the same keys as RU', async () => {
    // Load RU first to get all keys
    const { t: ruT } = await import('../src/js/i18n.js');
    const ruKeys = Object.keys(ruT);

    // Load EN
    vi.resetModules();
    store.ls_settings = JSON.stringify({ uiLanguage: 'en' });
    const { t: enT } = await import('../src/js/i18n.js');
    const enKeys = Object.keys(enT);

    // Load SR
    vi.resetModules();
    store.ls_settings = JSON.stringify({ uiLanguage: 'sr' });
    const { t: srT } = await import('../src/js/i18n.js');
    const srKeys = Object.keys(srT);

    const missingInEn = ruKeys.filter(k => !enKeys.includes(k));
    const missingInSr = ruKeys.filter(k => !srKeys.includes(k));

    expect(missingInEn).toEqual([]);
    expect(missingInSr).toEqual([]);
  });
});
