/**
 * Main menu screen — language selector, game mode picker, quick stats.
 */

import { loadProgress } from '../progress.js';
import { getSettings, updateSettings } from '../settings.js';
import { t, langLabel } from '../i18n.js';

export class MenuScreen {
  constructor() {
    this._root = null;
    this._refs = {};
    this._selectedDirection = 'en-sr';
    this._selectedMode = 'flashcards';
    this._onStart = null;
    this._onExport = null;
    this._wordCounts = { en: 0, sr: 0 };
  }

  /**
   * @param {HTMLElement} container
   * @param {Object} options
   * @param {number} options.wordCount - total available words
   * @param {function} options.onStart - callback({direction, mode})
   */
  init(container, { wordCounts = { en: 0, sr: 0 }, onStart = () => {}, onExport = () => {} } = {}) {
    this._container = container;
    this._wordCounts = wordCounts;
    this._onStart = onStart;
    this._onExport = onExport;
    this._build();
  }

  show() {
    if (this._container) {
      this._container.classList.add('screen--active');
      this._updateStats();
      this._updateWordCount();
    }
  }

  hide() {
    if (this._container) {
      this._container.classList.remove('screen--active');
    }
  }

  setWordCounts(counts) {
    this._wordCounts = counts;
    this._updateWordCount();
  }

  setLoading(isLoading) {
    if (this._refs.startBtn) {
      this._refs.startBtn.disabled = isLoading;
      this._refs.startBtn.textContent = isLoading ? t.loading : t.start;
    }
  }

  destroy() {
    if (this._root) {
      this._root.remove();
      this._root = null;
    }
  }

