// settings.js — global app settings stored in localStorage
// Vanilla ES module, no framework dependencies.

const STORAGE_KEY = 'ls_settings';

const DEFAULTS = {
  reinsertEnabled: true, // re-queue wrong words for spaced repetition
  reinsertGap: 10,       // how many words ahead to re-insert
};

/**
 * Read settings from localStorage, merged with defaults.
 * @returns {Object} current settings
 */
export function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Merge partial updates into current settings and persist.
 * @param {Object} patch — keys to update (e.g. { reinsertEnabled: false })
 * @returns {Object} updated settings
 */
export function updateSettings(patch) {
  const current = getSettings();
  const updated = { ...current, ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

/**
 * Reset all settings to defaults.
 * @returns {Object} default settings
 */
export function resetSettings() {
  localStorage.removeItem(STORAGE_KEY);
  return { ...DEFAULTS };
}
