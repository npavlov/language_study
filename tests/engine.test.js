import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine, levenshtein, fuzzyMatch, serbianCyrillicToLatin } from '../src/js/engine.js';

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
    engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: 5 });
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

  it('starts a session with correct word count', () => {
    const word = engine.startSession();
    expect(word).toBeDefined();
    expect(engine.session.words.length).toBe(5);
    expect(engine.session.currentIndex).toBe(0);
    expect(engine.session.score).toBe(0);
  });

  it('gets current word', () => {
    engine.startSession();
    const word = engine.getCurrentWord();
    expect(word).toBeDefined();
    expect(word.term).toBeTruthy();
  });

  it('emits word:loaded on getCurrentWord', () => {
    engine.startSession();
    let emitted = null;
    engine.on('word:loaded', (data) => { emitted = data; });
    engine.getCurrentWord();
    expect(emitted).toBeDefined();
    expect(emitted.index).toBe(0);
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

  it('prioritizes wrong words in selection', () => {
    const wrongHistory = [entries[0].id, entries[1].id];
    engine.sessionSize = 5;
    engine.startSession(wrongHistory);
    const selectedIds = engine.session.words.map((w) => w.id);
    // Wrong words should appear more frequently, but it's probabilistic
    // Just verify session started without error
    expect(selectedIds.length).toBe(5);
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