  _build() {
    const root = el('div', 'menu');
    root.id = 'menu-content';

    // --- Header / Title ---
    const header = el('div', 'menu__header');
    header.appendChild(el('h1', 'menu__title', '📚 Language Study'));
    header.appendChild(el('p', 'menu__subtitle', t.app_subtitle));
    root.appendChild(header);

    // --- Language Direction Toggle ---
    const dirSection = el('div', 'menu__section');
    dirSection.appendChild(el('label', 'form-group__label', t.direction_label));
    const toggle = el('div', 'toggle');

    const btnEn = el('button', 'toggle__option toggle__option--active', `🇬🇧 ${langLabel('en')}`);
    btnEn.dataset.direction = 'en-sr';
    btnEn.type = 'button';

    const btnSr = el('button', 'toggle__option', `🇷🇸 ${langLabel('sr')}`);
    btnSr.dataset.direction = 'sr-en';
    btnSr.type = 'button';

    toggle.appendChild(btnEn);
    toggle.appendChild(btnSr);
    dirSection.appendChild(toggle);

    const wordCountEl = el('p', 'menu__word-count');
    dirSection.appendChild(wordCountEl);
    this._refs.wordCount = wordCountEl;
    this._refs.toggleBtns = [btnEn, btnSr];

    toggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.toggle__option');
      if (!btn) return;
      this._refs.toggleBtns.forEach((b) => b.classList.remove('toggle__option--active'));
      btn.classList.add('toggle__option--active');
      this._selectedDirection = btn.dataset.direction;
      this._updateWordCount();
    });

    root.appendChild(dirSection);

    // --- Game Mode Cards ---
    const modesSection = el('div', 'menu__section');
    modesSection.appendChild(el('label', 'form-group__label', t.game_mode_label));
    const grid = el('div', 'mode-grid');

    const modes = [
      { id: 'flashcards', icon: '🃏', title: t.mode_flashcards, desc: t.mode_flashcards_desc },
      { id: 'quiz', icon: '❓', title: t.mode_quiz, desc: t.mode_quiz_desc },
      { id: 'typing', icon: '⌨️', title: t.mode_typing, desc: t.mode_typing_desc },
      { id: 'match', icon: '🔗', title: t.mode_match, desc: t.mode_match_desc },
    ];

    const modeCards = [];
    for (const mode of modes) {
      const card = el('div', 'card card--interactive');
      if (mode.id === this._selectedMode) card.classList.add('card--selected');
      card.dataset.mode = mode.id;
      card.appendChild(el('div', 'card__icon', mode.icon));
      card.appendChild(el('div', 'card__title', mode.title));
      card.appendChild(el('div', 'card__subtitle', mode.desc));
      grid.appendChild(card);
      modeCards.push(card);
    }

    this._refs.modeCards = modeCards;

    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      if (!card || !card.dataset.mode) return;
      modeCards.forEach((c) => c.classList.remove('card--selected'));
      card.classList.add('card--selected');
      this._selectedMode = card.dataset.mode;
    });

    modesSection.appendChild(grid);
    root.appendChild(modesSection);

    // --- Quick Stats ---
    const statsBar = el('div', 'menu__stats');
    const streakEl = el('span', 'menu__stat');
    const learnedEl = el('span', 'menu__stat');
    statsBar.appendChild(streakEl);
    statsBar.appendChild(learnedEl);
    root.appendChild(statsBar);
    this._refs.streakEl = streakEl;
    this._refs.learnedEl = learnedEl;

    // --- Settings: Reinsert Toggle ---
    const settingsSection = el('div', 'menu__section');
    const reinsertSwitch = el('div', 'switch');
    reinsertSwitch.dataset.setting = 'reinsertEnabled';
    reinsertSwitch.appendChild(el('span', 'switch__label', t.repeat_forgotten));
    const track = el('div', 'switch__track');
    track.appendChild(el('div', 'switch__thumb'));
    reinsertSwitch.appendChild(track);

    const settings = getSettings();
    if (settings.reinsertEnabled) reinsertSwitch.classList.add('switch--on');

    reinsertSwitch.addEventListener('click', () => {
      const isOn = reinsertSwitch.classList.toggle('switch--on');
      updateSettings({ reinsertEnabled: isOn });
    });

    settingsSection.appendChild(reinsertSwitch);

    // --- UI Language Selector ---
    const langSwitch = el('div', 'menu__lang-selector');
    langSwitch.appendChild(el('span', 'switch__label', t.ui_language));

    const langToggle = el('div', 'toggle toggle--sm');
    const uiLangs = [
      { code: 'ru', label: 'RU' },
      { code: 'en', label: 'EN' },
      { code: 'sr', label: 'SR' },
    ];

    for (const { code, label } of uiLangs) {
      const btn = el('button', 'toggle__option');
      btn.type = 'button';
      btn.textContent = label;
      btn.dataset.uilang = code;
      if (code === settings.uiLanguage) btn.classList.add('toggle__option--active');
      langToggle.appendChild(btn);
    }

    langToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.toggle__option');
      if (!btn || !btn.dataset.uilang) return;
      const newLang = btn.dataset.uilang;
      if (newLang === settings.uiLanguage) return;
      updateSettings({ uiLanguage: newLang });
      window.location.reload();
    });

    langSwitch.appendChild(langToggle);
    settingsSection.appendChild(langSwitch);

    root.appendChild(settingsSection);

    // --- Start Button ---
    const startBtn = el('button', 'btn btn--primary btn--block', t.start);
    startBtn.type = 'button';
    startBtn.style.marginTop = 'var(--spacing-lg)';
    startBtn.addEventListener('click', () => {
      if (this._onStart) {
        this._onStart({
          direction: this._selectedDirection,
          mode: this._selectedMode,
        });
      }
    });
    root.appendChild(startBtn);
    this._refs.startBtn = startBtn;

    // --- Export to Excel ---
    const exportBtn = el('button', 'btn btn--outline btn--block', `📥 ${t.export_excel}`);
    exportBtn.type = 'button';
    exportBtn.style.marginTop = 'var(--spacing-sm)';
    exportBtn.addEventListener('click', () => {
      if (this._onExport) this._onExport();
    });
    root.appendChild(exportBtn);
    this._refs.exportBtn = exportBtn;

    this._root = root;
    this._container.appendChild(root);
    this._updateStats();
    this._updateWordCount();
  }

  _updateStats() {
    const progress = loadProgress();
    const words = Object.values(progress.words || {});
    const mastered = words.filter((w) => w.masteryLevel === 'mastered').length;
    const known = words.filter((w) => w.masteryLevel === 'known' || w.masteryLevel === 'mastered').length;

    if (this._refs.streakEl) {
      this._refs.streakEl.textContent = `🔥 ${progress.streakDays || 0} ${t.days}`;
    }
    if (this._refs.learnedEl) {
      this._refs.learnedEl.textContent = `📖 ${known} ${t.learned} (${mastered} ${t.mastered_stat})`;
    }
  }

  _updateWordCount() {
    if (this._refs.wordCount) {
      const targetLang = this._selectedDirection.split('-')[0];
      const count = this._wordCounts[targetLang] || 0;
      this._refs.wordCount.textContent = `${count} ${t.words_available}`;
    }
  }
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== null && text !== undefined) node.textContent = text;
  return node;
}
