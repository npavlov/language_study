/**
 * QuizMode — multiple-choice quiz game mode.
 *
 * Responsibilities:
 * - Render quiz UI into a provided container
 * - Build 4-option questions (1 correct + 3 distractors from engine.allEntries)
 * - Handle answer selection with green/red feedback
 * - Track wrong attempts per question (max 2 before auto-advancing)
 * - Display score, progress bar, and end-of-session summary
 * - Emit no external events; fully self-contained DOM module
 *
 * BEM class naming: quiz, quiz__*, quiz--modifier
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const OPTION_COUNT        = 4;    // total choices per question
const AUTO_ADVANCE_MS     = 800;  // delay after correct answer before next word
const WRONG_LIMIT         = 2;    // wrong attempts before showing correct answer

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fisher-Yates in-place shuffle.
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Create a DOM element with optional class names and text content.
 * @param {string} tag
 * @param {string|string[]} [classes]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, classes, text) {
  const node = document.createElement(tag);
  if (classes) {
    const list = Array.isArray(classes) ? classes : [classes];
    node.className = list.join(' ');
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Resolve the "answer language" for a given engine.
 * In 'en-sr' direction we quiz on the English term and accept Serbian answers.
 * The hint language (engine.hintLang) is the answer language.
 * @param {import('../engine.js').GameEngine} engine
 * @returns {string}
 */
function answerLang(engine) {
  return engine.hintLang;
}

/**
 * Pick a display-quality translation for an entry.
 * Prefers hintLang, falls back to fallbackLang, then term itself.
 * @param {Object} entry
 * @param {import('../engine.js').GameEngine} engine
 * @returns {string}
 */
function pickTranslation(entry, engine) {
  return (
    entry.translations?.[engine.hintLang] ||
    entry.translations?.[engine.fallbackLang] ||
    entry.term
  );
}

/**
 * Build a pool of 3 distractor translations from engine.allEntries,
 * excluding the current correct entry.
 * Entries sharing the same source_language (if present) are preferred.
 *
 * @param {Object} correctEntry       - the current quiz word
 * @param {import('../engine.js').GameEngine} engine
 * @returns {string[]}                - exactly 3 distractor label strings
 */
function buildDistractors(correctEntry, engine) {
  const correctTranslation = pickTranslation(correctEntry, engine);

  // Prefer same source_language bucket for plausible distractors
  const sameGroup = engine.allEntries.filter(
    (e) =>
      e.id !== correctEntry.id &&
      pickTranslation(e, engine) !== correctTranslation &&
      (e.source_language === undefined ||
        e.source_language === correctEntry.source_language)
  );

  // Fallback pool: everything else
  const otherGroup = engine.allEntries.filter(
    (e) =>
      e.id !== correctEntry.id &&
      pickTranslation(e, engine) !== correctTranslation &&
      !sameGroup.includes(e)
  );

  const combined = shuffle([...sameGroup, ...otherGroup]);
  const picked   = combined.slice(0, OPTION_COUNT - 1);

  // If we still don't have 3, fill with placeholder strings (edge case)
  while (picked.length < OPTION_COUNT - 1) {
    picked.push({ term: `—`, translations: {} });
  }

  return picked.map((e) => pickTranslation(e, engine));
}

// ─── QuizMode Class ───────────────────────────────────────────────────────────

