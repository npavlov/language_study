/**
 * add-words.js — Add Words screen for Language Study
 *
 * Responsibilities:
 * - Single-word form with validation (duplicates checked against built-in + user words)
 * - Bulk add via textarea (one word per line)
 * - Import from .txt file via drag-and-drop or file picker
 * - User word list with Edit / Delete per item
 * - Export as JSON or .txt
 *
 * Storage: localStorage key 'user_words' — array of VocabularyEntry objects.
 *
 * All DOM is created programmatically. BEM class names from components.css throughout.
 * No framework, no CSS imports — vanilla ES module.
 */

import { t, fmt } from '../i18n.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'user_words';

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'sr', label: 'SR' },
];

// ─── Public helper functions ──────────────────────────────────────────────────

/**
 * Load user words from localStorage.
 * @returns {Array<Object>}
 */
export function loadUserWords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persist user words to localStorage.
 * @param {Array<Object>} words
 */
export function saveUserWords(words) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
}

/**
 * Combine built-in and user word arrays, user words last.
 * @param {Array<Object>} builtIn
 * @param {Array<Object>} userWords
 * @returns {Array<Object>}
 */
export function mergeWithBuiltIn(builtIn, userWords) {
  return [...builtIn, ...userWords];
}

// ─── AddWordsScreen ───────────────────────────────────────────────────────────

