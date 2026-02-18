/**
 * FlashcardsMode — flashcard game mode for vocabulary learning.
 *
 * Responsibilities:
 * - Render a flip-card UI driven by GameEngine
 * - Two-tap reveal: first tap → sister-language hint, second tap → Russian fallback
 * - Know it / Don't know action buttons feeding back into the engine
 * - Progress bar and end-of-session summary with "Review mistakes" option
 *
 * All DOM elements are created programmatically. BEM class names throughout.
 * No CSS is imported — styling is handled by the app's stylesheet.
 */

/** @typedef {import('../engine.js').GameEngine} GameEngine */

// ─── Constants ───────────────────────────────────────────────────────────────

const CLS = {
  // Layout
  ROOT:         'flashcards',
  PROGRESS:     'flashcards__progress',
  PROGRESS_BAR: 'flashcards__progress-bar',
  PROGRESS_FILL:'flashcards__progress-fill',
  PROGRESS_TEXT:'flashcards__progress-text',

  // Card scene
  SCENE:        'flashcards__scene',
  CARD:         'card',
  CARD_INNER:   'card__inner',
  CARD_FLIPPED: 'card--flipped',
  CARD_FRONT:   'card__front',
  CARD_BACK:    'card__back',
  TERM:         'card__term',
  TERM_TYPE:    'card__term-type',
  HINT:         'card__hint',
  HINT_LABEL:   'card__hint-label',
  HINT_TEXT:    'card__hint-text',
  HINT_SECONDARY:'card__hint--secondary',
  TAP_PROMPT:   'card__tap-prompt',

  // Actions
  ACTIONS:      'flashcards__actions',
  BTN_KNOW:     'flashcards__btn flashcards__btn--know',
  BTN_DONT:     'flashcards__btn flashcards__btn--dont',

  // Summary
  SUMMARY:      'flashcards__summary',
  SUMMARY_TITLE:'flashcards__summary-title',
  SUMMARY_STATS:'flashcards__summary-stats',
  STAT:         'flashcards__stat',
  STAT_VALUE:   'flashcards__stat-value',
  STAT_LABEL:   'flashcards__stat-label',
  BTN_REVIEW:   'flashcards__btn flashcards__btn--review',
  BTN_DONE:     'flashcards__btn flashcards__btn--done',
};

// ─── FlashcardsMode ──────────────────────────────────────────────────────────

export class FlashcardsMode {
  constructor() {
    /** @type {HTMLElement|null} */
    this._container = null;

    /** @type {GameEngine|null} */
    this._engine = null;

    /** @type {HTMLElement|null} Root element rendered into container */
    this._root = null;

    // Per-card state
    this._tapCount = 0;       // 0 = front showing, 1 = first hint, 2 = second hint

    // Tracking for summary (in flashcard mode we self-track know/don't since
    // there is no text input; we call engine.checkAnswer() with a sentinel)
    this._knownCount = 0;
    this._unknownCount = 0;
    this._wrongWordIds = [];

    // Engine event unsubscribers
    this._unsubs = [];

    // Refs to live DOM nodes that need updating
    this._refs = {};
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Bind the mode to a container and engine. Must be called before start().
   * @param {HTMLElement} container
   * @param {GameEngine} engine
   */
  init(container, engine) {
    this._container = container;
    this._engine = engine;
  }

  /**
   * Start the flashcard session: subscribe to engine events and render UI.
   */
  start() {
    if (!this._container || !this._engine) {
      throw new Error('FlashcardsMode: call init(container, engine) before start()');
    }

    // Reset tracking state
    this._knownCount = 0;
    this._unknownCount = 0;
    this._wrongWordIds = [];
    this._tapCount = 0;

    // Subscribe to engine events
    this._unsubs.push(
      this._engine.on('session:started', (data) => this._onSessionStarted(data)),
      this._engine.on('word:loaded',     (data) => this._onWordLoaded(data)),
      this._engine.on('session:ended',   (data) => this._onSessionEnded(data)),
    );

    // Build the skeleton UI (progress + card + actions)
    this._root = this._buildUI();
    this._container.appendChild(this._root);

    // Kick off the engine session
    this._engine.startSession();
  }

  /**
   * Tear down: remove DOM, unsubscribe events, release refs.
   */
  destroy() {
    // Unsubscribe all engine listeners
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];

    // Remove rendered DOM
    if (this._root && this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }
    this._root = null;
    this._refs = {};

    this._container = null;
    this._engine = null;
  }

