/**
 * TypingMode — keyboard-driven translation/typing game mode.
 *
 * Players are shown a word term and must type the translation.
 * Answers are checked with fuzzy matching; close answers get a yellow warning.
 *
 * Features:
 * - Two-tier hint system (sister language -> Russian)
 * - Letter-by-letter progressive reveal
 * - Progress bar and live score
 * - End-of-session summary with mistakes list
 */

import { fuzzyMatch, serbianCyrillicToLatin } from '../engine.js';
import { t, langLabel } from '../i18n.js';

// --- Constants ---------------------------------------------------------------

const FEEDBACK_CORRECT_DELAY_MS = 1000;

// --- TypingMode class --------------------------------------------------------

export class TypingMode {
  constructor(options = {}) {
    this._fuzzyMaxDistance = options.fuzzyMaxDistance ?? 2;

    this._container = null;
    this._engine = null;

    this._currentEntry = null;
    this._hintsShown = 0;
    this._lettersRevealed = 0;
    this._answered = false;
    this._closeAnswerGiven = false;

    this._score = 0;
    this._totalWords = 0;
    this._currentIndex = 0;
    this._mistakes = [];

    this._dom = {};
    this._onKeydown = this._handleKeydown.bind(this);
    this._autoAdvanceTimer = null;
  }

  // --- Public API ------------------------------------------------------------

  init(container, engine) {
    this._container = container;
    this._engine = engine;
  }

  start() {
    if (!this._container || !this._engine) {
      throw new Error('TypingMode: call init(container, engine) before start()');
    }

    this._score = 0;
    this._mistakes = [];
    this._currentIndex = 0;

    const firstEntry = this._engine.startSession();
    this._totalWords = this._engine.session?.words?.length ?? 0;

    this._render();
    this._loadWord(firstEntry);

    document.addEventListener('keydown', this._onKeydown);
  }

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

  // --- Rendering -------------------------------------------------------------

  _render() {
    this._container.innerHTML = '';
    // Fix: use classList.add instead of className clobber
    this._container.classList.add('typing');

    // Header: back button + progress + score
    const header = el('div', 'typing__header');

    const backBtn = el('button', 'typing__back-btn');
    backBtn.textContent = t.back_to_menu;
    backBtn.type = 'button';
    backBtn.addEventListener('click', () => this._engine.emit('mode:done'));
    header.appendChild(backBtn);

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

    // Word card
    const card = el('div', 'typing__card');
    const wordType = el('span', 'typing__word-type');
    const wordTerm = el('div', 'typing__word-term');
    wordTerm.setAttribute('aria-label', 'Word to translate');
    card.appendChild(wordType);
    card.appendChild(wordTerm);

    // Direction prompt: "Переведи на сербский:" + masked answer
    const promptArea = el('div', 'typing__prompt');
    const promptLabel = el('div', 'typing__prompt-label');
    const maskedHint = el('div', 'typing__masked-hint');
    promptArea.appendChild(promptLabel);
    promptArea.appendChild(maskedHint);

    // Hint area
    const hintArea = el('div', 'typing__hint-area');
    hintArea.setAttribute('aria-live', 'polite');

    // Input area
    const inputArea = el('div', 'typing__input-area');
    const input = el('input', 'typing__input');
    input.type = 'text';
    input.setAttribute('inputmode', 'text');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('aria-label', 'Your translation');
    input.setAttribute('placeholder', t.type_translation);

    const submitBtn = el('button', 'typing__btn typing__btn--submit');
    submitBtn.textContent = t.submit;
    submitBtn.type = 'button';

    inputArea.appendChild(input);
    inputArea.appendChild(submitBtn);

    // Feedback
    const feedback = el('div', 'typing__feedback');
    feedback.setAttribute('aria-live', 'assertive');
    feedback.setAttribute('role', 'status');

    // Action buttons
    const actions = el('div', 'typing__actions');

    const hintBtn = el('button', 'typing__btn typing__btn--hint');
    hintBtn.textContent = t.show_hint;
    hintBtn.type = 'button';

    const letterBtn = el('button', 'typing__btn typing__btn--letter');
    letterBtn.textContent = t.reveal_letter;
    letterBtn.type = 'button';

    const skipBtn = el('button', 'typing__btn typing__btn--skip');
    skipBtn.textContent = t.skip;
    skipBtn.type = 'button';

    actions.appendChild(hintBtn);
    actions.appendChild(letterBtn);
    actions.appendChild(skipBtn);

    // Assemble
    this._container.appendChild(header);
    this._container.appendChild(card);
    this._container.appendChild(promptArea);
    this._container.appendChild(hintArea);
    this._container.appendChild(inputArea);
    this._container.appendChild(feedback);
    this._container.appendChild(actions);

    this._dom = {
      progressFill, progressLabel, scoreEl,
      wordType, wordTerm, promptLabel, maskedHint, hintArea,
      input, submitBtn, feedback,
      hintBtn, letterBtn, skipBtn,
      actions, inputArea,
    };

    // Wire listeners
    submitBtn.addEventListener('click', () => this._handleSubmit());
    hintBtn.addEventListener('click', () => this._handleHint());
    letterBtn.addEventListener('click', () => this._handleLetterHint());
    skipBtn.addEventListener('click', () => this._handleSkip());
    input.addEventListener('input', () => this._clearFeedback());
  }