export class QuizMode {
  /**
   * @param {HTMLElement|null} container
   * @param {import('../engine.js').GameEngine|null} engine
   */
  constructor() {
    /** @type {HTMLElement|null} */
    this._container = null;
    /** @type {import('../engine.js').GameEngine|null} */
    this._engine = null;

    // DOM refs populated during render
    this._scoreEl      = null;
    this._progressEl   = null;
    this._progressFill = null;
    this._termEl       = null;
    this._hintEl       = null;
    this._optionsEl    = null;
    this._rootEl       = null;

    // Per-question state
    this._wrongCount   = 0;
    this._currentEntry = null;
    this._options      = [];   // { label: string, correct: boolean }[]
    this._locked       = false; // prevent double-clicks during feedback

    // Session state for summary
    this._sessionWords = 0;
    this._mistakes     = []; // { term, correctLabel }[]

    // Bound handler refs for cleanup
    this._boundOptionClick = null;
    this._advanceTimer     = null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Attach the mode to a container and engine. Does not render yet.
   * @param {HTMLElement} container
   * @param {import('../engine.js').GameEngine} engine
   */
  init(container, engine) {
    this._container = container;
    this._engine    = engine;
  }

  /**
   * Start the quiz session: render UI and load first question.
   */
  start() {
    if (!this._container || !this._engine) {
      throw new Error('QuizMode: call init(container, engine) before start()');
    }

    // Clear previous content
    this._container.innerHTML = '';
    this._mistakes    = [];
    this._wrongCount  = 0;
    this._locked      = false;

    // Build skeleton
    this._rootEl = this._buildSkeleton();
    this._container.appendChild(this._rootEl);

    // Start engine session
    try {
      this._currentEntry = this._engine.startSession();
    } catch (err) {
      this._showError(err.message);
      return;
    }

    // Cache total for progress bar
    this._sessionWords = this._engine.session?.words?.length ?? 0;

    this._renderQuestion();
  }

  /**
   * Tear down: clear timers, remove DOM, unbind handlers.
   */
  destroy() {
    if (this._advanceTimer !== null) {
      clearTimeout(this._advanceTimer);
      this._advanceTimer = null;
    }
    if (this._container) {
      this._container.innerHTML = '';
    }
    this._rootEl       = null;
    this._scoreEl      = null;
    this._progressEl   = null;
    this._progressFill = null;
    this._termEl       = null;
    this._hintEl       = null;
    this._optionsEl    = null;
    this._currentEntry = null;
  }

  // ── DOM Construction ───────────────────────────────────────────────────────

  /**
   * Build the persistent chrome (header + question area).
   * @returns {HTMLElement}
   */
  _buildSkeleton() {
    const root = el('div', 'quiz');

    // ── Header ──
    const header = el('div', 'quiz__header');

    // Progress left side
    const progressWrap = el('div', 'quiz__progress-wrap');
    this._progressEl   = el('div', 'quiz__progress-label', 'Question 1 / ?');
    const progressBar  = el('div', 'quiz__progress-bar');
    this._progressFill = el('div', 'quiz__progress-fill');
    progressBar.appendChild(this._progressFill);
    progressWrap.appendChild(this._progressEl);
    progressWrap.appendChild(progressBar);

    // Score right side
    this._scoreEl = el('div', 'quiz__score', 'Score: 0');

    header.appendChild(progressWrap);
    header.appendChild(this._scoreEl);
    root.appendChild(header);

    // ── Question area ──
    const body = el('div', 'quiz__body');

    this._termEl = el('div', 'quiz__term', '…');
    this._hintEl = el('div', 'quiz__hint');
    this._hintEl.setAttribute('aria-live', 'polite');

    this._optionsEl = el('div', 'quiz__options');
    this._optionsEl.setAttribute('role', 'group');
    this._optionsEl.setAttribute('aria-label', 'Answer options');

    body.appendChild(this._termEl);
    body.appendChild(this._hintEl);
    body.appendChild(this._optionsEl);
    root.appendChild(body);

    return root;
  }

  // ── Question Rendering ─────────────────────────────────────────────────────

  /**
   * Render the current question from this._currentEntry.
   */
  _renderQuestion() {
    const entry  = this._currentEntry;
    const engine = this._engine;

    // Reset per-question state
    this._wrongCount = 0;
    this._locked     = false;
    this._hintEl.textContent = '';
    this._hintEl.className   = 'quiz__hint';

    // Progress
    const idx   = engine.session?.currentIndex ?? 0;
    const total = this._sessionWords;
    const qNum  = idx + 1;
    this._progressEl.textContent = `Question ${qNum} / ${total}`;
    const pct = total > 0 ? ((idx / total) * 100).toFixed(1) : 0;
    this._progressFill.style.width = `${pct}%`;
    this._progressFill.setAttribute('aria-valuenow', pct);

    // Term
    this._termEl.textContent = entry.term;

    // Build options
    const correctLabel    = pickTranslation(entry, engine);
    const distractors     = buildDistractors(entry, engine);
    const optionLabels    = shuffle([correctLabel, ...distractors]);

    this._options = optionLabels.map((label) => ({
      label,
      correct: label === correctLabel,
    }));

    // Render option buttons
    this._optionsEl.innerHTML = '';
    this._boundOptionClick    = this._handleOptionClick.bind(this);

    this._options.forEach((opt, i) => {
      const btn = el('button', 'quiz__option', opt.label);
      btn.type = 'button';
      btn.dataset.index = i;
      btn.addEventListener('click', this._boundOptionClick);
      this._optionsEl.appendChild(btn);
    });
  }

  // ── Interaction ────────────────────────────────────────────────────────────

  /**
   * Handle a click on any option button.
   * @param {MouseEvent} evt
   */
  _handleOptionClick(evt) {
    if (this._locked) return;

    const btn   = evt.currentTarget;
    const index = parseInt(btn.dataset.index, 10);
    const opt   = this._options[index];

    if (opt.correct) {
      this._onCorrect(btn);
    } else {
      this._onWrong(btn, index);
    }
  }

  /**
   * Handle a correct answer selection.
   * @param {HTMLButtonElement} btn
   */
  _onCorrect(btn) {
    this._locked = true;

    // Call engine.checkAnswer with the correct label to award points
    const correctLabel = this._options.find((o) => o.correct)?.label ?? '';
    this._engine.checkAnswer(correctLabel, answerLang(this._engine));

    // Visual feedback
    btn.classList.add('quiz__option--correct');

    // Update score
    const score = this._engine.session?.score ?? 0;
    this._scoreEl.textContent = `Score: ${score}`;

    // Advance after delay
    this._advanceTimer = setTimeout(() => {
      this._advanceTimer = null;
      this._advance();
    }, AUTO_ADVANCE_MS);
  }

  /**
   * Handle a wrong answer selection.
   * @param {HTMLButtonElement} btn
   * @param {number} index
   */
  _onWrong(btn, _index) {
    this._wrongCount++;
    btn.classList.add('quiz__option--wrong');
    btn.disabled = true;

    // Tell engine about wrong answer (uses a throwaway string so engine records it)
    this._engine.checkAnswer('__wrong__', answerLang(this._engine));

    // Update score (may have dropped streak)
    const score = this._engine.session?.score ?? 0;
    this._scoreEl.textContent = `Score: ${score}`;

    // Show hint
    const hint = this._engine.getHint();
    if (hint) {
      this._hintEl.textContent = `Hint (${hint.lang.toUpperCase()}): ${hint.text}`;
      this._hintEl.className   = 'quiz__hint quiz__hint--visible';
    }

    if (this._wrongCount >= WRONG_LIMIT) {
      // Reveal correct answer and auto-advance
      this._locked = true;
      this._revealCorrect();

      // Record as mistake for summary
      const correctLabel = this._options.find((o) => o.correct)?.label ?? '';
      const entry        = this._currentEntry;
      const alreadyLogged = this._mistakes.some((m) => m.term === entry.term);
      if (!alreadyLogged) {
        this._mistakes.push({ term: entry.term, correctLabel });
      }

      this._advanceTimer = setTimeout(() => {
        this._advanceTimer = null;
        this._advance();
      }, AUTO_ADVANCE_MS * 2);
    }
  }

  /**
   * Highlight the correct button so the user can see it.
   */
  _revealCorrect() {
    const buttons = this._optionsEl.querySelectorAll('.quiz__option');
    this._options.forEach((opt, i) => {
      if (opt.correct) {
        buttons[i].classList.add('quiz__option--correct');
      }
    });
  }

  /**
   * Advance to the next word or end the session.
   */
  _advance() {
    const next = this._engine.nextWord();

    if (!next || typeof next !== 'object' || !next.term) {
      // Session ended — next is a summary object
      const summary = typeof next === 'object' && next !== null && 'score' in next
        ? next
        : this._engine.endSession();
      this._showSummary(summary);
      return;
    }

    this._currentEntry = next;
    this._renderQuestion();
  }

  // ── Summary Screen ─────────────────────────────────────────────────────────

  /**
   * Replace quiz body with a session summary.
   * @param {Object} summary
   */
  _showSummary(summary) {
    if (!this._rootEl) return;

    // Remove the header and body, replace with summary
    this._rootEl.innerHTML = '';

    const wrap = el('div', 'quiz__summary');

    // Title
    wrap.appendChild(el('h2', 'quiz__summary-title', 'Session complete!'));

    // Stats
    const stats = el('dl', 'quiz__summary-stats');
    const addStat = (label, value) => {
      stats.appendChild(el('dt', 'quiz__summary-stat-label', label));
      stats.appendChild(el('dd', 'quiz__summary-stat-value', String(value)));
    };
    addStat('Final score',  summary.score ?? 0);
    addStat('Accuracy',     `${summary.accuracy ?? 0}%`);
    addStat('Best streak',  summary.bestStreak ?? 0);
    addStat('Words seen',   summary.totalWords ?? 0);
    addStat('Correct',      summary.totalCorrect ?? 0);

    if (summary.elapsedTime) {
      const secs = Math.round(summary.elapsedTime / 1000);
      addStat('Time', `${secs}s`);
    }

    wrap.appendChild(stats);

    // Mistakes list
    if (this._mistakes.length > 0) {
      wrap.appendChild(el('h3', 'quiz__summary-mistakes-title', 'Words to review:'));
      const list = el('ul', 'quiz__summary-mistakes');
      this._mistakes.forEach(({ term, correctLabel }) => {
        const item = el('li', 'quiz__summary-mistake');
        item.appendChild(el('span', 'quiz__summary-mistake-term', term));
        item.appendChild(el('span', 'quiz__summary-mistake-arrow', ' → '));
        item.appendChild(el('span', 'quiz__summary-mistake-answer', correctLabel));
        list.appendChild(item);
      });
      wrap.appendChild(list);
    } else {
      wrap.appendChild(el('p', 'quiz__summary-perfect', 'Perfect round — no mistakes!'));
    }

    // Play again button
    const replayBtn = el('button', 'quiz__replay', 'Play again');
    replayBtn.type  = 'button';
    replayBtn.addEventListener('click', () => this.start());
    wrap.appendChild(replayBtn);

    this._rootEl.appendChild(wrap);
  }

  // ── Error State ────────────────────────────────────────────────────────────

  /**
   * Render a simple error message inside the container.
   * @param {string} message
   */
  _showError(message) {
    if (!this._rootEl) return;
    this._rootEl.innerHTML = '';
    const errEl = el('div', 'quiz__error', `Error: ${message}`);
    this._rootEl.appendChild(errEl);
  }
}