  // ── UI Construction ────────────────────────────────────────────────────────

  /**
   * Build the full flashcard UI skeleton and return the root element.
   * @returns {HTMLElement}
   */
  _buildUI() {
    const root = el('div', CLS.ROOT);

    // Progress bar
    const progress = el('div', CLS.PROGRESS);
    const barWrap  = el('div', CLS.PROGRESS_BAR);
    const barFill  = el('div', CLS.PROGRESS_FILL);
    const barText  = el('span', CLS.PROGRESS_TEXT, '0 / 0');
    barWrap.appendChild(barFill);
    progress.appendChild(barWrap);
    progress.appendChild(barText);
    root.appendChild(progress);

    // Card scene (3-D flip container)
    const scene     = el('div', CLS.SCENE);
    const card      = el('div', CLS.CARD);
    const cardInner = el('div', CLS.CARD_INNER);

    // Front face
    const front    = el('div', CLS.CARD_FRONT);
    const termType = el('span', CLS.TERM_TYPE);
    const term     = el('p',    CLS.TERM);
    const tapFront = el('span', CLS.TAP_PROMPT, 'Tap to reveal hint');
    front.appendChild(termType);
    front.appendChild(term);
    front.appendChild(tapFront);

    // Back face — holds both hint slots
    const back       = el('div', CLS.CARD_BACK);
    const hint1      = buildHintSlot(CLS.HINT);
    const hint2      = buildHintSlot(`${CLS.HINT} ${CLS.HINT_SECONDARY}`);
    const tapBack    = el('span', CLS.TAP_PROMPT, 'Tap again for Russian hint');
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
    const btnDont  = el('button', CLS.BTN_DONT, "Don't know");
    const btnKnow  = el('button', CLS.BTN_KNOW, 'Know it');
    actions.appendChild(btnDont);
    actions.appendChild(btnKnow);
    root.appendChild(actions);

    // Wire up interactions
    card.addEventListener('click', () => this._onCardTap());
    btnKnow.addEventListener('click', () => this._onAnswer(true));
    btnDont.addEventListener('click', () => this._onAnswer(false));

    // Stash refs for later updates
    this._refs = {
      root,
      progress,
      barFill,
      barText,
      card,
      termType,
      term,
      hint1,
      hint2,
      tapBack,
      actions,
      btnKnow,
      btnDont,
    };

    return root;
  }

  // ── Engine Event Handlers ──────────────────────────────────────────────────

  /** @param {{ totalWords: number, direction: string }} data */
  _onSessionStarted(data) {
    // progress text will be set when first word:loaded fires
    this._updateProgress(0, data.totalWords);
  }

  /** @param {{ index: number, total: number, term: string, type: string, id: string }} data */
  _onWordLoaded(data) {
    this._tapCount = 0;
    this._resetCard(data);
    this._updateProgress(data.index + 1, data.total);
  }

  /** @param {Object} summary */
  _onSessionEnded(summary) {
    this._showSummary(summary);
  }

  // ── Card Interactions ──────────────────────────────────────────────────────

  /**
   * Handle a tap on the card.
   * tap 0→1 : flip card + reveal first hint (sister language)
   * tap 1→2 : reveal second hint (Russian fallback), hide tap prompt
   */
  _onCardTap() {
    const { card, hint1, hint2, tapBack } = this._refs;

    if (this._tapCount === 0) {
      // Flip to back
      card.classList.add(CLS.CARD_FLIPPED);
      this._tapCount = 1;

      // Fetch first hint from engine
      const h = this._engine.getHint();
      if (h) {
        setHintSlot(hint1, h.lang, h.text);
      }

      // Show tap-again prompt only if a second hint might exist
      tapBack.style.display = '';

    } else if (this._tapCount === 1) {
      this._tapCount = 2;

      // Fetch second hint (Russian fallback)
      const h = this._engine.getHint();
      if (h) {
        setHintSlot(hint2, h.lang, h.text);
        hint2.wrapper.hidden = false;
      }

      // No more hints — hide tap prompt
      tapBack.style.display = 'none';
    }
    // After tap 2, further taps are ignored (card fully revealed)
  }

