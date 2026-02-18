/**
 * GameEngine — core game logic for vocabulary learning.
 *
 * Responsibilities:
 * - Load vocabulary JSON and filter by language direction
 * - Manage session state (score, streak, hints, words)
 * - Drive word selection (random, weighted by difficulty & errors)
 * - Implement two-tier hint system (sister language → Russian fallback)
 * - Emit events for UI decoupling
 */

import { EventEmitter } from './event-emitter.js';

/**
 * @typedef {'en'|'sr'|'ru'} Lang
 * @typedef {'en-sr'|'sr-en'} Direction  learning target - hint language
 */

export class GameEngine extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Array} options.entries - vocabulary entries
   * @param {string} options.direction - 'en-sr' (learn English, hint Serbian) or 'sr-en' (learn Serbian, hint English)
   * @param {number} [options.sessionSize=20] - words per session
   */
  constructor({ entries, direction = 'en-sr', sessionSize = 20 }) {
    super();
    this.allEntries = entries;
    this.direction = direction;
    this.sessionSize = sessionSize;

    // Derived from direction
    this.targetLang = direction.split('-')[0]; // language being learned
    this.hintLang = direction.split('-')[1];   // sister language for first hint
    this.fallbackLang = 'ru';                  // always Russian as final fallback

    this.session = null;
  }

  /**
   * Filter entries that have the required translations for this direction.
   */
  getPlayableEntries() {
    return this.allEntries.filter((entry) => {
      // Must have the target language term
      const hasTerm = entry.term && entry.term.length > 0;
      // Must have at least one translation to show
      const hasHint = entry.translations[this.hintLang] || entry.translations[this.fallbackLang];
      return hasTerm && hasHint;
    });
  }

  /**
   * Select words for a session with weighted randomness.
   * Prioritizes: words user got wrong > higher difficulty > random.
   */
  selectSessionWords(playable, wrongHistory = []) {
    const count = Math.min(this.sessionSize, playable.length);

    // Build weighted pool
    const weighted = playable.map((entry) => {
      let weight = 1;
      // Higher difficulty = slightly more likely
      weight += (entry.difficulty - 1) * 0.3;
      // Previously wrong = much more likely
      if (wrongHistory.includes(entry.id)) {
        weight += 3;
      }
      return { entry, weight };
    });

    // Weighted random selection without replacement
    const selected = [];
    const pool = [...weighted];

    for (let i = 0; i < count && pool.length > 0; i++) {
      const totalWeight = pool.reduce((sum, w) => sum + w.weight, 0);
      let rand = Math.random() * totalWeight;

      for (let j = 0; j < pool.length; j++) {
        rand -= pool[j].weight;
        if (rand <= 0) {
          selected.push(pool[j].entry);
          pool.splice(j, 1);
          break;
        }
      }
    }

    return selected;
  }

  /**
   * Start a new game session.
   * @param {string[]} [wrongHistory] - IDs of previously wrong words
   */
  startSession(wrongHistory = []) {
    const playable = this.getPlayableEntries();
    if (playable.length === 0) {
      throw new Error('No playable entries for this language direction');
    }

    const words = this.selectSessionWords(playable, wrongHistory);

    this.session = {
      words,
      currentIndex: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      hintsUsed: new Map(), // wordId → number of hints shown
      wrongWords: [],
      startTime: Date.now(),
      elapsedTime: 0,
      totalAnswered: 0,
      totalCorrect: 0,
    };

    this.emit('session:started', {
      totalWords: words.length,
      direction: this.direction,
    });

    return this.getCurrentWord();
  }

  /**
   * Get the current word in session.
   */
  getCurrentWord() {
    if (!this.session) return null;
    const { words, currentIndex } = this.session;
    if (currentIndex >= words.length) return null;

    const entry = words[currentIndex];
    this.emit('word:loaded', {
      index: currentIndex,
      total: words.length,
      term: entry.term,
      type: entry.type,
      id: entry.id,
    });

    return entry;
  }

  /**
   * Get hint for the current word.
   * First call → sister language hint, second call → Russian fallback.
   * @returns {{ level: number, text: string, lang: string } | null}
   */
  getHint() {
    if (!this.session) return null;
    const entry = this.getCurrentWord();
    if (!entry) return null;

    const currentHints = this.session.hintsUsed.get(entry.id) || 0;
    let hint = null;

    if (currentHints === 0) {
      // First hint: sister language
      const text = entry.translations[this.hintLang];
      if (text) {
        hint = { level: 1, text, lang: this.hintLang };
      } else {
        // Skip to fallback if sister language missing
        const fallbackText = entry.translations[this.fallbackLang];
        if (fallbackText) {
          hint = { level: 2, text: fallbackText, lang: this.fallbackLang };
        }
      }
    } else if (currentHints === 1) {
      // Second hint: Russian fallback
      const text = entry.translations[this.fallbackLang];
      if (text) {
        hint = { level: 2, text, lang: this.fallbackLang };
      }
    }
    // After level 2, no more hints

    if (hint) {
      this.session.hintsUsed.set(entry.id, currentHints + 1);
      this.emit('hint:revealed', { ...hint, wordId: entry.id });
    }

    return hint;
  }

  /**
   * Get all available translations for the current word (for answer display).
   */
  getAnswers() {
    const entry = this.getCurrentWord();
    if (!entry) return null;

    return {
      term: entry.term,
      translations: { ...entry.translations },
      examples: { ...entry.examples },
      explanation: entry.explanation,
    };
  }

  /**
   * Check an answer against the current word.
   * @param {string} answer - the user's answer
   * @param {string} [targetLang] - which translation to check against
   * @returns {{ correct: boolean, expected: string, hintsUsed: number }}
   */
  checkAnswer(answer, targetLang) {
    if (!this.session) return null;
    const entry = this.getCurrentWord();
    if (!entry) return null;

    const checkLang = targetLang || this.hintLang;
    const expected = entry.translations[checkLang] || entry.term;
    const hintsUsed = this.session.hintsUsed.get(entry.id) || 0;

    const correct = normalizeForComparison(answer) === normalizeForComparison(expected);

    this.session.totalAnswered++;

    if (correct) {
      this.session.totalCorrect++;
      this.session.streak++;
      if (this.session.streak > this.session.bestStreak) {
        this.session.bestStreak = this.session.streak;
      }

      // Score: base 10, bonus for no hints, streak multiplier
      let points = 10;
      if (hintsUsed === 0) points += 5;
      points *= Math.min(this.session.streak, 5); // cap multiplier at 5x
      this.session.score += points;

      this.emit('answer:correct', {
        wordId: entry.id,
        points,
        streak: this.session.streak,
        score: this.session.score,
      });
    } else {
      this.session.streak = 0;

      if (!this.session.wrongWords.includes(entry.id)) {
        this.session.wrongWords.push(entry.id);
      }

      // Re-queue wrong word a few positions ahead (spaced repetition within session)
      const reinsertAt = Math.min(
        this.session.currentIndex + 3,
        this.session.words.length
      );
      if (reinsertAt < this.session.words.length) {
        this.session.words.splice(reinsertAt, 0, entry);
      }

      this.emit('answer:wrong', {
        wordId: entry.id,
        expected,
        given: answer,
      });
    }

    return { correct, expected, hintsUsed };
  }

  /**
   * Advance to the next word.
   * @returns {Object|null} next word entry, or null if session is over
   */
  nextWord() {
    if (!this.session) return null;
    this.session.currentIndex++;

    if (this.session.currentIndex >= this.session.words.length) {
      return this.endSession();
    }

    return this.getCurrentWord();
  }

  /**
   * End the current session and return summary.
   */
  endSession() {
    if (!this.session) return null;

    this.session.elapsedTime = Date.now() - this.session.startTime;

    const summary = {
      score: this.session.score,
      totalWords: this.session.words.length,
      totalAnswered: this.session.totalAnswered,
      totalCorrect: this.session.totalCorrect,
      accuracy: this.session.totalAnswered > 0
        ? Math.round((this.session.totalCorrect / this.session.totalAnswered) * 100)
        : 0,
      bestStreak: this.session.bestStreak,
      wrongWords: [...this.session.wrongWords],
      elapsedTime: this.session.elapsedTime,
    };

    this.emit('session:ended', summary);
    this.session = null;

    return summary;
  }
}

