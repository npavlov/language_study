import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameEngine, levenshtein, fuzzyMatch, serbianCyrillicToLatin } from '../src/js/engine.js';
import * as settings from '../src/js/settings.js';

function makeMockEntries(count = 10) {
  return Array.from({ length: count }, (_, i) => ({
    id: `en-${String(i + 1).padStart(4, '0')}`,
    term: `word${i + 1}`,
    source_language: 'en',
    type: 'word',
    translations: {
      en: `word${i + 1}`,
      sr: `реч${i + 1}`,
      ru: `слово${i + 1}`,
    },
    examples: { en: [], sr: [], ru: [] },
    explanation: null,
    pronunciation: null,
    category: null,
    tags: [],
    difficulty: (i % 5) + 1,
    enriched: false,
    metadata: { date_added: '2026-01-01', source_file: 'test', reviewed: false },
  }));
}

describe('GameEngine', () => {
  let engine;
  let entries;

  beforeEach(() => {
    entries = makeMockEntries(10);
    engine = new GameEngine({ entries, direction: 'en-sr' });
  });

  it('creates with correct direction parsing', () => {
    expect(engine.targetLang).toBe('en');
    expect(engine.hintLang).toBe('sr');
    expect(engine.fallbackLang).toBe('ru');
  });

  it('filters playable entries', () => {
    const playable = engine.getPlayableEntries();
    expect(playable.length).toBe(10);
  });

  it('filters out entries without hint translations', () => {
    entries[0].translations.sr = null;
    entries[0].translations.ru = null;
    const playable = engine.getPlayableEntries();
    expect(playable.length).toBe(9);
  });

  it('starts a session with all playable words', () => {
    const word = engine.startSession();
    expect(word).toBeDefined();
    expect(engine.session.words.length).toBe(10);
    expect(engine.session.currentIndex).toBe(0);
    expect(engine.session.score).toBe(0);
  });

  it('gets current word', () => {
    engine.startSession();
    const word = engine.getCurrentWord();
    expect(word).toBeDefined();
    expect(word.term).toBeTruthy();
  });

  it('emits word:loaded on startSession and nextWord (not getCurrentWord)', () => {
    let emitted = null;
    engine.on('word:loaded', (data) => { emitted = data; });
    engine.startSession();
    expect(emitted).toBeDefined();
    expect(emitted.index).toBe(0);

    // getCurrentWord should NOT emit again
    emitted = null;
    engine.getCurrentWord();
    expect(emitted).toBeNull();

    // nextWord should emit
    engine.nextWord();
    expect(emitted).toBeDefined();
    expect(emitted.index).toBe(1);
  });

  it('returns hint level 1 (Serbian) on first getHint', () => {
    engine.startSession();
    const hint = engine.getHint();
    expect(hint).toBeDefined();
    expect(hint.level).toBe(1);
    expect(hint.lang).toBe('sr');
  });

  it('returns hint level 2 (Russian) on second getHint', () => {
    engine.startSession();
    engine.getHint(); // level 1
    const hint2 = engine.getHint(); // level 2
    expect(hint2).toBeDefined();
    expect(hint2.level).toBe(2);
    expect(hint2.lang).toBe('ru');
  });

  it('returns null on third getHint (no more hints)', () => {
    engine.startSession();
    engine.getHint();
    engine.getHint();
    const hint3 = engine.getHint();
    expect(hint3).toBeNull();
  });

  it('does not show Russian twice when sister language is missing', () => {
    // Create entry with no Serbian translation
    const noSrEntries = entries.map((e) => ({
      ...e,
      translations: { ...e.translations, sr: null },
    }));
    const noSrEngine = new GameEngine({ entries: noSrEntries, direction: 'en-sr' });
    noSrEngine.startSession();

    // First hint should be Russian fallback (since SR is missing)
    const hint1 = noSrEngine.getHint();
    expect(hint1).toBeDefined();
    expect(hint1.level).toBe(2);
    expect(hint1.lang).toBe('ru');

    // Second hint should be null — don't repeat Russian
    const hint2 = noSrEngine.getHint();
    expect(hint2).toBeNull();
  });

  it('checks correct answer', () => {
    engine.startSession();
    const word = engine.getCurrentWord();
    const result = engine.checkAnswer(word.translations.sr, 'sr');
    expect(result.correct).toBe(true);
  });

  it('checks wrong answer and re-queues word', () => {
    engine.startSession();
    const wordsBefore = engine.session.words.length;
    engine.checkAnswer('totally wrong', 'sr');
    expect(engine.session.wrongWords.length).toBe(1);
    expect(engine.session.words.length).toBeGreaterThanOrEqual(wordsBefore);
  });

  it('advances to next word', () => {
    engine.startSession();
    const first = engine.getCurrentWord();
    engine.nextWord();
    const second = engine.getCurrentWord();
    expect(second).not.toBe(first);
  });

  it('ends session with summary', () => {
    engine.startSession();
    const word = engine.getCurrentWord();
    engine.checkAnswer(word.translations.sr, 'sr');
    const summary = engine.endSession();
    expect(summary.score).toBeGreaterThan(0);
    expect(summary.totalAnswered).toBe(1);
    expect(summary.totalCorrect).toBe(1);
    expect(summary.accuracy).toBe(100);
  });

  it('emits session:ended on endSession', () => {
    engine.startSession();
    let emitted = null;
    engine.on('session:ended', (data) => { emitted = data; });
    engine.endSession();
    expect(emitted).toBeDefined();
    expect(emitted.score).toBeDefined();
  });

  it('tracks streak correctly', () => {
    engine.startSession();
    // Answer first 3 correctly
    for (let i = 0; i < 3; i++) {
      const word = engine.getCurrentWord();
      engine.checkAnswer(word.translations.sr, 'sr');
      engine.nextWord();
    }
    expect(engine.session.streak).toBe(3);

    // Answer wrong
    engine.checkAnswer('wrong', 'sr');
    expect(engine.session.streak).toBe(0);
    expect(engine.session.bestStreak).toBe(3);
  });

  it('filters to specific IDs when filterIds provided', () => {
    const filterIds = [entries[0].id, entries[1].id, entries[2].id];
    engine.startSession(filterIds);
    const selectedIds = engine.session.words.map((w) => w.id);
    expect(selectedIds.length).toBe(3);
    expect(new Set(selectedIds)).toEqual(new Set(filterIds));
  });
});

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('returns correct distance for single edit', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  it('returns correct distance for insertions', () => {
    expect(levenshtein('cat', 'cats')).toBe(1);
  });

  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });
});

