/**
 * FlashcardsMode — flashcard game mode for vocabulary learning.
 *
 * Responsibilities:
 * - Render a flip-card UI driven by GameEngine
 * - Two-tap reveal: first tap -> sister-language hint, second tap -> Russian fallback
 * - Know it / Don't know action buttons feeding back into the engine
 * - Swipe gestures: right = know, left = don't know
 * - Progress bar and end-of-session summary with "Review mistakes" option
 *
 * All DOM elements are created programmatically. BEM class names throughout.
 * No CSS is imported — styling is handled by the app's stylesheet.
 */

import { t, langLabel } from '../i18n.js';

/** @typedef {import('../engine.js').GameEngine} GameEngine */

// --- Constants ---------------------------------------------------------------

const CLS = {
  ROOT:         'flashcards',
  BACK_BTN:     'flashcards__back-btn',
  PROGRESS:     'flashcards__progress',
  PROGRESS_BAR: 'flashcards__progress-bar',
  PROGRESS_FILL:'flashcards__progress-fill',
  PROGRESS_TEXT:'flashcards__progress-text',
  SCENE:        'flashcards__scene',
  CARD:         'card',
  CARD_INNER:   'card__inner',
  CARD_FLIPPED: 'card--flipped',
  CARD_FRONT:   'card__front',
  CARD_BACK:    'card__back',
  TERM:         'card__term',
  HINT:         'card__hint',
  HINT_LABEL:   'card__hint-label',
  HINT_TEXT:    'card__hint-text',
  HINT_SECONDARY:'card__hint--secondary',
  TAP_PROMPT:   'card__tap-prompt',
  ACTIONS:      'flashcards__actions',
  BTN_KNOW:     'flashcards__btn flashcards__btn--know',
  BTN_DONT:     'flashcards__btn flashcards__btn--dont',
  SUMMARY:      'flashcards__summary',
  SUMMARY_TITLE:'flashcards__summary-title',
  SUMMARY_STATS:'flashcards__summary-stats',
  STAT:         'flashcards__stat',
  STAT_VALUE:   'flashcards__stat-value',
  STAT_LABEL:   'flashcards__stat-label',
  BTN_REVIEW:   'flashcards__btn flashcards__btn--review',
  BTN_DONE:     'flashcards__btn flashcards__btn--done',
};

const SWIPE_THRESHOLD = 50;

// --- FlashcardsMode ----------------------------------------------------------

export class FlashcardsMode {
  constructor() {
    /** @type {HTMLElement|null} */
    this._container = null;
    /** @type {GameEngine|null} */
    this._engine = null;
    /** @type {HTMLElement|null} */
    this._root = null;

    this._tapCount = 0;
    this._knownCount = 0;
    this._unknownCount = 0;
    this._wrongWordIds = [];
    this._unsubs = [];
    this._refs = {};

    // Swipe state
    this._touchStartX = 0;
    this._touchStartY = 0;
  }

  // --- Public API ------------------------------------------------------------

  init(container, engine) {
    this._container = container;
    this._engine = engine;
  }

  start() {
    if (!this._container || !this._engine) {
      throw new Error('FlashcardsMode: call init(container, engine) before start()');
    }

    this._knownCount = 0;
    this._unknownCount = 0;
    this._wrongWordIds = [];
    this._tapCount = 0;

    this._unsubs.push(
      this._engine.on('session:started', (data) => this._onSessionStarted(data)),
      this._engine.on('word:loaded',     (data) => this._onWordLoaded(data)),
      this._engine.on('session:ended',   (data) => this._onSessionEnded(data)),
    );

    this._root = this._buildUI();
    this._container.appendChild(this._root);
    this._engine.startSession();
  }

  destroy() {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    if (this._root && this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }
    this._root = null;
    this._refs = {};
    this._container = null;
    this._engine = null;
  }

  // --- UI Construction -------------------------------------------------------