export class AddWordsScreen {
  constructor() {
    /** @type {HTMLElement|null} */
    this._container = null;

    /** @type {HTMLElement|null} */
    this._root = null;

    /** @type {Array<Object>} All built-in vocabulary entries (for dupe-checking) */
    this._builtInEntries = [];

    /** @type {Array<Object>} User-added words (mirrors localStorage) */
    this._userWords = [];

    /** @type {string} Active source language for the single-word form */
    this._activeLang = 'en';

    /** @type {Object|null} Entry currently being edited (null = add mode) */
    this._editingEntry = null;

    /** Refs to live DOM nodes */
    this._refs = {};

    // Drag-and-drop bound handlers (kept so they can be removed)
    this._onDragOver   = this._onDragOver.bind(this);
    this._onDragLeave  = this._onDragLeave.bind(this);
    this._onDrop       = this._onDrop.bind(this);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Bind the screen to a host container and supply built-in entries.
   * Call once before show().
   * @param {HTMLElement} container
   * @param {Array<Object>} builtInEntries
   */
  init(container, builtInEntries) {
    this._container     = container;
    this._builtInEntries = Array.isArray(builtInEntries) ? builtInEntries : [];
    this._userWords     = loadUserWords();

    this._root = this._buildUI();
    this._container.appendChild(this._root);
    this._renderWordList();
  }

  /** Update built-in entries (used when vocabulary is lazy-loaded). */
  updateBuiltIn(entries) {
    this._builtInEntries = Array.isArray(entries) ? entries : [];
  }

  /** Make the screen visible. */
  show() {
    if (this._container) this._container.classList.add('screen--active');
  }

  /** Hide the screen (DOM stays in place). */
  hide() {
    if (this._container) this._container.classList.remove('screen--active');
  }

  /** Tear down: remove DOM and event listeners. */
  destroy() {
    this._detachDropZoneListeners();
    if (this._root && this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }
    this._root      = null;
    this._refs      = {};
    this._container = null;
  }

  // ── UI Construction ─────────────────────────────────────────────────────────

  /** Build and return the entire screen root element. */
  _buildUI() {
    const root = el('div', 'add-words');

    // ── Section: Single word form ──────────────────────────────────────────
    root.appendChild(this._buildSingleWordSection());

    // ── Section: Bulk add ─────────────────────────────────────────────────
    root.appendChild(this._buildBulkSection());

    // ── Section: Import from file ──────────────────────────────────────────
    root.appendChild(this._buildImportSection());

    // ── Section: User word list + export ──────────────────────────────────
    root.appendChild(this._buildWordListSection());

    return root;
  }

  // ── Single-word form ───────────────────────────────────────────────────────

  _buildSingleWordSection() {
    const section = el('section', 'add-words__section card');

    section.appendChild(sectionTitle(t.add_word_title));

    // Error / success message area
    const feedback = el('p', 'add-words__feedback');
    feedback.hidden = true;

    // ── Word / phrase input ───────────────────────────────────────────────
    const termGroup = formGroup(t.word_phrase_label);
    const termInput = el('input', 'input');
    termInput.type        = 'text';
    termInput.placeholder = t.word_placeholder;
    termInput.required    = true;
    termGroup.appendChild(termInput);
    section.appendChild(termGroup);

    // ── Source language toggle ────────────────────────────────────────────
    const langGroup = formGroup(t.source_lang_label);
    const toggle    = el('div', 'toggle');

    const langBtns = LANGS.map(({ code, label }) => {
      const btn = el('button', 'toggle__option');
      btn.type        = 'button';
      btn.textContent = label;
      btn.dataset.lang = code;
      if (code === this._activeLang) btn.classList.add('toggle__option--active');
      btn.addEventListener('click', () => this._setActiveLang(code));
      toggle.appendChild(btn);
      return btn;
    });

    langGroup.appendChild(toggle);
    section.appendChild(langGroup);

    // ── Translation ───────────────────────────────────────────────────────
    const transGroup = formGroup(t.translation_label);
    const transInput = el('input', 'input');
    transInput.type        = 'text';
    transInput.placeholder = t.translation_placeholder;
    transGroup.appendChild(transInput);
    section.appendChild(transGroup);

    // ── Example sentence ──────────────────────────────────────────────────
    const exGroup = formGroup(t.example_label);
    const exInput = el('textarea', 'input textarea');
    exInput.placeholder = t.example_placeholder;
    exGroup.appendChild(exInput);
    section.appendChild(exGroup);

    // ── Category / tags ───────────────────────────────────────────────────
    const tagsGroup = formGroup(t.tags_label);
    const tagsInput = el('input', 'input');
    tagsInput.type        = 'text';
    tagsInput.placeholder = t.tags_placeholder;
    tagsGroup.appendChild(tagsInput);
    section.appendChild(tagsGroup);

    // ── Feedback + submit ─────────────────────────────────────────────────
    section.appendChild(feedback);

    const submitBtn = el('button', 'btn btn--primary');
    submitBtn.type        = 'button';
    submitBtn.textContent = t.add_btn;
    submitBtn.addEventListener('click', () => this._submitSingleWord());
    section.appendChild(submitBtn);

    // ── Cancel edit button (hidden unless editing) ────────────────────────
    const cancelBtn = el('button', 'btn btn--outline');
    cancelBtn.type        = 'button';
    cancelBtn.textContent = t.cancel_edit;
    cancelBtn.hidden      = true;
    cancelBtn.addEventListener('click', () => this._cancelEdit());
    section.appendChild(cancelBtn);

    // Stash refs
    Object.assign(this._refs, {
      termInput,
      langBtns,
      transInput,
      exInput,
      tagsInput,
      singleFeedback: feedback,
      submitBtn,
      cancelBtn,
    });

    return section;
  }

  // ── Bulk add ───────────────────────────────────────────────────────────────

  _buildBulkSection() {
    const section = el('section', 'add-words__section card');
    section.appendChild(sectionTitle(t.bulk_add_title));

    const hint = el('p', 'add-words__hint');
    hint.textContent = t.bulk_hint;
    section.appendChild(hint);

    const textarea = el('textarea', 'input textarea');
    textarea.rows        = 6;
    textarea.placeholder = t.bulk_placeholder;
    section.appendChild(textarea);

    const feedback = el('p', 'add-words__feedback');
    feedback.hidden = true;
    section.appendChild(feedback);

    const addAllBtn = el('button', 'btn btn--primary');
    addAllBtn.type        = 'button';
    addAllBtn.textContent = t.add_all;
    addAllBtn.addEventListener('click', () => {
      const lines = textarea.value
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
      this._bulkAdd(lines, feedback, () => { textarea.value = ''; });
    });
    section.appendChild(addAllBtn);

    return section;
  }

  // ── Import from file ───────────────────────────────────────────────────────

  _buildImportSection() {
    const section = el('section', 'add-words__section card');
    section.appendChild(sectionTitle(t.import_title));

    const hint = el('p', 'add-words__hint');
    hint.textContent = t.import_hint;
    section.appendChild(hint);

    const dropZone = el('div', 'drop-zone');
    dropZone.setAttribute('role', 'button');
    dropZone.setAttribute('tabindex', '0');

    const dropLabel = el('span', 'drop-zone__label');
    dropLabel.textContent = t.drop_label;
    dropZone.appendChild(dropLabel);

    const fileInput = el('input', 'add-words__file-input');
    fileInput.type   = 'file';
    fileInput.accept = '.txt,text/plain';
    fileInput.style.display = 'none';

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });

    // Drag-and-drop listeners (attached to dropZone, kept for removal)
    this._dropZoneEl = dropZone;
    dropZone.addEventListener('dragover',  this._onDragOver);
    dropZone.addEventListener('dragleave', this._onDragLeave);
    dropZone.addEventListener('drop',      this._onDrop);

    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) this._importFile(file, importFeedback);
      fileInput.value = '';
    });

    section.appendChild(dropZone);
    section.appendChild(fileInput);

    const importFeedback = el('p', 'add-words__feedback');
    importFeedback.hidden = true;
    section.appendChild(importFeedback);

    // Stash for drag handlers
    this._refs.importFeedback = importFeedback;

    return section;
  }

  // ── User word list + export ────────────────────────────────────────────────

  _buildWordListSection() {
    const section = el('section', 'add-words__section card');

    // Header row with title + export buttons
    const header = el('div', 'add-words__list-header');

    const titleEl = el('h2', 'add-words__section-title');
    titleEl.textContent = t.your_words;
    header.appendChild(titleEl);

    const exportRow = el('div', 'add-words__export-row');

    const exportJsonBtn = el('button', 'btn btn--outline btn--sm');
    exportJsonBtn.type        = 'button';
    exportJsonBtn.textContent = t.export_json;
    exportJsonBtn.addEventListener('click', () => this._exportJson());
    exportRow.appendChild(exportJsonBtn);

    const exportTxtBtn = el('button', 'btn btn--outline btn--sm');
    exportTxtBtn.type        = 'button';
    exportTxtBtn.textContent = t.export_txt;
    exportTxtBtn.addEventListener('click', () => this._exportTxt());
    exportRow.appendChild(exportTxtBtn);

    header.appendChild(exportRow);
    section.appendChild(header);

    // Empty-state message
    const emptyMsg = el('p', 'add-words__empty');
    emptyMsg.textContent = t.no_user_words;

    // Word list <ul>
    const wordList = el('ul', 'word-list');

    section.appendChild(emptyMsg);
    section.appendChild(wordList);

    Object.assign(this._refs, { wordList, emptyMsg });

    return section;
  }

  // ── Word list rendering ────────────────────────────────────────────────────

  /** Re-render the word list from this._userWords. */
  _renderWordList() {
    const { wordList, emptyMsg } = this._refs;
    if (!wordList) return;

    // Clear existing items
    wordList.textContent = '';

    if (this._userWords.length === 0) {
      emptyMsg.hidden   = false;
      wordList.hidden   = true;
      return;
    }

    emptyMsg.hidden   = true;
    wordList.hidden   = false;

    for (const entry of this._userWords) {
      wordList.appendChild(this._buildWordListItem(entry));
    }
  }

  /**
   * Build a single <li> for the word list.
   * @param {Object} entry
   * @returns {HTMLLIElement}
   */
  _buildWordListItem(entry) {
    const li = el('li', 'word-list__item');
    li.dataset.id = entry.id;

    // Term + badge
    const termWrap = el('span', 'word-list__term-wrap');

    const termSpan = el('span', 'word-list__term');
    termSpan.textContent = entry.term;
    termWrap.appendChild(termSpan);

    const badge = el('span', 'badge badge--user');
    badge.textContent = t.user_badge;
    termWrap.appendChild(badge);

    // Optional translation snippet
    const langCode = entry.source_language === 'en' ? 'sr' : 'en';
    const trans    = entry.translations && entry.translations[langCode];
    if (trans) {
      const transSpan = el('span', 'word-list__translation');
      transSpan.textContent = ` — ${trans}`;
      termWrap.appendChild(transSpan);
    }

    li.appendChild(termWrap);

    // Edit / Delete actions
    const actions = el('div', 'word-list__actions');

    const editBtn = el('button', 'btn btn--outline btn--sm');
    editBtn.type        = 'button';
    editBtn.textContent = t.edit_btn;
    editBtn.addEventListener('click', () => this._startEdit(entry));
    actions.appendChild(editBtn);

    const deleteBtn = el('button', 'btn btn--danger btn--sm');
    deleteBtn.type        = 'button';
    deleteBtn.textContent = t.delete_btn;
    deleteBtn.addEventListener('click', () => this._deleteEntry(entry.id));
    actions.appendChild(deleteBtn);

    li.appendChild(actions);
    return li;
  }

  // ── Single-word form logic ─────────────────────────────────────────────────

  /** Set the active source language and update toggle button states. */
  _setActiveLang(code) {
    this._activeLang = code;
    for (const btn of this._refs.langBtns) {
      btn.classList.toggle('toggle__option--active', btn.dataset.lang === code);
    }
  }

  /** Read the single-word form, validate, and add or save the entry. */
  _submitSingleWord() {
    const { termInput, transInput, exInput, tagsInput, singleFeedback } = this._refs;

    const term  = termInput.value.trim();
    const trans = transInput.value.trim();
    const ex    = exInput.value.trim();
    const tags  = tagsInput.value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    // Validation
    if (!term) {
      this._showFeedback(singleFeedback, t.enter_word_error, 'error');
      termInput.classList.add('input--error');
      termInput.focus();
      return;
    }
    termInput.classList.remove('input--error');

    // Duplicate check (skip check when editing the same entry)
    const termLower = term.toLowerCase();
    const isDupe = this._isDuplicate(termLower, this._editingEntry ? this._editingEntry.id : null);
    if (isDupe) {
      this._showFeedback(singleFeedback, fmt('already_exists', { term }), 'error');
      return;
    }

    if (this._editingEntry) {
      // ── Update existing entry ─────────────────────────────────────────
      const updated = { ...this._editingEntry };
      updated.term = term;
      updated.source_language = this._activeLang;
      updated.type = term.includes(' ') ? 'phrase' : 'word';

      const otherLang = this._activeLang === 'en' ? 'sr' : 'en';
      updated.translations = {
        en:  this._activeLang === 'en' ? null : (trans || null),
        sr:  this._activeLang === 'sr' ? null : (trans || null),
        ru:  null,
      };
      // Restore whichever side is the source to null
      updated.translations[this._activeLang] = null;
      if (trans) updated.translations[otherLang] = trans;

      updated.examples = {
        en: this._activeLang === 'en' && ex ? [ex] : (this._editingEntry.examples.en || []),
        sr: this._activeLang === 'sr' && ex ? [ex] : (this._editingEntry.examples.sr || []),
        ru: this._editingEntry.examples.ru || [],
      };
      updated.tags = tags;

      this._userWords = this._userWords.map(w => w.id === updated.id ? updated : w);
      saveUserWords(this._userWords);
      this._cancelEdit();
      this._renderWordList();
      this._showFeedback(singleFeedback, fmt('word_updated', { term }), 'success');
    } else {
      // ── Add new entry ─────────────────────────────────────────────────
      const entry = this._buildEntry(term, this._activeLang, trans, ex, tags);
      this._userWords.push(entry);
      saveUserWords(this._userWords);
      this._renderWordList();
      this._clearSingleForm();
      this._showFeedback(singleFeedback, fmt('word_added', { term }), 'success');
    }
  }

  /** Clear all single-word form fields. */
  _clearSingleForm() {
    const { termInput, transInput, exInput, tagsInput } = this._refs;
    termInput.value  = '';
    transInput.value = '';
    exInput.value    = '';
    tagsInput.value  = '';
    termInput.classList.remove('input--error');
  }

  // ── Edit / Delete ──────────────────────────────────────────────────────────

  /**
   * Populate the single-word form for editing an existing user entry.
   * @param {Object} entry
   */
  _startEdit(entry) {
    this._editingEntry = entry;

    const { termInput, transInput, exInput, tagsInput, submitBtn, cancelBtn, singleFeedback } = this._refs;

    termInput.value  = entry.term;
    this._setActiveLang(entry.source_language || 'en');

    const otherLang = (entry.source_language === 'en') ? 'sr' : 'en';
    transInput.value = (entry.translations && entry.translations[otherLang]) || '';

    const exArr = (entry.examples && entry.examples[entry.source_language]) || [];
    exInput.value   = exArr[0] || '';

    tagsInput.value = (entry.tags || []).join(', ');

    submitBtn.textContent = t.save_changes;
    cancelBtn.hidden      = false;

    singleFeedback.hidden = true;

    // Scroll to form
    termInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    termInput.focus();
  }

  /** Reset the single-word form to add-mode. */
  _cancelEdit() {
    this._editingEntry          = null;
    this._refs.submitBtn.textContent = t.add_btn;
    this._refs.cancelBtn.hidden      = true;
    this._clearSingleForm();
  }

  /**
   * Remove a user word by id.
   * @param {string} id
   */
  _deleteEntry(id) {
    const entry = this._userWords.find(w => w.id === id);
    if (!entry) return;

    const confirmed = window.confirm(fmt('delete_confirm', { term: entry.term }));
    if (!confirmed) return;

    this._userWords = this._userWords.filter(w => w.id !== id);
    saveUserWords(this._userWords);
    this._renderWordList();

    // If we were editing this entry, cancel the edit
    if (this._editingEntry && this._editingEntry.id === id) {
      this._cancelEdit();
    }
  }

  // ── Bulk add ───────────────────────────────────────────────────────────────

  /**
   * Add multiple words from an array of term strings.
   * @param {string[]} lines
   * @param {HTMLElement} feedbackEl
   * @param {Function} onSuccess
   */
  _bulkAdd(lines, feedbackEl, onSuccess) {
    if (lines.length === 0) {
      this._showFeedback(feedbackEl, t.nothing_to_add, 'error');
      return;
    }

    let added   = 0;
    let skipped = 0;

    for (const term of lines) {
      if (!term) continue;
      const termLower = term.toLowerCase();
      if (this._isDuplicate(termLower, null)) {
        skipped++;
        continue;
      }
      // Infer language: if term contains Cyrillic → SR, else EN
      const lang  = /[\u0400-\u04FF]/.test(term) ? 'sr' : 'en';
      const entry = this._buildEntry(term, lang, '', '', []);
      this._userWords.push(entry);
      added++;
    }

    if (added > 0) {
      saveUserWords(this._userWords);
      this._renderWordList();
      if (onSuccess) onSuccess();
    }

    const msg = added > 0
      ? fmt('words_added_result', { added, skipped })
      : fmt('words_all_exist', { count: skipped });
    this._showFeedback(feedbackEl, msg, added > 0 ? 'success' : 'error');
  }

  // ── File import ────────────────────────────────────────────────────────────

  /**
   * Read a File object and bulk-add its lines.
   * @param {File} file
   * @param {HTMLElement} feedbackEl
   */
  _importFile(file, feedbackEl) {
    if (!file.name.endsWith('.txt') && file.type !== 'text/plain') {
      this._showFeedback(feedbackEl, t.only_txt_error, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = (e.target.result || '')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
      this._bulkAdd(lines, feedbackEl, null);
    };
    reader.onerror = () => {
      this._showFeedback(feedbackEl, t.file_read_error, 'error');
    };
    reader.readAsText(file, 'utf-8');
  }

  // ── Drag-and-drop handlers ────────────────────────────────────────────────

  _onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (this._dropZoneEl) this._dropZoneEl.classList.add('drop-zone--dragover');
  }

  _onDragLeave() {
    if (this._dropZoneEl) this._dropZoneEl.classList.remove('drop-zone--dragover');
  }

  _onDrop(e) {
    e.preventDefault();
    if (this._dropZoneEl) this._dropZoneEl.classList.remove('drop-zone--dragover');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) this._importFile(file, this._refs.importFeedback);
  }

  _detachDropZoneListeners() {
    if (this._dropZoneEl) {
      this._dropZoneEl.removeEventListener('dragover',  this._onDragOver);
      this._dropZoneEl.removeEventListener('dragleave', this._onDragLeave);
      this._dropZoneEl.removeEventListener('drop',      this._onDrop);
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  _exportJson() {
    if (this._userWords.length === 0) {
      alert(t.no_words_export);
      return;
    }
    const blob = new Blob(
      [JSON.stringify({ schema_version: '1.0', entries: this._userWords }, null, 2)],
      { type: 'application/json' }
    );
    triggerDownload(blob, 'user-words.json');
  }

  _exportTxt() {
    if (this._userWords.length === 0) {
      alert(t.no_words_export);
      return;
    }
    const lines = this._userWords.map(w => w.term).join('\n');
    const blob  = new Blob([lines], { type: 'text/plain' });
    triggerDownload(blob, 'user-words.txt');
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  /**
   * Check whether a term (lower-cased) already exists in built-in or user words.
   * @param {string} termLower
   * @param {string|null} excludeId  — skip this id when editing
   * @returns {boolean}
   */
  _isDuplicate(termLower, excludeId) {
    const inBuiltIn = this._builtInEntries.some(
      e => e.term && e.term.toLowerCase() === termLower
    );
    if (inBuiltIn) return true;

    const inUser = this._userWords.some(
      e => e.term && e.term.toLowerCase() === termLower && e.id !== excludeId
    );
    return inUser;
  }

  /**
   * Build a new VocabularyEntry object matching the project schema.
   * @param {string} term
   * @param {string} lang  'en' | 'sr'
   * @param {string} trans
   * @param {string} example
   * @param {string[]} tags
   * @returns {Object}
   */
  _buildEntry(term, lang, trans, example, tags) {
    const id   = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const type = term.includes(' ') ? 'phrase' : 'word';
    const date = new Date().toISOString().slice(0, 10);

    const otherLang = lang === 'en' ? 'sr' : 'en';

    const translations = { en: null, sr: null, ru: null };
    if (trans) translations[otherLang] = trans;

    const examples = { en: [], sr: [], ru: [] };
    if (example) examples[lang].push(example);

    return {
      id,
      term,
      source_language: lang,
      type,
      translations,
      examples,
      explanation:    null,
      pronunciation:  null,
      category:       tags.length > 0 ? tags[0] : null,
      tags,
      difficulty:     3,
      enriched:       false,
      metadata: {
        date_added:  date,
        source_file: null,
        reviewed:    false,
      },
    };
  }

  /**
   * Show a transient feedback message.
   * @param {HTMLElement} el
   * @param {string} message
   * @param {'success'|'error'} type
   */
  _showFeedback(feedbackEl, message, type) {
    feedbackEl.textContent = message;
    feedbackEl.className   = `add-words__feedback add-words__feedback--${type}`;
    feedbackEl.hidden      = false;

    // Auto-hide after 4 s
    clearTimeout(feedbackEl._hideTimer);
    feedbackEl._hideTimer = setTimeout(() => { feedbackEl.hidden = true; }, 4000);
  }
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Create an element with one or more BEM class names and optional text.
 * @param {string} tag
 * @param {string} className  space-separated class names
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  for (const cls of className.split(' ')) {
    if (cls) node.classList.add(cls);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Build a .form-group wrapper with a label.
 * @param {string} labelText
 * @returns {HTMLElement}  (the group div, with label already appended)
 */
function formGroup(labelText) {
  const group = el('div', 'form-group');
  const label = el('label', 'form-group__label');
  label.textContent = labelText;
  group.appendChild(label);
  return group;
}

/**
 * Build a section <h2> heading.
 * @param {string} text
 * @returns {HTMLElement}
 */
function sectionTitle(text) {
  const h = el('h2', 'add-words__section-title');
  h.textContent = text;
  return h;
}

/**
 * Trigger a file download from a Blob.
 * @param {Blob} blob
 * @param {string} filename
 */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