  // --- Word lifecycle --------------------------------------------------------

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

    this._currentIndex = this._engine.session?.currentIndex ?? this._currentIndex;
    this._updateProgress();

    const { wordType, wordTerm, promptLabel, maskedHint, hintArea, input, feedback, hintBtn, letterBtn, skipBtn, submitBtn, inputArea } = this._dom;

    wordType.textContent = entry.type ? entry.type.toUpperCase() : '';
    wordTerm.textContent = entry.term;

    // Show direction prompt and masked answer
    const answerLang = this._engine.hintLang;
    promptLabel.textContent = `${t.translate_to} ${langLabel(answerLang).toLowerCase()}:`;
    const expected = entry.translations[answerLang] || entry.term || '';
    maskedHint.textContent = expected.replace(/\S/g, '★');

    hintArea.innerHTML = '';
    feedback.textContent = '';
    feedback.className = 'typing__feedback';
    input.value = '';
    input.disabled = false;
    submitBtn.disabled = false;
    hintBtn.disabled = false;
    hintBtn.textContent = t.show_hint;
    letterBtn.disabled = false;
    skipBtn.disabled = false;
    inputArea.className = 'typing__input-area';

    input.focus();
  }

  _updateProgress() {
    const { progressFill, progressLabel, scoreEl } = this._dom;
    const idx = Math.min(this._currentIndex, this._totalWords);
    const pct = this._totalWords > 0 ? Math.round((idx / this._totalWords) * 100) : 0;

    progressFill.style.width = `${pct}%`;
    progressFill.setAttribute('aria-valuenow', pct);
    progressLabel.textContent = `${idx} / ${this._totalWords}`;
    scoreEl.textContent = `${t.score}: ${this._score}`;
  }

  // --- Answer handling -------------------------------------------------------

  _handleSubmit() {
    if (this._answered) return;
    const raw = this._dom.input.value.trim();
    if (!raw) {
      this._shakeFeedback(t.type_answer_first);
      return;
    }

    const answer = serbianCyrillicToLatin(raw);
    const result = this._engine.checkAnswer(answer);
    if (!result) return;

    const { correct, expected } = result;
    const match = fuzzyMatch(answer, expected, this._fuzzyMaxDistance);

    if (match.exact || correct) {
      this._onCorrect(expected);
    } else if (match.close && !this._closeAnswerGiven) {
      this._closeAnswerGiven = true;
      this._showCloseWarning(expected, raw);
    } else {
      this._onWrong(expected, raw);
    }
  }

  _onCorrect(_expected) {
    this._answered = true;
    this._score = this._engine.session?.score ?? this._score;

    this._flashInputArea('typing__input-area--correct');
    this._setFeedback('correct', t.correct_answer);

    this._dom.input.disabled = true;
    this._dom.submitBtn.disabled = true;
    this._dom.skipBtn.disabled = true;
    this._updateProgress();

    this._autoAdvanceTimer = setTimeout(() => this._advance(), FEEDBACK_CORRECT_DELAY_MS);
  }

  _onWrong(expected, given) {
    this._answered = true;

    this._flashInputArea('typing__input-area--wrong');
    this._setFeedback('wrong', `${t.answer_is} ${expected}`);

    this._dom.input.disabled = true;
    this._dom.submitBtn.disabled = true;

    const alreadyLogged = this._mistakes.some(m => m.term === this._currentEntry.term);
    if (!alreadyLogged) {
      this._mistakes.push({ term: this._currentEntry.term, expected, given });
    }
  }

  _showCloseWarning(expected, given) {
    this._flashInputArea('typing__input-area--close');
    this._setFeedback('close', `${t.close_answer} ${expected}`);
    this._dom.input.value = given;
    this._dom.input.focus();
  }

  // --- Hint handling ---------------------------------------------------------

  _handleHint() {
    if (this._hintsShown >= 2) return;
    const hint = this._engine.getHint();
    if (!hint) return;

    this._hintsShown++;
    const { hintArea, hintBtn } = this._dom;

    const hintEl = el('div', `typing__hint typing__hint--level-${hint.level}`);
    const hintLangEl = el('span', 'typing__hint-lang');
    hintLangEl.textContent = hint.lang.toUpperCase() + ': ';
    const hintText = el('span', 'typing__hint-text');
    hintText.textContent = hint.text;
    hintEl.appendChild(hintLangEl);
    hintEl.appendChild(hintText);
    hintArea.appendChild(hintEl);

    if (this._hintsShown >= 2) {
      hintBtn.disabled = true;
      hintBtn.textContent = t.no_more_hints;
    } else {
      hintBtn.textContent = t.show_russian_hint;
    }
  }

  _handleLetterHint() {
    if (!this._currentEntry) return;
    const entry = this._currentEntry;
    const hintLang = this._engine.hintLang;
    const expected = entry.translations[hintLang] || entry.term || '';

    this._lettersRevealed = Math.min(this._lettersRevealed + 1, expected.length);
    const revealed = expected.slice(0, this._lettersRevealed);
    const remaining = '_'.repeat(expected.length - this._lettersRevealed);

    const { hintArea, letterBtn } = this._dom;

    let letterRow = hintArea.querySelector('.typing__hint--letters');
    if (!letterRow) {
      letterRow = el('div', 'typing__hint typing__hint--letters');
      hintArea.appendChild(letterRow);
    }
    letterRow.textContent = `${revealed}${remaining}`;

    if (this._lettersRevealed >= expected.length) {
      letterBtn.disabled = true;
      letterBtn.textContent = t.all_revealed;
    }
  }

  _handleSkip() {
    if (this._answered) {
      this._advance();
      return;
    }
    const result = this._engine.checkAnswer('');
    const expected = result?.expected ?? '';
    this._onWrong(expected, '');
    this._dom.skipBtn.textContent = t.next_word;
  }

  // --- Navigation ------------------------------------------------------------

  _advance() {
    clearTimeout(this._autoAdvanceTimer);
    const next = this._engine.nextWord();
    if (next && typeof next === 'object' && !next.score) {
      this._loadWord(next);
    } else {
      this._showSummary(next);
    }
  }

  // --- Summary ---------------------------------------------------------------

  _showSummary(summary) {
    const s = summary && summary.score !== undefined
      ? summary
      : (this._engine ? this._engine.endSession() : null);

    clearTimeout(this._autoAdvanceTimer);
    document.removeEventListener('keydown', this._onKeydown);

    if (!this._container) return;
    this._container.innerHTML = '';
    this._container.className = 'screen screen--active';
    this._container.classList.add('typing', 'typing--summary');

    const title = el('h2', 'typing__summary-title');
    title.textContent = t.session_complete;

    const stats = el('div', 'typing__summary-stats');
    const statItems = [
      [t.score, s?.score ?? this._score],
      [t.correct, `${s?.totalCorrect ?? 0} / ${s?.totalAnswered ?? 0}`],
      [t.accuracy, `${s?.accuracy ?? 0}%`],
      [t.best_streak, s?.bestStreak ?? 0],
      [t.time, s ? _formatTime(s.elapsedTime) : '—'],
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
      mistakesTitle.textContent = t.review_these;
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
        if (m.given && m.given !== '') {
          const givenEl = el('span', 'typing__mistake-given');
          givenEl.textContent = ` (${t.you_said} ${m.given})`;
          item.appendChild(givenEl);
        }
        list.appendChild(item);
      }
      mistakesSection.appendChild(list);
      this._container.appendChild(mistakesSection);
    }

    // Play again button
    const playAgainBtn = el('button', 'typing__btn typing__btn--play-again');
    playAgainBtn.textContent = t.play_again;
    playAgainBtn.type = 'button';
    playAgainBtn.addEventListener('click', () => {
      this._container.innerHTML = '';
      this.start();
    });
    this._container.appendChild(playAgainBtn);

    // Back to menu
    const menuBtn = el('button', 'typing__btn typing__btn--menu');
    menuBtn.textContent = t.back_to_menu;
    menuBtn.type = 'button';
    menuBtn.addEventListener('click', () => this._engine.emit('mode:done'));
    this._container.appendChild(menuBtn);
  }

  // --- Keyboard handling -----------------------------------------------------

  _handleKeydown(e) {
    if (e.key !== 'Enter') return;
    if (document.activeElement === this._dom.submitBtn) return;

    if (this._answered) {
      this._advance();
    } else {
      this._handleSubmit();
    }
  }

  // --- UI helpers ------------------------------------------------------------

  _setFeedback(type, message) {
    const { feedback } = this._dom;
    feedback.className = `typing__feedback${type ? ` typing__feedback--${type}` : ''}`;
    feedback.textContent = message;
  }

  _clearFeedback() {
    if (!this._answered && !this._closeAnswerGiven) {
      this._dom.feedback.textContent = '';
      this._dom.feedback.className = 'typing__feedback';
      this._dom.inputArea.className = 'typing__input-area';
    }
  }

  _flashInputArea(modClass) {
    const { inputArea } = this._dom;
    inputArea.classList.add(modClass);
    const onEnd = () => {
      inputArea.classList.remove(modClass);
      inputArea.removeEventListener('animationend', onEnd);
    };
    inputArea.addEventListener('animationend', onEnd);
    setTimeout(() => inputArea.classList.remove(modClass), 800);
  }

  _shakeFeedback(message) {
    this._setFeedback('', message);
    this._dom.feedback.classList.add('typing__feedback--shake');
    const clean = () => this._dom.feedback.classList.remove('typing__feedback--shake');
    this._dom.feedback.addEventListener('animationend', clean, { once: true });
    setTimeout(clean, 600);
  }
}

// --- Module-level helpers ----------------------------------------------------

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function _formatTime(ms) {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