  /**
   * Handle Know / Don't know button click.
   * @param {boolean} known
   */
  _onAnswer(known) {
    const { btnKnow, btnDont } = this._refs;

    // Disable buttons briefly to prevent double-click
    btnKnow.disabled = true;
    btnDont.disabled = true;

    if (known) {
      this._knownCount++;
      // Pass a correct answer sentinel to update engine score / streak
      const entry = this._engine.getCurrentWord();
      if (entry) {
        // Use the term itself so the engine can score it correctly
        const target = entry.translations[this._engine.hintLang]
          || entry.translations[this._engine.fallbackLang]
          || entry.term;
        this._engine.checkAnswer(target, this._engine.hintLang);
      }
    } else {
      this._unknownCount++;
      const entry = this._engine.getCurrentWord();
      if (entry) {
        // Track wrong word id locally (engine also tracks it)
        if (!this._wrongWordIds.includes(entry.id)) {
          this._wrongWordIds.push(entry.id);
        }
        // Submit a blank answer so engine records it as wrong
        this._engine.checkAnswer('', this._engine.hintLang);
      }
    }

    // Advance to next word (or triggers session:ended)
    this._engine.nextWord();
  }

  // ── Progress ───────────────────────────────────────────────────────────────

  /**
   * @param {number} current  1-based current word index
   * @param {number} total
   */
  _updateProgress(current, total) {
    const { barFill, barText } = this._refs;
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    barFill.style.width = `${pct}%`;
    barText.textContent = `${current} / ${total}`;
  }

  // ── Card Reset ─────────────────────────────────────────────────────────────

  /**
   * Reset card to front face for a new word.
   * @param {{ term: string, type?: string }} wordData
   */
  _resetCard(wordData) {
    const { card, termType, term, hint1, hint2, tapBack, btnKnow, btnDont } = this._refs;

    // Flip back to front (no transition class so it snaps instantly)
    card.classList.add('card--no-transition');
    card.classList.remove(CLS.CARD_FLIPPED);
    // Force reflow so the removal registers before re-enabling transitions
    void card.offsetWidth;
    card.classList.remove('card--no-transition');

    // Update term display
    term.textContent = wordData.term || '';
    termType.textContent = wordData.type ? `[${wordData.type}]` : '';
    termType.hidden = !wordData.type;

    // Clear hint slots
    clearHintSlot(hint1);
    clearHintSlot(hint2);
    hint2.wrapper.hidden = true;

    // Reset tap prompt
    tapBack.style.display = '';

    // Re-enable action buttons
    btnKnow.disabled = false;
    btnDont.disabled = false;
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  /**
   * Replace the game UI with the end-of-session summary screen.
   * @param {Object} summary
   */
  _showSummary(summary) {
    // Hide the game UI
    if (this._refs.root) {
      this._refs.root.hidden = true;
    }

    const pct = summary.totalAnswered > 0
      ? Math.round((this._knownCount / summary.totalAnswered) * 100)
      : 0;

    const summaryEl = el('div', CLS.SUMMARY);

    const title = el('h2', CLS.SUMMARY_TITLE, 'Session Complete');
    summaryEl.appendChild(title);

    // Stats grid
    const stats = el('div', CLS.SUMMARY_STATS);

    const statsData = [
      { value: this._knownCount,          label: 'Known' },
      { value: this._unknownCount,        label: "Don't know" },
      { value: `${pct}%`,                 label: 'Accuracy' },
      { value: summary.score,             label: 'Score' },
      { value: summary.bestStreak,        label: 'Best streak' },
      { value: formatTime(summary.elapsedTime), label: 'Time' },
    ];

    for (const s of statsData) {
      const stat   = el('div',  CLS.STAT);
      const value  = el('span', CLS.STAT_VALUE, String(s.value));
      const label  = el('span', CLS.STAT_LABEL, s.label);
      stat.appendChild(value);
      stat.appendChild(label);
      stats.appendChild(stat);
    }
    summaryEl.appendChild(stats);

    // Buttons row
    const btnRow = el('div', CLS.ACTIONS);

    // "Review mistakes" — only shown if there are wrong words
    if (this._wrongWordIds.length > 0) {
      const reviewBtn = el('button', CLS.BTN_REVIEW, `Review mistakes (${this._wrongWordIds.length})`);
      reviewBtn.addEventListener('click', () => this._startReviewSession(summaryEl));
      btnRow.appendChild(reviewBtn);
    }

    const doneBtn = el('button', CLS.BTN_DONE, 'Done');
    doneBtn.addEventListener('click', () => {
      // Let the host app know we are finished (it can listen for this event)
      this._engine.emit('mode:done');
    });
    btnRow.appendChild(doneBtn);

    summaryEl.appendChild(btnRow);
    this._container.appendChild(summaryEl);
  }

  /**
   * Start a new session limited to previously wrong words.
   * @param {HTMLElement} summaryEl - the summary element to remove
   */
  _startReviewSession(summaryEl) {
    const wrongIds = [...this._wrongWordIds];

    // Remove summary screen
    if (summaryEl.parentNode) summaryEl.parentNode.removeChild(summaryEl);

    // Unsubscribe old listeners before re-subscribing
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];

    // Reset tracking
    this._knownCount = 0;
    this._unknownCount = 0;
    this._wrongWordIds = [];
    this._tapCount = 0;

    // Restore and reset the main game UI
    if (this._refs.root) {
      this._refs.root.hidden = false;
    } else {
      // UI was destroyed — rebuild it
      this._root = this._buildUI();
      this._container.appendChild(this._root);
    }

    // Re-subscribe
    this._unsubs.push(
      this._engine.on('session:started', (data) => this._onSessionStarted(data)),
      this._engine.on('word:loaded',     (data) => this._onWordLoaded(data)),
      this._engine.on('session:ended',   (data) => this._onSessionEnded(data)),
    );

    // Start a new session, biasing toward wrong words
    this._engine.startSession(wrongIds);
  }
}