describe('fuzzyMatch', () => {
  it('detects exact match', () => {
    const result = fuzzyMatch('hello', 'hello');
    expect(result.exact).toBe(true);
    expect(result.close).toBe(true);
  });

  it('detects close match within threshold', () => {
    const result = fuzzyMatch('helo', 'hello');
    expect(result.exact).toBe(false);
    expect(result.close).toBe(true);
  });

  it('rejects distant match', () => {
    const result = fuzzyMatch('xyz', 'hello');
    expect(result.close).toBe(false);
  });

  it('is case insensitive', () => {
    const result = fuzzyMatch('HELLO', 'hello');
    expect(result.exact).toBe(true);
  });
});

describe('serbianCyrillicToLatin', () => {
  it('transliterates basic Serbian Cyrillic', () => {
    expect(serbianCyrillicToLatin('београд')).toBe('beograd');
  });

  it('handles special characters', () => {
    expect(serbianCyrillicToLatin('ђ')).toBe('đ');
    expect(serbianCyrillicToLatin('љ')).toBe('lj');
    expect(serbianCyrillicToLatin('њ')).toBe('nj');
    expect(serbianCyrillicToLatin('ћ')).toBe('ć');
    expect(serbianCyrillicToLatin('џ')).toBe('dž');
    expect(serbianCyrillicToLatin('ш')).toBe('š');
  });

  it('preserves non-Cyrillic characters', () => {
    expect(serbianCyrillicToLatin('hello')).toBe('hello');
    expect(serbianCyrillicToLatin('123')).toBe('123');
  });
});