/**
 * Normalize a string for answer comparison.
 */
function normalizeForComparison(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Compute Levenshtein distance between two strings.
 */
export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * Check if answer is "close enough" with fuzzy matching.
 */
export function fuzzyMatch(answer, expected, maxDistance = 2) {
  const a = normalizeForComparison(answer);
  const e = normalizeForComparison(expected);
  if (a === e) return { exact: true, close: true, distance: 0 };
  const dist = levenshtein(a, e);
  return { exact: false, close: dist <= maxDistance, distance: dist };
}

/**
 * Transliterate Serbian Cyrillic to Latin for comparison.
 */
const CYRILLIC_TO_LATIN = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'ђ': 'đ', 'е': 'e',
  'ж': 'ž', 'з': 'z', 'и': 'i', 'ј': 'j', 'к': 'k', 'л': 'l', 'љ': 'lj',
  'м': 'm', 'н': 'n', 'њ': 'nj', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's',
  'т': 't', 'ћ': 'ć', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'č',
  'џ': 'dž', 'ш': 'š',
};

export function serbianCyrillicToLatin(text) {
  return text
    .split('')
    .map((ch) => {
      const lower = ch.toLowerCase();
      const mapped = CYRILLIC_TO_LATIN[lower];
      if (!mapped) return ch;
      return ch === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
    })
    .join('');
}

/**
 * Load vocabulary from a JSON file URL.
 * @param {string} url - path to vocabulary JSON
 * @returns {Promise<Array>} vocabulary entries
 */
export async function loadVocabulary(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load vocabulary: ${response.status}`);
  const data = await response.json();
  return data.entries || [];
}