  _buildUI() {
    const root = el('div', CLS.ROOT);

    // Back button
    const backBtn = el('button', CLS.BACK_BTN, t.back_to_menu);
    backBtn.type = 'button';
    backBtn.addEventListener('click', () => this._engine.emit('mode:done'));
    root.appendChild(backBtn);

    // Progress bar
    const progress = el('div', CLS.PROGRESS);
    const barWrap  = el('div', CLS.PROGRESS_BAR);
    const barFill  = el('div', CLS.PROGRESS_FILL);
    const barText  = el('span', CLS.PROGRESS_TEXT, '0 / 0');
    barWrap.appendChild(barFill);
    progress.appendChild(barWrap);
    progress.appendChild(barText);
    root.appendChild(progress);

    // Card scene
    const scene     = el('div', CLS.SCENE);
    const card      = el('div', CLS.CARD);
    const cardInner = el('div', CLS.CARD_INNER);

    // Front face
    const front    = el('div', CLS.CARD_FRONT);
    const term     = el('p',    CLS.TERM);
    const tapFront = el('span', CLS.TAP_PROMPT, t.tap_to_reveal);
    front.appendChild(term);
    front.appendChild(tapFront);

    // Back face
    const back    = el('div', CLS.CARD_BACK);
    const hint1   = buildHintSlot(CLS.HINT);
    const hint2   = buildHintSlot(`${CLS.HINT} ${CLS.HINT_SECONDARY}`);
    const tapBack = el('span', CLS.TAP_PROMPT, t.tap_for_russian);
    back.appendChild(hint1.wrapper);
    back.appendChild(hint2.wrapper);
    back.appendChild(tapBack);

    cardInner.appendChild(front);
    cardInner.appendChild(back);
    card.appendChild(cardInner);
    scene.appendChild(card);
    root.appendChild(scene);

    // Action buttons
    const actions  = el('div', CLS.ACTIONS);
    const btnDont  = el('button', CLS.BTN_DONT, t.dont_know);
    const btnKnow  = el('button', CLS.BTN_KNOW, t.know);
    actions.appendChild(btnDont);
    actions.appendChild(btnKnow);
    root.appendChild(actions);

    // Wire interactions
    card.addEventListener('click', () => this._onCardTap());
    btnKnow.addEventListener('click', () => this._onAnswer(true));
    btnDont.addEventListener('click', () => this._onAnswer(false));

    // Swipe gestures
    card.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: true });
    card.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: true });

    this._refs = {
      root, progress, barFill, barText, card, term,
      hint1, hint2, tapBack, actions, btnKnow, btnDont,
    };

    return root;
  }

  // --- Engine Event Handlers -------------------------------------------------

  _onSessionStarted(data) {
    this._updateProgress(0, data.totalWords);
  }

  _onWordLoaded(data) {
    this._tapCount = 0;
    this._animateCardTransition(data);
    this._updateProgress(data.index + 1, data.total);
  }

  _onSessionEnded(summary) {
    this._showSummary(summary);
  }

  // --- Card Interactions -----------------------------------------------------

  _onCardTap() {
    const { card, hint1, hint2, tapBack } = this._refs;

    if (this._tapCount === 0) {
      card.classList.add(CLS.CARD_FLIPPED);
      this._tapCount = 1;
      const h = this._engine.getHint();
      if (h) {
        setHintSlot(hint1, h.lang, h.text);
      }
      tapBack.style.display = '';
    } else if (this._tapCount === 1) {
      this._tapCount = 2;
      const h = this._engine.getHint();
      if (h) {
        setHintSlot(hint2, h.lang, h.text);
        hint2.wrapper.hidden = false;
      }
      tapBack.style.display = 'none';
    }
  }

  _onAnswer(known) {
    const { btnKnow, btnDont } = this._refs;
    btnKnow.disabled = true;
    btnDont.disabled = true;

    if (known) {
      this._knownCount++;
      const entry = this._engine.getCurrentWord();
      if (entry) {
        const target = entry.translations[this._engine.hintLang]
          || entry.translations[this._engine.fallbackLang]
          || entry.term;
        this._engine.checkAnswer(target, this._engine.hintLang);
      }
    } else {
      this._unknownCount++;
      const entry = this._engine.getCurrentWord();
      if (entry) {
        if (!this._wrongWordIds.includes(entry.id)) {
          this._wrongWordIds.push(entry.id);
        }
        this._engine.checkAnswer('', this._engine.hintLang);
      }
    }

    this._engine.nextWord();
  }

  // --- Swipe Gestures --------------------------------------------------------

  _onTouchStart(e) {
    const touch = e.touches[0];
    this._touchStartX = touch.clientX;
    this._touchStartY = touch.clientY;
  }

  _onTouchEnd(e) {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - this._touchStartX;
    const dy = touch.clientY - this._touchStartY;

    // Must be primarily horizontal and exceed threshold
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) {
        this._onAnswer(true);  // swipe right = know
      } else {
        this._onAnswer(false); // swipe left = don't know
      }
    }
  }

  // --- Card Animation --------------------------------------------------------

  _animateCardTransition(wordData) {
    const { card } = this._refs;

    // Slide out
    card.classList.add('card--slide-out');

    const onSlideOutEnd = () => {
      card.removeEventListener('animationend', onSlideOutEnd);
      card.classList.remove('card--slide-out');

      // Reset card content while invisible
      this._resetCard(wordData);

      // Slide in
      card.classList.add('card--slide-in');
      const onSlideInEnd = () => {
        card.removeEventListener('animationend', onSlideInEnd);
        card.classList.remove('card--slide-in');
      };
      card.addEventListener('animationend', onSlideInEnd);
    };
    card.addEventListener('animationend', onSlideOutEnd);

    // Safety fallback if animation doesn't fire (first word)
    setTimeout(() => {
      if (card.classList.contains('card--slide-out')) {
        card.classList.remove('card--slide-out');
        this._resetCard(wordData);
      }
    }, 200);
  }

  // --- Progress --------------------------------------------------------------

  _updateProgress(current, total) {
    const { barFill, barText } = this._refs;
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    barFill.style.width = `${pct}%`;
    barText.textContent = `${current} / ${total}`;
  }

  // --- Card Reset ------------------------------------------------------------

  _resetCard(wordData) {
    const { card, term, hint1, hint2, tapBack, btnKnow, btnDont } = this._refs;

    card.classList.add('card--no-transition');
    card.classList.remove(CLS.CARD_FLIPPED);
    void card.offsetWidth;
    card.classList.remove('card--no-transition');

    term.textContent = wordData.term || '';

    clearHintSlot(hint1);
    clearHintSlot(hint2);
    hint2.wrapper.hidden = true;

    tapBack.style.display = '';

    btnKnow.disabled = false;
    btnDont.disabled = false;
  }

  // --- Summary ---------------------------------------------------------------

  _showSummary(summary) {
    if (this._refs.root) {
      this._refs.root.hidden = true;
    }

    const pct = summary.totalAnswered > 0
      ? Math.round((this._knownCount / summary.totalAnswered) * 100)
      : 0;

    const summaryEl = el('div', CLS.SUMMARY);
    summaryEl.appendChild(el('h2', CLS.SUMMARY_TITLE, t.session_complete));

    const stats = el('div', CLS.SUMMARY_STATS);
    const statsData = [
      { value: this._knownCount,                label: t.known },
      { value: this._unknownCount,              label: t.unknown },
      { value: `${pct}%`,                       label: t.accuracy },
      { value: summary.score,                   label: t.score },
      { value: summary.bestStreak,              label: t.best_streak },
      { value: formatTime(summary.elapsedTime), label: t.time },
    ];
    for (const s of statsData) {
      const stat  = el('div',  CLS.STAT);
      const value = el('span', CLS.STAT_VALUE, String(s.value));
      const label = el('span', CLS.STAT_LABEL, s.label);
      stat.appendChild(value);
      stat.appendChild(label);
      stats.appendChild(stat);
    }
    summaryEl.appendChild(stats);

    const btnRow = el('div', CLS.ACTIONS);

    if (this._wrongWordIds.length > 0) {
      const reviewBtn = el('button', CLS.BTN_REVIEW, `${t.review_mistakes} (${this._wrongWordIds.length})`);
      reviewBtn.addEventListener('click', () => this._startReviewSession(summaryEl));
      btnRow.appendChild(reviewBtn);
    }

    const doneBtn = el('button', CLS.BTN_DONE, t.done);
    doneBtn.addEventListener('click', () => this._engine.emit('mode:done'));
    btnRow.appendChild(doneBtn);

    summaryEl.appendChild(btnRow);
    this._container.appendChild(summaryEl);
  }

  _startReviewSession(summaryEl) {
    const wrongIds = [...this._wrongWordIds];

    if (summaryEl.parentNode) summaryEl.parentNode.removeChild(summaryEl);

    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];

    this._knownCount = 0;
    this._unknownCount = 0;
    this._wrongWordIds = [];
    this._tapCount = 0;

    if (this._refs.root) {
      this._refs.root.hidden = false;
    } else {
      this._root = this._buildUI();
      this._container.appendChild(this._root);
    }

    this._unsubs.push(
      this._engine.on('session:started', (data) => this._onSessionStarted(data)),
      this._engine.on('word:loaded',     (data) => this._onWordLoaded(data)),
      this._engine.on('session:ended',   (data) => this._onSessionEnded(data)),
    );

    this._engine.startSession(wrongIds);
  }
}

// --- DOM Helpers -------------------------------------------------------------

function el(tag, className, text) {
  const node = document.createElement(tag);
  for (const cls of className.split(' ')) {
    if (cls) node.classList.add(cls);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildHintSlot(wrapperClass) {
  const wrapper = el('div', wrapperClass);
  const label   = el('span', CLS.HINT_LABEL);
  const text    = el('p',    CLS.HINT_TEXT);
  wrapper.appendChild(label);
  wrapper.appendChild(text);
  wrapper.hidden = true;
  return { wrapper, label, text };
}

function setHintSlot(slot, lang, translation) {
  slot.label.textContent = langLabel(lang);
  slot.text.textContent  = translation;
  slot.wrapper.hidden    = false;
}

function clearHintSlot(slot) {
  slot.label.textContent = '';
  slot.text.textContent  = '';
  slot.wrapper.hidden    = true;
}

function formatTime(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes      = Math.floor(totalSeconds / 60);
  const seconds      = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