describe('Re-insert settings', () => {
  let engine;
  let entries;

  beforeEach(() => {
    entries = makeMockEntries(30);
    engine = new GameEngine({ entries, direction: 'en-sr' });
    vi.restoreAllMocks();
  });

  it('re-inserts wrong word at configured gap (default 10)', () => {
    vi.spyOn(settings, 'getSettings').mockReturnValue({
      reinsertEnabled: true,
      reinsertGap: 10,
    });

    engine.startSession();
    const firstWord = engine.getCurrentWord();

    // Answer wrong
    engine.checkAnswer('wrong_answer', 'sr');
    engine.nextWord();

    // The wrong word should be re-inserted 10 positions ahead
    // currentIndex was 0 when wrong, so reinsertAt = 0 + 10 = 10
    const reinsertedWord = engine.session.words[10];
    expect(reinsertedWord.id).toBe(firstWord.id);
  });

  it('does not re-insert when reinsertEnabled is false', () => {
    vi.spyOn(settings, 'getSettings').mockReturnValue({
      reinsertEnabled: false,
      reinsertGap: 10,
    });

    engine.startSession();
    const wordsBefore = engine.session.words.length;

    engine.checkAnswer('wrong_answer', 'sr');

    // Word count should not increase
    expect(engine.session.words.length).toBe(wordsBefore);
  });

  it('re-inserts at custom gap value', () => {
    vi.spyOn(settings, 'getSettings').mockReturnValue({
      reinsertEnabled: true,
      reinsertGap: 5,
    });

    engine.startSession();
    const firstWord = engine.getCurrentWord();

    engine.checkAnswer('wrong_answer', 'sr');

    // Should be at position 0 + 5 = 5
    expect(engine.session.words[5].id).toBe(firstWord.id);
  });

  it('re-inserts same word again if answered wrong a second time', () => {
    vi.spyOn(settings, 'getSettings').mockReturnValue({
      reinsertEnabled: true,
      reinsertGap: 3,
    });

    engine.startSession();
    const firstWord = engine.getCurrentWord();
    const originalLength = engine.session.words.length;

    // First wrong answer
    engine.checkAnswer('wrong', 'sr');
    expect(engine.session.words.length).toBe(originalLength + 1);

    // Advance to the re-inserted word (3 positions ahead)
    for (let i = 0; i < 3; i++) engine.nextWord();
    const reinserted = engine.getCurrentWord();
    expect(reinserted.id).toBe(firstWord.id);

    // Answer wrong again — should re-insert again
    const lengthBefore = engine.session.words.length;
    engine.checkAnswer('wrong_again', 'sr');
    expect(engine.session.words.length).toBe(lengthBefore + 1);
  });

  it('correct answer on re-inserted word does not re-insert it', () => {
    vi.spyOn(settings, 'getSettings').mockReturnValue({
      reinsertEnabled: true,
      reinsertGap: 3,
    });

    engine.startSession();
    const firstWord = engine.getCurrentWord();

    // Wrong answer triggers re-insert
    engine.checkAnswer('wrong', 'sr');

    // Advance to the re-inserted word
    for (let i = 0; i < 3; i++) engine.nextWord();
    const reinserted = engine.getCurrentWord();
    expect(reinserted.id).toBe(firstWord.id);

    // Correct answer — should not grow the queue further
    const lengthBefore = engine.session.words.length;
    engine.checkAnswer(reinserted.translations.sr, 'sr');
    expect(engine.session.words.length).toBe(lengthBefore);
  });

  it('wrong words tracked in wrongWords regardless of reinsert setting', () => {
    vi.spyOn(settings, 'getSettings').mockReturnValue({
      reinsertEnabled: false,
      reinsertGap: 10,
    });

    engine.startSession();
    engine.checkAnswer('wrong', 'sr');
    expect(engine.session.wrongWords.length).toBe(1);
  });
});
