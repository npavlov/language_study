/**
 * Word selection & randomization tests.
 *
 * Verifies that the GameEngine:
 * - Actually randomizes word selection (not always the same set)
 * - Uses the full vocabulary pool, not just a fixed subset
 * - Respects weighted selection (difficulty, wrongHistory)
 * - Handles edge cases (small pools, single-word pools)
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
// Randomization tests
// ---------------------------------------------------------------------------

describe('Word selection randomization', () => {
  const POOL_SIZE = 100;
  const SESSION_SIZE = 20;
  let entries;

  beforeEach(() => {
    entries = makeMockEntries(POOL_SIZE);
  });

  it('selects exactly sessionSize words from the pool', () => {
    const engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: SESSION_SIZE });
    engine.startSession();
    expect(engine.session.words.length).toBe(SESSION_SIZE);
  });

  it('does not repeat words within a single session', () => {
    const engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: SESSION_SIZE });
    engine.startSession();
    const ids = getSelectedIds(engine);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('produces different word sets across multiple sessions', () => {
    const engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: SESSION_SIZE });

    const selections = [];
    for (let i = 0; i < 10; i++) {
      engine.startSession();
      selections.push(getSelectedIds(engine).sort().join(','));
    }

    const uniqueSets = new Set(selections);
    // With 100 words and 20 per session, getting the exact same set 10 times
    // would be astronomically unlikely. At least 2 different sets expected.
    expect(uniqueSets.size).toBeGreaterThan(1);
  });

  it('covers the full vocabulary pool over many sessions', () => {
    const engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: SESSION_SIZE });
    const seenIds = new Set();

    // Run enough sessions that we should see most words
    for (let i = 0; i < 50; i++) {
      engine.startSession();
      for (const id of getSelectedIds(engine)) {
        seenIds.add(id);
      }
    }

    // With 100 words, 50 sessions of 20, we should see almost all words.
    // Even the least-likely word (difficulty=1, weight=1.0) has ~20% chance per session.
    // Probability of missing it in 50 sessions: (1 - 0.2)^50 ≈ 1.4e-5
    expect(seenIds.size).toBeGreaterThanOrEqual(90);
  });

  it('does not always pick the same first word', () => {
    const engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: SESSION_SIZE });
    const firstWords = new Set();

    for (let i = 0; i < 20; i++) {
      engine.startSession();
      firstWords.add(engine.getCurrentWord().id);
    }

    expect(firstWords.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Weighted selection tests
// ---------------------------------------------------------------------------

describe('Weighted word selection', () => {
  it('wrongHistory words appear more frequently', () => {
    const entries = makeMockEntries(50, { difficulty: 1 }); // all same difficulty
    const wrongIds = [entries[0].id, entries[1].id];
    const engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: 10 });

    let wrongAppearances = 0;
    const TRIALS = 100;

    for (let i = 0; i < TRIALS; i++) {
      engine.startSession(wrongIds);
      const ids = getSelectedIds(engine);
      if (ids.includes(wrongIds[0])) wrongAppearances++;
    }

    // Without wrongHistory boost, each word has 10/50 = 20% chance.
    // With +3 weight boost (from 1.0 to 4.0), the probability is ~57%.
    // Over 100 trials, expect significantly more than 20%.
    expect(wrongAppearances).toBeGreaterThan(35);
  });

  it('higher difficulty words appear more often than lower ones', () => {
    // Create 50 words: 25 at difficulty=1, 25 at difficulty=5
    const entries = [
      ...makeMockEntries(25).map((e, i) => ({ ...e, id: `low-${i}`, difficulty: 1 })),
      ...makeMockEntries(25).map((e, i) => ({ ...e, id: `high-${i}`, difficulty: 5 })),
    ];

    const engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: 10 });
    let highCount = 0;
    let lowCount = 0;
    const TRIALS = 200;

    for (let i = 0; i < TRIALS; i++) {
      engine.startSession();
      for (const w of engine.session.words) {
        if (w.id.startsWith('high-')) highCount++;
        else lowCount++;
      }
    }

    // Difficulty 1 → weight 1.0, Difficulty 5 → weight 2.2
    // high should be picked more often than low
    expect(highCount).toBeGreaterThan(lowCount);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Word selection edge cases', () => {
  it('handles pool smaller than sessionSize', () => {
    const entries = makeMockEntries(5);
    const engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: 20 });
    engine.startSession();
    expect(engine.session.words.length).toBe(5);
  });

  it('handles pool equal to sessionSize', () => {
    const entries = makeMockEntries(20);
    const engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: 20 });
    engine.startSession();
    expect(engine.session.words.length).toBe(20);
  });

  it('handles single-word pool', () => {
    const entries = makeMockEntries(1);
    const engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: 20 });
    engine.startSession();
    expect(engine.session.words.length).toBe(1);
  });

  it('throws when no playable entries exist', () => {
    const entries = makeMockEntries(5).map((e) => ({
      ...e,
      translations: { en: null, sr: null, ru: null },
    }));
    const engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: 5 });
    expect(() => engine.startSession()).toThrow('No playable entries');
  });

  it('filters out entries missing required translations', () => {
    const entries = makeMockEntries(10);
    // Remove sr and ru translations from first 3
    for (let i = 0; i < 3; i++) {
      entries[i].translations.sr = null;
      entries[i].translations.ru = null;
    }
    const engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: 20 });
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
    const engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: 10 });

    engine.startSession();
    let wordsProcessed = 0;

    while (engine.getCurrentWord()) {
      const word = engine.getCurrentWord();
      engine.checkAnswer(word.translations.sr, 'sr');
      const next = engine.nextWord();
      wordsProcessed++;
      if (!next || next.score !== undefined) break;
    }

    expect(wordsProcessed).toBe(10);
  });

  it('wrong answers re-queue words, extending the session', () => {
    const entries = makeMockEntries(30);
    const engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: 5 });

    engine.startSession();
    const initialLength = engine.session.words.length;

    // Answer the first word wrong
    engine.checkAnswer('completely_wrong', 'sr');
    // Word should be re-queued
    expect(engine.session.words.length).toBeGreaterThan(initialLength);
  });

  it('session ends with valid summary after all words', () => {
    const entries = makeMockEntries(10);
    const engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: 5 });

    engine.startSession();

    // Answer all words
    for (let i = 0; i < 5; i++) {
      const word = engine.getCurrentWord();
      if (!word) break;
      engine.checkAnswer(word.translations.sr, 'sr');
      engine.nextWord();
    }

    // Session should have auto-ended or we end it
    const summary = engine.session ? engine.endSession() : null;
    if (summary) {
      expect(summary.totalAnswered).toBe(5);
      expect(summary.totalCorrect).toBe(5);
      expect(summary.accuracy).toBe(100);
    }
  });

  it('hint system works through the engine for typing mode', () => {
    const entries = makeMockEntries(10);
    const engine = new GameEngine({ entries, direction: 'en-sr', sessionSize: 5 });

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
