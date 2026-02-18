// progress.js — user learning progress stored in localStorage
// Vanilla ES module, no framework dependencies.

const STORAGE_KEY = 'ls_progress';

const DEFAULT_PROGRESS = () => ({
  words: {},
  sessions: [],
  streakDays: 0,
  lastSessionDate: null,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayISO() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function computeMasteryLevel(total, correct) {
  if (total === 0) return 'new';
  const accuracy = correct / total;
  if (accuracy >= 0.85 && total >= 5) return 'mastered';
  if (accuracy >= 0.6) return 'known';
  return 'learning';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read and parse 'ls_progress' from localStorage.
 * Returns the default structure when the key is absent or the value is corrupt.
 *
 * @returns {{ words: Object, sessions: Array, streakDays: number, lastSessionDate: string|null }}
 */
export function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROGRESS();
    const parsed = JSON.parse(raw);
    // Merge with defaults so future fields are always present.
    return { ...DEFAULT_PROGRESS(), ...parsed };
  } catch {
    return DEFAULT_PROGRESS();
  }
}

/**
 * Serialize and write progress to localStorage.
 * Trims the sessions array to the last 30 entries before writing.
 *
 * @param {{ words: Object, sessions: Array, streakDays: number, lastSessionDate: string|null }} data
 */
export function saveProgress(data) {
  const toSave = {
    ...data,
    sessions: data.sessions.slice(-30),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

/**
 * Record a correct/incorrect attempt for a word and persist.
 *
 * Mastery levels:
 *   'new'      — 0 attempts
 *   'learning' — accuracy < 0.6
 *   'known'    — accuracy >= 0.6 and < 0.85
 *   'mastered' — accuracy >= 0.85 AND total >= 5
 *
 * @param {string}  wordId  - Unique word identifier
 * @param {boolean} correct - Whether the attempt was correct
 */
export function updateWordResult(wordId, correct) {
  const progress = loadProgress();

  const existing = progress.words[wordId] ?? { total: 0, correct: 0, lastSeen: null, masteryLevel: 'new' };

  const total   = existing.total + 1;
  const correctCount = existing.correct + (correct ? 1 : 0);

  progress.words[wordId] = {
    total,
    correct: correctCount,
    lastSeen: todayISO(),
    masteryLevel: computeMasteryLevel(total, correctCount),
  };

  saveProgress(progress);
}

/**
 * Append a session record, update the streak, and persist.
 *
 * @param {{ date?: string, score: number, total: number, durationSeconds: number, wordIds: string[] }} session
 */
export function recordSession(session) {
  const progress = loadProgress();
  const today = todayISO();

  // Build the session record (always stamp with today's date).
  const entry = {
    date: today,
    score: session.score,
    total: session.total,
    durationSeconds: session.durationSeconds,
    wordIds: session.wordIds ?? [],
  };

  progress.sessions.push(entry);

  // Update streak.
  if (progress.lastSessionDate === yesterdayISO()) {
    progress.streakDays += 1;
  } else if (progress.lastSessionDate === today) {
    // Already practiced today — streak unchanged.
  } else {
    // Gap of more than one day (or very first session).
    progress.streakDays = 1;
  }

  progress.lastSessionDate = today;

  // saveProgress trims sessions to 30.
  saveProgress(progress);
}

/**
 * Remove all saved progress from localStorage.
 */
export function resetProgress() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Return a JSON string of the raw localStorage value, suitable for a file download.
 *
 * @returns {string}
 */
export function exportProgress() {
  return localStorage.getItem(STORAGE_KEY) ?? JSON.stringify(DEFAULT_PROGRESS());
}
