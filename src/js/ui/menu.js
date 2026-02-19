/**
 * Main menu screen — language selector, game mode picker, quick stats.
 */

import { loadProgress } from '../progress.js';
import { getSettings, updateSettings } from '../settings.js';
import { t } from '../i18n.js';

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
      this._refs.startBtn.textContent = isLoading ? 'Загрузка…' : 'Начать';
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
    header.appendChild(el('p', 'menu__subtitle', 'Учи английский и сербский в игровой форме'));
    root.appendChild(header);

    // --- Language Direction Toggle ---
    const dirSection = el('div', 'menu__section');
    dirSection.appendChild(el('label', 'form-group__label', 'Направление'));
    const toggle = el('div', 'toggle');

    const btnEn = el('button', 'toggle__option toggle__option--active', '🇬🇧 Английский');
    btnEn.dataset.direction = 'en-sr';
    btnEn.type = 'button';

    const btnSr = el('button', 'toggle__option', '🇷🇸 Сербский');
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
    modesSection.appendChild(el('label', 'form-group__label', 'Режим игры'));
    const grid = el('div', 'mode-grid');

    const modes = [
      { id: 'flashcards', icon: '🃏', title: 'Карточки', desc: 'Переворачивай и запоминай' },
      { id: 'quiz', icon: '❓', title: 'Тест', desc: 'Выбери правильный ответ' },
      { id: 'typing', icon: '⌨️', title: 'Ввод', desc: 'Напиши перевод' },
      { id: 'match', icon: '🔗', title: 'Пары', desc: 'Соедини слово с переводом' },
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
    const streakEl = el('span', 'menu__stat', '🔥 0 дней');
    const learnedEl = el('span', 'menu__stat', '📖 0 изучено');
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
    root.appendChild(settingsSection);

    // --- Start Button ---
    const startBtn = el('button', 'btn btn--primary btn--block', 'Начать');
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
    const exportBtn = el('button', 'btn btn--outline btn--block', '📥 Экспорт в Excel');
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
      this._refs.streakEl.textContent = `🔥 ${progress.streakDays || 0} дней`;
    }
    if (this._refs.learnedEl) {
      this._refs.learnedEl.textContent = `📖 ${known} изучено (${mastered} освоено)`;
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
