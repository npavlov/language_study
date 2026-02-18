/**
 * Word selection & randomization tests.
 *
 * Verifies that the GameEngine:
 * - Shuffles all playable entries into each session (Fisher-Yates)
 * - Produces different orderings across sessions
 * - Does not duplicate words within a session
 * - Handles edge cases (single-word pool, no playable entries)
 * - Supports filterIds for review sessions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../src/js/engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockEntries(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: `en-${String(i + 1).padStart(4, '0')}`,
    term: `word${i + 1}`,
    source_language: 'en',
    type: 'word',
    translations: {
      en: `word${i + 1}`,
      sr: `rec${i + 1}`,
      ru: `slovo${i + 1}`,
    },
    examples: { en: [], sr: [], ru: [] },
    explanation: null,
    pronunciation: null,
    category: null,
    tags: [],
    difficulty: overrides.difficulty ?? ((i % 5) + 1),
    enriched: true,
    metadata: { date_added: '2026-01-01', source_file: 'test', reviewed: false },
  }));
}

function getSelectedIds(engine) {
  return engine.session.words.map((w) => w.id);
}

// ---------------------------------------------------------------------------
// Shuffle tests
// ---------------------------------------------------------------------------

describe('Word selection — all entries, shuffled', () => {
  const POOL_SIZE = 100;
  let entries;

  beforeEach(() => {
    entries = makeMockEntries(POOL_SIZE);
  });

  it('selects all playable entries', () => {
    const engine = new GameEngine({ entries, direction: 'en-sr' });
    engine.startSession();
    expect(engine.session.words.length).toBe(POOL_SIZE);
  });

  it('does not repeat words within a single session', () => {
    const engine = new GameEngine({ entries, direction: 'en-sr' });
    engine.startSession();
    const ids = getSelectedIds(engine);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('produces different orderings across sessions', () => {
    const engine = new GameEngine({ entries, direction: 'en-sr' });

    const orderings = [];
    for (let i = 0; i < 10; i++) {
      engine.startSession();
      orderings.push(getSelectedIds(engine).join(','));
    }

    const uniqueOrderings = new Set(orderings);
    // 100 entries shuffled — virtually impossible to get the same order twice
    expect(uniqueOrderings.size).toBeGreaterThan(1);
  });

  it('does not always pick the same first word', () => {
    const engine = new GameEngine({ entries, direction: 'en-sr' });
    const firstWords = new Set();

    for (let i = 0; i < 20; i++) {
      engine.startSession();
      firstWords.add(engine.getCurrentWord().id);
    }

    expect(firstWords.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// filterIds tests
// ---------------------------------------------------------------------------

describe('Word selection — filterIds', () => {
  it('includes only entries matching filterIds', () => {
    const entries = makeMockEntries(50);
    const engine = new GameEngine({ entries, direction: 'en-sr' });
    const filterIds = [entries[0].id, entries[10].id, entries[20].id];

    engine.startSession(filterIds);
    const ids = getSelectedIds(engine);
    expect(ids.length).toBe(3);
    expect(new Set(ids)).toEqual(new Set(filterIds));
  });

  it('ignores filterIds that are not playable', () => {
    const entries = makeMockEntries(10);
    // Make entry 0 unplayable
    entries[0].translations.sr = null;
    entries[0].translations.ru = null;

    const engine = new GameEngine({ entries, direction: 'en-sr' });
    engine.startSession([entries[0].id, entries[1].id]);
    const ids = getSelectedIds(engine);
    expect(ids.length).toBe(1);
    expect(ids[0]).toBe(entries[1].id);
  });

  it('uses all playable entries when filterIds is undefined', () => {
    const entries = makeMockEntries(25);
    const engine = new GameEngine({ entries, direction: 'en-sr' });
    engine.startSession();
    expect(engine.session.words.length).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Word selection edge cases', () => {
  it('handles single-word pool', () => {
    const entries = makeMockEntries(1);
    const engine = new GameEngine({ entries, direction: 'en-sr' });
    engine.startSession();
    expect(engine.session.words.length).toBe(1);
  });

  it('throws when no playable entries exist', () => {
    const entries = makeMockEntries(5).map((e) => ({
      ...e,
      translations: { en: null, sr: null, ru: null },
    }));
    const engine = new GameEngine({ entries, direction: 'en-sr' });
    expect(() => engine.startSession()).toThrow('No playable entries');
  });

  it('filters out entries missing required translations', () => {
    const entries = makeMockEntries(10);
    for (let i = 0; i < 3; i++) {
      entries[i].translations.sr = null;
      entries[i].translations.ru = null;
    }
    const engine = new GameEngine({ entries, direction: 'en-sr' });
    const playable = engine.getPlayableEntries();
    expect(playable.length).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Session simulation (typing mode flow)
// ---------------------------------------------------------------------------

describe('Session simulation (typing mode flow)', () => {
  it('completes a full session cycling through all words', () => {
    const entries = makeMockEntries(30);
    const engine = new GameEngine({ entries, direction: 'en-sr' });

    engine.startSession();
    let wordsProcessed = 0;

    while (engine.getCurrentWord()) {
      const word = engine.getCurrentWord();
      engine.checkAnswer(word.translations.sr, 'sr');
      const next = engine.nextWord();
      wordsProcessed++;
      if (!next || next.score !== undefined) break;
    }

    expect(wordsProcessed).toBe(30);
  });

  it('wrong answers re-queue words, extending the session', () => {
    const entries = makeMockEntries(30);
    const engine = new GameEngine({ entries, direction: 'en-sr' });

    engine.startSession();
    const initialLength = engine.session.words.length;

    // Answer the first word wrong
    engine.checkAnswer('completely_wrong', 'sr');
    expect(engine.session.words.length).toBeGreaterThan(initialLength);
  });

  it('session ends with valid summary after all words', () => {
    const entries = makeMockEntries(10);
    const engine = new GameEngine({ entries, direction: 'en-sr' });

    engine.startSession();
    const total = engine.session.words.length;

    // Answer all words
    for (let i = 0; i < total; i++) {
      const word = engine.getCurrentWord();
      if (!word) break;
      engine.checkAnswer(word.translations.sr, 'sr');
      engine.nextWord();
    }

    // Session should have auto-ended or we end it
    const summary = engine.session ? engine.endSession() : null;
    if (summary) {
      expect(summary.totalAnswered).toBe(total);
      expect(summary.totalCorrect).toBe(total);
      expect(summary.accuracy).toBe(100);
    }
  });

  it('hint system works through the engine for typing mode', () => {
    const entries = makeMockEntries(10);
    const engine = new GameEngine({ entries, direction: 'en-sr' });

    engine.startSession();

    // First hint: sister language (Serbian)
    const hint1 = engine.getHint();
    expect(hint1.level).toBe(1);
    expect(hint1.lang).toBe('sr');

    // Second hint: Russian fallback
    const hint2 = engine.getHint();
    expect(hint2.level).toBe(2);
    expect(hint2.lang).toBe('ru');

    // No more engine-level hints
    const hint3 = engine.getHint();
    expect(hint3).toBeNull();
  });
});