// ─── DOM Helpers ─────────────────────────────────────────────────────────────

/**
 * Create a DOM element with a class name and optional text content.
 * Supports multiple space-separated class names.
 * @param {string} tag
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  // Handle compound class strings (e.g. 'flashcards__btn flashcards__btn--know')
  for (const cls of className.split(' ')) {
    if (cls) node.classList.add(cls);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Build a hint slot: a wrapper div containing a label and a text paragraph.
 * Returns the wrapper and named child refs.
 * @param {string} wrapperClass
 * @returns {{ wrapper: HTMLElement, label: HTMLElement, text: HTMLElement }}
 */
function buildHintSlot(wrapperClass) {
  const wrapper = el('div', wrapperClass);
  const label   = el('span', CLS.HINT_LABEL);
  const text    = el('p',    CLS.HINT_TEXT);
  wrapper.appendChild(label);
  wrapper.appendChild(text);
  wrapper.hidden = true;
  return { wrapper, label, text };
}

/**
 * Populate a hint slot with language label and translated text.
 * @param {{ wrapper: HTMLElement, label: HTMLElement, text: HTMLElement }} slot
 * @param {string} lang
 * @param {string} translation
 */
function setHintSlot(slot, lang, translation) {
  slot.label.textContent = langLabel(lang);
  slot.text.textContent  = translation;
  slot.wrapper.hidden    = false;
}

/**
 * Clear and hide a hint slot.
 * @param {{ wrapper: HTMLElement, label: HTMLElement, text: HTMLElement }} slot
 */
function clearHintSlot(slot) {
  slot.label.textContent = '';
  slot.text.textContent  = '';
  slot.wrapper.hidden    = true;
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

/**
 * Human-readable label for a language code.
 * @param {string} lang
 * @returns {string}
 */
function langLabel(lang) {
  const map = { en: 'English', sr: 'Serbian', ru: 'Russian' };
  return map[lang] || lang.toUpperCase();
}

/**
 * Format milliseconds as M:SS.
 * @param {number} ms
 * @returns {string}
 */
function formatTime(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes      = Math.floor(totalSeconds / 60);
  const seconds      = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
