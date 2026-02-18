/**
 * TypingMode — keyboard-driven translation/typing game mode.
 *
 * Players are shown a word term and must type the translation.
 * Answers are checked with fuzzy matching; close answers get a yellow warning
 * before penalising the user.
 *
 * Features:
 * - Two-tier hint system (sister language → Russian)
 * - Letter-by-letter progressive reveal
 * - Progress bar and live score
 * - End-of-session summary with mistakes list
 */

import { fuzzyMatch, serbianCyrillicToLatin } from '../engine.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FEEDBACK_CORRECT_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// TypingMode class
// ---------------------------------------------------------------------------

export class TypingMode {
  /**
   * @param {Object} [options]
   * @param {number} [options.fuzzyMaxDistance=2] - Levenshtein distance for "close" match
   */
  constructor(options = {}) {
    this._fuzzyMaxDistance = options.fuzzyMaxDistance ?? 2;

    /** @type {HTMLElement|null} */
    this._container = null;
    /** @type {import('../engine.js').GameEngine|null} */
    this._engine = null;

    // Per-word state
    this._currentEntry = null;
    this._hintsShown = 0;       // 0 | 1 | 2  (engine tracks authoritatively, we mirror for UI)
    this._lettersRevealed = 0;  // how many letters of the answer have been shown
    this._answered = false;     // has the user submitted an answer for this word?
    this._closeAnswerGiven = false; // user gave a "close" answer and needs to confirm

    // Session-level
    this._score = 0;
    this._totalWords = 0;
    this._currentIndex = 0;
    this._mistakes = [];        // { term, expected, given }

    // DOM node references (populated in _render)
    this._dom = {};

    // Bound listeners (for clean removal in destroy)
    this._onKeydown = this._handleKeydown.bind(this);
    this._autoAdvanceTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Attach the mode to a container element and store engine reference.
   * Does NOT start the session — call start() for that.
   *
   * @param {HTMLElement} container
   * @param {import('../engine.js').GameEngine} engine
   */
  init(container, engine) {
    this._container = container;
    this._engine = engine;
  }

  /**
   * Start a new session and render the first word.
   */
  start() {
    if (!this._container || !this._engine) {
      throw new Error('TypingMode: call init(container, engine) before start()');
    }

    // Reset session state
    this._score = 0;
    this._mistakes = [];
    this._currentIndex = 0;

    // Start engine session
    const firstEntry = this._engine.startSession();
    this._totalWords = this._engine.session?.words?.length ?? 0;

    this._render();
    this._loadWord(firstEntry);

    document.addEventListener('keydown', this._onKeydown);
  }

  /**
   * Tear down DOM and listeners. Safe to call multiple times.
   */
  destroy() {
    clearTimeout(this._autoAdvanceTimer);
    document.removeEventListener('keydown', this._onKeydown);
    if (this._container) {
      this._container.innerHTML = '';
    }
    this._dom = {};
    this._container = null;
    this._engine = null;
  }

  // ---------------------------------------------------------------------------
  // Rendering — initial layout
  // ---------------------------------------------------------------------------

  /**
   * Build the full typing UI into this._container.
   * All DOM is created programmatically; no innerHTML for content.
   */
  _render() {
    this._container.innerHTML = '';
    this._container.className = 'typing';

    // -- Header: progress bar + score ------------------------------------
    const header = el('div', 'typing__header');

    const progressWrap = el('div', 'typing__progress-wrap');
    const progressBar = el('div', 'typing__progress-bar');
    const progressFill = el('div', 'typing__progress-fill');
    progressBar.appendChild(progressFill);
    const progressLabel = el('span', 'typing__progress-label');
    progressWrap.appendChild(progressBar);
    progressWrap.appendChild(progressLabel);

    const scoreEl = el('div', 'typing__score');
    scoreEl.setAttribute('aria-live', 'polite');

    header.appendChild(progressWrap);
    header.appendChild(scoreEl);

    // -- Word card -------------------------------------------------------
    const card = el('div', 'typing__card');

    const wordType = el('span', 'typing__word-type');
    const wordTerm = el('div', 'typing__word-term');
    wordTerm.setAttribute('aria-label', 'Word to translate');

    card.appendChild(wordType);
    card.appendChild(wordTerm);

    // -- Hint area -------------------------------------------------------
    const hintArea = el('div', 'typing__hint-area');
    hintArea.setAttribute('aria-live', 'polite');

    // -- Input area ------------------------------------------------------
    const inputArea = el('div', 'typing__input-area');

    const input = el('input', 'typing__input');
    input.type = 'text';
    input.setAttribute('inputmode', 'text');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('aria-label', 'Your translation');
    input.setAttribute('placeholder', 'Type translation…');

    const submitBtn = el('button', 'typing__btn typing__btn--submit');
    submitBtn.textContent = 'Submit';
    submitBtn.type = 'button';

    inputArea.appendChild(input);
    inputArea.appendChild(submitBtn);

    // -- Feedback --------------------------------------------------------
    const feedback = el('div', 'typing__feedback');
    feedback.setAttribute('aria-live', 'assertive');
    feedback.setAttribute('role', 'status');

    // -- Action buttons --------------------------------------------------
    const actions = el('div', 'typing__actions');

    const hintBtn = el('button', 'typing__btn typing__btn--hint');
    hintBtn.textContent = 'Show hint';
    hintBtn.type = 'button';

    const letterBtn = el('button', 'typing__btn typing__btn--letter');
    letterBtn.textContent = 'Reveal letter';
    letterBtn.type = 'button';

    const skipBtn = el('button', 'typing__btn typing__btn--skip');
    skipBtn.textContent = 'Skip';
    skipBtn.type = 'button';

    actions.appendChild(hintBtn);
    actions.appendChild(letterBtn);
    actions.appendChild(skipBtn);

    // -- Assemble --------------------------------------------------------
    this._container.appendChild(header);
    this._container.appendChild(card);
    this._container.appendChild(hintArea);
    this._container.appendChild(inputArea);
    this._container.appendChild(feedback);
    this._container.appendChild(actions);

    // Store refs
    this._dom = {
      progressFill,
      progressLabel,
      scoreEl,
      wordType,
      wordTerm,
      hintArea,
      input,
      submitBtn,
      feedback,
      hintBtn,
      letterBtn,
      skipBtn,
      actions,
      inputArea,
    };

    // Wire up listeners
    submitBtn.addEventListener('click', () => this._handleSubmit());
    hintBtn.addEventListener('click', () => this._handleHint());
    letterBtn.addEventListener('click', () => this._handleLetterHint());
    skipBtn.addEventListener('click', () => this._handleSkip());
    input.addEventListener('input', () => this._clearFeedback());
  }

  // ---------------------------------------------------------------------------
  // Word lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Load a word entry into the UI, resetting per-word state.
   * @param {Object} entry - vocabulary entry from engine
   */
  _loadWord(entry) {
    if (!entry) {
      this._showSummary();
      return;
    }

    this._currentEntry = entry;
    this._hintsShown = 0;
    this._lettersRevealed = 0;
    this._answered = false;
    this._closeAnswerGiven = false;

    // Update progress
    this._currentIndex = this._engine.session?.currentIndex ?? this._currentIndex;
    this._updateProgress();

    // Populate card
    const { wordType, wordTerm, hintArea, input, feedback, hintBtn, letterBtn, skipBtn, submitBtn, inputArea } = this._dom;

    wordType.textContent = entry.type ? entry.type.toUpperCase() : '';
    wordTerm.textContent = entry.term;

    // Clear transient state
    hintArea.innerHTML = '';
    feedback.textContent = '';
    feedback.className = 'typing__feedback';
    input.value = '';
    input.disabled = false;
    submitBtn.disabled = false;
    hintBtn.disabled = false;
    hintBtn.textContent = 'Show hint';
    letterBtn.disabled = false;
    skipBtn.disabled = false;
    inputArea.className = 'typing__input-area';

    input.focus();
  }

  /**
   * Update progress bar and score display.
   */
  _updateProgress() {
    const { progressFill, progressLabel, scoreEl } = this._dom;
    const idx = Math.min(this._currentIndex, this._totalWords);
    const pct = this._totalWords > 0 ? Math.round((idx / this._totalWords) * 100) : 0;

    progressFill.style.width = `${pct}%`;
    progressFill.setAttribute('aria-valuenow', pct);
    progressLabel.textContent = `${idx} / ${this._totalWords}`;
    scoreEl.textContent = `Score: ${this._score}`;
  }

  // ---------------------------------------------------------------------------
  // Answer handling
  // ---------------------------------------------------------------------------

  /**
   * Handle a submission from the input field.
   */
  _handleSubmit() {
    if (this._answered) return;

    const raw = this._dom.input.value.trim();
    if (!raw) {
      this._shakeFeedback('Please type an answer first.');
      return;
    }

    // Normalise Cyrillic for comparison consistency
    const answer = serbianCyrillicToLatin(raw);

    const result = this._engine.checkAnswer(answer);
    if (!result) return;

    const { correct, expected } = result;
    const match = fuzzyMatch(answer, expected, this._fuzzyMaxDistance);

    if (match.exact || correct) {
      this._onCorrect(expected);
    } else if (match.close && !this._closeAnswerGiven) {
      // First submission that's close — warn the user, let them confirm
      this._closeAnswerGiven = true;
      this._showCloseWarning(expected, raw);
    } else {
      // Wrong (or user resubmitted after close warning)
      this._onWrong(expected, raw);
    }
  }

  /**
   * User's answer was exactly correct.
   * @param {string} expected
   */
  _onCorrect(_expected) {
    this._answered = true;
    this._score = this._engine.session?.score ?? this._score;

    this._flashInputArea('typing__input-area--correct');
    this._setFeedback('correct', `Correct! \u2713`);

    this._dom.input.disabled = true;
    this._dom.submitBtn.disabled = true;
    this._dom.skipBtn.disabled = true;
    this._updateProgress();

    this._autoAdvanceTimer = setTimeout(() => this._advance(), FEEDBACK_CORRECT_DELAY_MS);
  }

  /**
   * User's answer was wrong (or close but confirmed wrong).
   * @param {string} expected
   * @param {string} given
   */
  _onWrong(expected, given) {
    this._answered = true;

    this._flashInputArea('typing__input-area--wrong');
    this._setFeedback('wrong', `The answer is: ${expected}`);

    this._dom.input.disabled = true;
    this._dom.submitBtn.disabled = true;

    // Record mistake (deduplicate by term)
    const alreadyLogged = this._mistakes.some(m => m.term === this._currentEntry.term);
    if (!alreadyLogged) {
      this._mistakes.push({ term: this._currentEntry.term, expected, given });
    }
  }

  /**
   * Show a yellow "close" warning without advancing.
   * @param {string} expected
   * @param {string} given
   */
  _showCloseWarning(expected, given) {
    this._flashInputArea('typing__input-area--close');
    this._setFeedback('close', `Close! The answer is: ${expected} — press Submit again to continue`);
    // Pre-fill input with expected so user can see the diff
    this._dom.input.value = given;
    this._dom.input.focus();
  }

  // ---------------------------------------------------------------------------
  // Hint handling
  // ---------------------------------------------------------------------------

  /**
   * Progressive hint reveal (sister language, then Russian).
   */
  _handleHint() {
    if (this._hintsShown >= 2) return;

    const hint = this._engine.getHint();
    if (!hint) return;

    this._hintsShown++;

    const { hintArea, hintBtn } = this._dom;

    const hintEl = el('div', `typing__hint typing__hint--level-${hint.level}`);
    const langLabel = el('span', 'typing__hint-lang');
    langLabel.textContent = hint.lang.toUpperCase() + ': ';
    const hintText = el('span', 'typing__hint-text');
    hintText.textContent = hint.text;
    hintEl.appendChild(langLabel);
    hintEl.appendChild(hintText);
    hintArea.appendChild(hintEl);

    if (this._hintsShown >= 2) {
      hintBtn.disabled = true;
      hintBtn.textContent = 'No more hints';
    } else {
      hintBtn.textContent = 'Show Russian hint';
    }
  }

  /**
   * Reveal the expected answer one letter at a time.
   */
  _handleLetterHint() {
    if (!this._currentEntry) return;

    const entry = this._currentEntry;
    // The target translation is what checkAnswer compares against
    const hintLang = this._engine.hintLang;
    const expected = entry.translations[hintLang] || entry.term || '';

    this._lettersRevealed = Math.min(this._lettersRevealed + 1, expected.length);

    const revealed = expected.slice(0, this._lettersRevealed);
    const remaining = '_'.repeat(expected.length - this._lettersRevealed);

    const { hintArea, letterBtn } = this._dom;

    // Update or create letter hint row
    let letterRow = hintArea.querySelector('.typing__hint--letters');
    if (!letterRow) {
      letterRow = el('div', 'typing__hint typing__hint--letters');
      hintArea.appendChild(letterRow);
    }
    letterRow.textContent = `Letters: ${revealed}${remaining}`;

    if (this._lettersRevealed >= expected.length) {
      letterBtn.disabled = true;
      letterBtn.textContent = 'All revealed';
    }
  }

  /**
   * Skip current word (treated as wrong, show answer).
   */
  _handleSkip() {
    if (this._answered) {
      this._advance();
      return;
    }

    const result = this._engine.checkAnswer('');
    const expected = result?.expected ?? '';
    this._onWrong(expected, '(skipped)');
    this._dom.skipBtn.textContent = 'Next word';
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  /**
   * Advance to the next word (or show summary if session complete).
   */
  _advance() {
    clearTimeout(this._autoAdvanceTimer);
    const next = this._engine.nextWord();
    if (next && typeof next === 'object' && !next.score) {
      // It's a word entry
      this._loadWord(next);
    } else {
      // nextWord returned a summary (session ended)
      this._showSummary(next);
    }
  }

  // ---------------------------------------------------------------------------
  // End-of-session summary
  // ---------------------------------------------------------------------------

  /**
   * Replace the game UI with a results summary screen.
   * @param {Object} [summary] - summary from engine.endSession(), or we call endSession() here
   */
  _showSummary(summary) {
    const s = summary && summary.score !== undefined
      ? summary
      : (this._engine ? this._engine.endSession() : null);

    clearTimeout(this._autoAdvanceTimer);
    document.removeEventListener('keydown', this._onKeydown);

    if (!this._container) return;
    this._container.innerHTML = '';
    this._container.className = 'typing typing--summary';

    const title = el('h2', 'typing__summary-title');
    title.textContent = 'Session Complete!';

    const stats = el('div', 'typing__summary-stats');

    const statItems = [
      ['Score', s?.score ?? this._score],
      ['Correct', `${s?.totalCorrect ?? 0} / ${s?.totalAnswered ?? 0}`],
      ['Accuracy', `${s?.accuracy ?? 0}%`],
      ['Best streak', s?.bestStreak ?? 0],
      ['Time', s ? _formatTime(s.elapsedTime) : '—'],
    ];

    for (const [label, value] of statItems) {
      const row = el('div', 'typing__stat-row');
      const labelEl = el('span', 'typing__stat-label');
      labelEl.textContent = label;
      const valueEl = el('span', 'typing__stat-value');
      valueEl.textContent = String(value);
      row.appendChild(labelEl);
      row.appendChild(valueEl);
      stats.appendChild(row);
    }

    this._container.appendChild(title);
    this._container.appendChild(stats);

    // Mistakes list
    if (this._mistakes.length > 0) {
      const mistakesSection = el('div', 'typing__mistakes');
      const mistakesTitle = el('h3', 'typing__mistakes-title');
      mistakesTitle.textContent = 'Review these words:';
      mistakesSection.appendChild(mistakesTitle);

      const list = el('ul', 'typing__mistakes-list');
      for (const m of this._mistakes) {
        const item = el('li', 'typing__mistake-item');
        const termEl = el('span', 'typing__mistake-term');
        termEl.textContent = m.term;
        const arrow = document.createTextNode(' → ');
        const expectedEl = el('span', 'typing__mistake-expected');
        expectedEl.textContent = m.expected;
        item.appendChild(termEl);
        item.appendChild(arrow);
        item.appendChild(expectedEl);
        if (m.given && m.given !== '(skipped)' && m.given !== '') {
          const givenEl = el('span', 'typing__mistake-given');
          givenEl.textContent = ` (you said: ${m.given})`;
          item.appendChild(givenEl);
        }
        list.appendChild(item);
      }
      mistakesSection.appendChild(list);
      this._container.appendChild(mistakesSection);
    }

    // Play again button
    const playAgainBtn = el('button', 'typing__btn typing__btn--play-again');
    playAgainBtn.textContent = 'Play Again';
    playAgainBtn.type = 'button';
    playAgainBtn.addEventListener('click', () => {
      this._container.innerHTML = '';
      this.start();
    });
    this._container.appendChild(playAgainBtn);
  }

  // ---------------------------------------------------------------------------
  // Keyboard handling
  // ---------------------------------------------------------------------------

  /**
   * Global keydown: Enter submits or advances.
   * @param {KeyboardEvent} e
   */
  _handleKeydown(e) {
    if (e.key !== 'Enter') return;
    // Don't interfere if a button has focus (let its click handler run)
    if (document.activeElement === this._dom.submitBtn) return;

    if (this._answered) {
      this._advance();
    } else {
      this._handleSubmit();
    }
  }

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------

  /**
   * Set the feedback text and apply a modifier class.
   * @param {'correct'|'wrong'|'close'|''} type
   * @param {string} message
   */
  _setFeedback(type, message) {
    const { feedback } = this._dom;
    feedback.className = `typing__feedback${type ? ` typing__feedback--${type}` : ''}`;
    feedback.textContent = message;
  }

  /**
   * Clear feedback when the user starts typing again.
   */
  _clearFeedback() {
    if (!this._answered && !this._closeAnswerGiven) {
      this._dom.feedback.textContent = '';
      this._dom.feedback.className = 'typing__feedback';
      this._dom.inputArea.className = 'typing__input-area';
    }
  }

  /**
   * Temporarily add a flash modifier to the input area.
   * @param {string} modClass - BEM modifier class
   */
  _flashInputArea(modClass) {
    const { inputArea } = this._dom;
    inputArea.classList.add(modClass);
    // Remove after animation completes so it can be re-applied
    const onEnd = () => {
      inputArea.classList.remove(modClass);
      inputArea.removeEventListener('animationend', onEnd);
    };
    inputArea.addEventListener('animationend', onEnd);
    // Safety fallback if no animation is defined
    setTimeout(() => inputArea.classList.remove(modClass), 800);
  }

  /**
   * Briefly show an error-like shake message in feedback.
   * @param {string} message
   */
  _shakeFeedback(message) {
    this._setFeedback('', message);
    this._dom.feedback.classList.add('typing__feedback--shake');
    const clean = () => this._dom.feedback.classList.remove('typing__feedback--shake');
    this._dom.feedback.addEventListener('animationend', clean, { once: true });
    setTimeout(clean, 600);
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * Create an HTML element with the given BEM class string.
 * @param {string} tag
 * @param {string} className
 * @returns {HTMLElement}
 */
function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * Format milliseconds as m:ss.
 * @param {number} ms
 * @returns {string}
 */
function _formatTime(ms) {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
