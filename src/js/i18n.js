/**
 * Internationalization — UI strings in Russian, English, and Serbian.
 * Active language is determined by the `uiLanguage` setting in localStorage.
 *
 * Usage:
 *   import { t, fmt, langLabel, uiLang } from '../i18n.js';
 *   t.back_to_menu          // simple string
 *   fmt('already_exists', { term })  // interpolated string
 */

// ---------------------------------------------------------------------------
// Translation maps
// ---------------------------------------------------------------------------

const translations = {
  // ── Russian (default) ───────────────────────────────────────────────────
  ru: {
    // Common
    back_to_menu: 'В меню',
    session_complete: 'Сессия завершена!',
    round_complete: 'Раунд завершён!',
    play_again: 'Играть ещё',
    score: 'Очки',
    accuracy: 'Точность',
    time: 'Время',
    best_streak: 'Лучшая серия',
    correct: 'Правильно',

    // Flashcards
    know: 'Знаю',
    dont_know: 'Не знаю',
    tap_to_reveal: 'Нажми, чтобы увидеть подсказку',
    tap_for_russian: 'Нажми ещё для русской подсказки',
    known: 'Знаю',
    unknown: 'Не знаю',
    review_mistakes: 'Повторить ошибки',
    done: 'Готово',

    // Quiz
    question: 'Вопрос',
    final_score: 'Итоговый счёт',
    words_seen: 'Слов всего',
    words_to_review: 'Слова для повторения:',
    perfect_round: 'Идеальный раунд — без ошибок!',

    // Typing
    translate_to: 'Переведи на',
    type_translation: 'Напиши перевод…',
    submit: 'Ответ',
    hint: 'Подсказка',
    no_more_hints: 'Подсказок нет',
    skip: 'Пропустить',
    next_word: 'Дальше',
    correct_answer: 'Правильно! ✓',
    answer_is: 'Ответ:',
    close_answer: 'Почти! Ответ:',
    type_answer_first: 'Сначала напиши ответ.',
    review_these: 'Повтори эти слова:',
    you_said: 'ты написал:',
    n_letters: 'букв',

    // Match
    round: 'Раунд',
    wrong_attempts: 'Ошибки',
    pairs_matched: 'Пар найдено',
    next_round: 'Следующий раунд',

    // Menu / Settings
    words_available: 'слов доступно',
    repeat_forgotten: 'Повторять забытые слова',
    ui_language: 'Язык интерфейса',
    lang_en: 'Английский',
    lang_sr: 'Сербский',
    lang_ru: 'Русский',

    // Menu UI
    app_subtitle: 'Учи английский и сербский в игровой форме',
    direction_label: 'Направление',
    game_mode_label: 'Режим игры',
    mode_flashcards: 'Карточки',
    mode_flashcards_desc: 'Переворачивай и запоминай',
    mode_quiz: 'Тест',
    mode_quiz_desc: 'Выбери правильный ответ',
    mode_typing: 'Ввод',
    mode_typing_desc: 'Напиши перевод',
    mode_match: 'Пары',
    mode_match_desc: 'Соедини слово с переводом',
    days: 'дней',
    learned: 'изучено',
    mastered_stat: 'освоено',
    start: 'Начать',
    loading: 'Загрузка…',
    export_excel: 'Экспорт в Excel',

    // Tab bar
    tab_game: 'Игра',
    tab_stats: 'Статистика',
    tab_words: 'Слова',

    // Error
    error_loading: 'Ошибка загрузки',

    // Stats
    stats_title: 'Статистика',
    overall_progress: 'Общий прогресс',
    words_mastered: 'слов освоено',
    level_new: 'Новые',
    level_learning: 'Учу',
    level_known: 'Знаю',
    level_mastered: 'Освоено',
    overall_accuracy: 'общая точность',
    last_sessions: 'Последние сессии',
    bar_chart_label: 'График точности последних сессий',
    no_sessions: 'Сессий пока нет.',
    streak: 'Серия',
    last_session: 'Последняя сессия',
    words_to_review_heading: 'Слова для повторения',
    no_words_review: 'Все слова освоены — отлично!',
    practice_these: 'Повторить',
    recent_sessions: 'Последние сессии',
    col_date: 'Дата',
    col_score: 'Очки',
    col_duration: 'Время',
    actions: 'Действия',
    export_json: 'Экспорт JSON',
    reset_progress: 'Сбросить прогресс',
    reset_confirm: 'Сбросить весь прогресс? Это нельзя отменить.',
    months: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
    time_m: 'м',
    time_s: 'с',

    // Add words
    add_word_title: 'Добавить слово или фразу',
    word_phrase_label: 'Слово / фраза *',
    word_placeholder: 'Введи слово или фразу…',
    source_lang_label: 'Язык слова',
    translation_label: 'Перевод (необязательно)',
    translation_placeholder: 'Введи перевод…',
    example_label: 'Пример предложения (необязательно)',
    example_placeholder: 'Введи пример…',
    tags_label: 'Категория / теги (через запятую)',
    tags_placeholder: 'напр. путешествия, сущ., формальное',
    add_btn: 'Добавить',
    cancel_edit: 'Отменить редактирование',
    save_changes: 'Сохранить',
    bulk_add_title: 'Добавить несколько',
    bulk_hint: 'Вставь по одному слову на строку. Дубликаты будут пропущены.',
    bulk_placeholder: 'слово раз\nслово два\nфраза три',
    add_all: 'Добавить все',
    import_title: 'Импорт из файла',
    import_hint: 'Перетащи .txt файл (по слову на строку) или нажми для выбора.',
    drop_label: 'Перетащи .txt файл или нажми для выбора',
    your_words: 'Твои слова',
    export_txt: 'Экспорт .txt',
    no_user_words: 'Слов пока нет. Добавь первое!',
    user_badge: 'своё',
    edit_btn: 'Ред.',
    delete_btn: 'Удалить',
    enter_word_error: 'Введи слово или фразу.',
    already_exists: '«{term}» уже есть в словаре.',
    word_updated: '«{term}» обновлено.',
    word_added: '«{term}» добавлено.',
    nothing_to_add: 'Нечего добавлять — поле пустое.',
    words_added_result: 'Добавлено: {added}, пропущено: {skipped}.',
    words_all_exist: 'Все {count} уже есть — ничего не добавлено.',
    only_txt_error: 'Поддерживаются только .txt файлы.',
    file_read_error: 'Не удалось прочитать файл.',
    no_words_export: 'Нет слов для экспорта.',
    delete_confirm: 'Удалить «{term}»?',
  },

  // ── English ─────────────────────────────────────────────────────────────
  en: {
    back_to_menu: 'Menu',
    session_complete: 'Session complete!',
    round_complete: 'Round complete!',
    play_again: 'Play again',
    score: 'Score',
    accuracy: 'Accuracy',
    time: 'Time',
    best_streak: 'Best streak',
    correct: 'Correct',

    know: 'Know',
    dont_know: "Don't know",
    tap_to_reveal: 'Tap to reveal hint',
    tap_for_russian: 'Tap again for Russian hint',
    known: 'Known',
    unknown: 'Unknown',
    review_mistakes: 'Review mistakes',
    done: 'Done',

    question: 'Question',
    final_score: 'Final score',
    words_seen: 'Words seen',
    words_to_review: 'Words to review:',
    perfect_round: 'Perfect round — no mistakes!',

    translate_to: 'Translate to',
    type_translation: 'Type translation…',
    submit: 'Submit',
    hint: 'Hint',
    no_more_hints: 'No more hints',
    skip: 'Skip',
    next_word: 'Next',
    correct_answer: 'Correct! ✓',
    answer_is: 'Answer:',
    close_answer: 'Close! Answer:',
    type_answer_first: 'Type your answer first.',
    review_these: 'Review these words:',
    you_said: 'you typed:',
    n_letters: 'letters',

    round: 'Round',
    wrong_attempts: 'Wrong',
    pairs_matched: 'Pairs matched',
    next_round: 'Next round',

    words_available: 'words available',
    repeat_forgotten: 'Repeat forgotten words',
    ui_language: 'Interface language',
    lang_en: 'English',
    lang_sr: 'Serbian',
    lang_ru: 'Russian',

    app_subtitle: 'Learn English and Serbian through games',
    direction_label: 'Direction',
    game_mode_label: 'Game mode',
    mode_flashcards: 'Flashcards',
    mode_flashcards_desc: 'Flip and memorize',
    mode_quiz: 'Quiz',
    mode_quiz_desc: 'Pick the right answer',
    mode_typing: 'Typing',
    mode_typing_desc: 'Type the translation',
    mode_match: 'Match',
    mode_match_desc: 'Match word with translation',
    days: 'days',
    learned: 'learned',
    mastered_stat: 'mastered',
    start: 'Start',
    loading: 'Loading…',
    export_excel: 'Export to Excel',

    tab_game: 'Game',
    tab_stats: 'Stats',
    tab_words: 'Words',

    error_loading: 'Loading error',

    stats_title: 'Statistics',
    overall_progress: 'Overall progress',
    words_mastered: 'words mastered',
    level_new: 'New',
    level_learning: 'Learning',
    level_known: 'Known',
    level_mastered: 'Mastered',
    overall_accuracy: 'overall accuracy',
    last_sessions: 'Last sessions',
    bar_chart_label: 'Bar chart of recent session accuracy',
    no_sessions: 'No sessions recorded yet.',
    streak: 'Streak',
    last_session: 'Last session',
    words_to_review_heading: 'Words to review',
    no_words_review: 'No words need review — great work!',
    practice_these: 'Practice these',
    recent_sessions: 'Recent sessions',
    col_date: 'Date',
    col_score: 'Score',
    col_duration: 'Duration',
    actions: 'Actions',
    export_json: 'Export JSON',
    reset_progress: 'Reset progress',
    reset_confirm: 'Reset all progress? This cannot be undone.',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    time_m: 'm',
    time_s: 's',

    add_word_title: 'Add a word or phrase',
    word_phrase_label: 'Word / phrase *',
    word_placeholder: 'Enter word or phrase…',
    source_lang_label: 'Source language',
    translation_label: 'Translation (optional)',
    translation_placeholder: 'Enter translation…',
    example_label: 'Example sentence (optional)',
    example_placeholder: 'Enter an example sentence…',
    tags_label: 'Category / tags (comma-separated)',
    tags_placeholder: 'e.g. travel, noun, formal',
    add_btn: 'Add',
    cancel_edit: 'Cancel edit',
    save_changes: 'Save changes',
    bulk_add_title: 'Bulk add',
    bulk_hint: 'Paste one word or phrase per line. Duplicates will be skipped.',
    bulk_placeholder: 'word one\nword two\nphrase three',
    add_all: 'Add all',
    import_title: 'Import from file',
    import_hint: 'Drop a .txt file (one word per line) or click to pick a file.',
    drop_label: 'Drop .txt file here or click to browse',
    your_words: 'Your words',
    export_txt: 'Export .txt',
    no_user_words: 'No user words yet. Add one above!',
    user_badge: 'user',
    edit_btn: 'Edit',
    delete_btn: 'Delete',
    enter_word_error: 'Please enter a word or phrase.',
    already_exists: '"{term}" already exists in the vocabulary.',
    word_updated: '"{term}" updated.',
    word_added: '"{term}" added.',
    nothing_to_add: 'Nothing to add — textarea is empty.',
    words_added_result: 'Added: {added}, skipped: {skipped}.',
    words_all_exist: 'All {count} already exist — nothing added.',
    only_txt_error: 'Only .txt files are supported.',
    file_read_error: 'Could not read the file.',
    no_words_export: 'No user words to export.',
    delete_confirm: 'Delete "{term}"?',
  },

  // ── Serbian ─────────────────────────────────────────────────────────────
  sr: {
    back_to_menu: 'Meni',
    session_complete: 'Sesija završena!',
    round_complete: 'Runda završena!',
    play_again: 'Igraj ponovo',
    score: 'Poeni',
    accuracy: 'Tačnost',
    time: 'Vreme',
    best_streak: 'Najbolji niz',
    correct: 'Tačno',

    know: 'Znam',
    dont_know: 'Ne znam',
    tap_to_reveal: 'Tapni za pomoć',
    tap_for_russian: 'Tapni ponovo za ruski prevod',
    known: 'Znam',
    unknown: 'Ne znam',
    review_mistakes: 'Ponovi greške',
    done: 'Gotovo',

    question: 'Pitanje',
    final_score: 'Krajnji rezultat',
    words_seen: 'Reči ukupno',
    words_to_review: 'Reči za ponavljanje:',
    perfect_round: 'Savršena runda — bez grešaka!',

    translate_to: 'Prevedi na',
    type_translation: 'Napiši prevod…',
    submit: 'Odgovor',
    hint: 'Pomoć',
    no_more_hints: 'Nema više pomoći',
    skip: 'Preskoči',
    next_word: 'Dalje',
    correct_answer: 'Tačno! ✓',
    answer_is: 'Odgovor:',
    close_answer: 'Blizu! Odgovor:',
    type_answer_first: 'Prvo napiši odgovor.',
    review_these: 'Ponovi ove reči:',
    you_said: 'napisao si:',
    n_letters: 'slova',

    round: 'Runda',
    wrong_attempts: 'Greške',
    pairs_matched: 'Parova spojeno',
    next_round: 'Sledeća runda',

    words_available: 'reči dostupno',
    repeat_forgotten: 'Ponavljaj zaboravljene reči',
    ui_language: 'Jezik interfejsa',
    lang_en: 'Engleski',
    lang_sr: 'Srpski',
    lang_ru: 'Ruski',

    app_subtitle: 'Uči engleski i srpski kroz igre',
    direction_label: 'Smer',
    game_mode_label: 'Režim igre',
    mode_flashcards: 'Kartice',
    mode_flashcards_desc: 'Okreni i zapamti',
    mode_quiz: 'Kviz',
    mode_quiz_desc: 'Izaberi tačan odgovor',
    mode_typing: 'Unos',
    mode_typing_desc: 'Napiši prevod',
    mode_match: 'Parovi',
    mode_match_desc: 'Spoji reč sa prevodom',
    days: 'dana',
    learned: 'naučeno',
    mastered_stat: 'savladano',
    start: 'Počni',
    loading: 'Učitavanje…',
    export_excel: 'Izvoz u Excel',

    tab_game: 'Igra',
    tab_stats: 'Statistika',
    tab_words: 'Reči',

    error_loading: 'Greška učitavanja',

    stats_title: 'Statistika',
    overall_progress: 'Ukupan napredak',
    words_mastered: 'reči savladano',
    level_new: 'Novo',
    level_learning: 'Učim',
    level_known: 'Znam',
    level_mastered: 'Savladano',
    overall_accuracy: 'ukupna tačnost',
    last_sessions: 'Poslednje sesije',
    bar_chart_label: 'Grafik tačnosti poslednjih sesija',
    no_sessions: 'Još nema sesija.',
    streak: 'Niz',
    last_session: 'Poslednja sesija',
    words_to_review_heading: 'Reči za ponavljanje',
    no_words_review: 'Sve reči savladane — odlično!',
    practice_these: 'Vežbaj ove',
    recent_sessions: 'Poslednje sesije',
    col_date: 'Datum',
    col_score: 'Poeni',
    col_duration: 'Trajanje',
    actions: 'Radnje',
    export_json: 'Izvoz JSON',
    reset_progress: 'Resetuj napredak',
    reset_confirm: 'Resetovati sav napredak? Ovo se ne može poništiti.',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Avg', 'Sep', 'Okt', 'Nov', 'Dec'],
    time_m: 'm',
    time_s: 's',

    add_word_title: 'Dodaj reč ili frazu',
    word_phrase_label: 'Reč / fraza *',
    word_placeholder: 'Unesi reč ili frazu…',
    source_lang_label: 'Jezik reči',
    translation_label: 'Prevod (opciono)',
    translation_placeholder: 'Unesi prevod…',
    example_label: 'Primer rečenice (opciono)',
    example_placeholder: 'Unesi primer…',
    tags_label: 'Kategorija / tagovi (razdvojeni zarezom)',
    tags_placeholder: 'npr. putovanje, imenica, formalno',
    add_btn: 'Dodaj',
    cancel_edit: 'Otkaži izmenu',
    save_changes: 'Sačuvaj',
    bulk_add_title: 'Dodaj više',
    bulk_hint: 'Unesi po jednu reč u redu. Duplikati će biti preskočeni.',
    bulk_placeholder: 'reč jedan\nreč dva\nfraza tri',
    add_all: 'Dodaj sve',
    import_title: 'Uvoz iz fajla',
    import_hint: 'Prevuci .txt fajl (jedna reč po redu) ili klikni za izbor.',
    drop_label: 'Prevuci .txt fajl ili klikni za pretragu',
    your_words: 'Tvoje reči',
    export_txt: 'Izvoz .txt',
    no_user_words: 'Još nema reči. Dodaj prvu!',
    user_badge: 'svoje',
    edit_btn: 'Uredi',
    delete_btn: 'Obriši',
    enter_word_error: 'Unesi reč ili frazu.',
    already_exists: '„{term}" već postoji u rečniku.',
    word_updated: '„{term}" ažurirano.',
    word_added: '„{term}" dodato.',
    nothing_to_add: 'Nema šta da se doda — polje je prazno.',
    words_added_result: 'Dodato: {added}, preskočeno: {skipped}.',
    words_all_exist: 'Svih {count} već postoji — ništa nije dodato.',
    only_txt_error: 'Podržani su samo .txt fajlovi.',
    file_read_error: 'Nije moguće pročitati fajl.',
    no_words_export: 'Nema reči za izvoz.',
    delete_confirm: 'Obrisati „{term}"?',
  },
};

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

function getCurrentUiLang() {
  try {
    const raw = localStorage.getItem('ls_settings');
    if (raw) {
      const s = JSON.parse(raw);
      if (s.uiLanguage && translations[s.uiLanguage]) return s.uiLanguage;
    }
  } catch { /* ignore */ }
  return 'ru';
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** Current UI language code ('ru', 'en', or 'sr'). */
export const uiLang = getCurrentUiLang();

/** Active translation map — use as `t.key_name`. */
export const t = translations[uiLang];

/**
 * Format an interpolated translation string.
 * Replaces `{key}` placeholders with values from `vars`.
 *
 * @param {string} key — translation key
 * @param {Object} vars — placeholder values
 * @returns {string}
 */
export function fmt(key, vars) {
  let s = t[key];
  if (typeof s !== 'string') return key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

/**
 * Localized language label.
 * @param {string} lang - 'en', 'sr', or 'ru'
 * @returns {string}
 */
export function langLabel(lang) {
  const map = { en: t.lang_en, sr: t.lang_sr, ru: t.lang_ru };
  return map[lang] || lang.toUpperCase();
}

/**
 * Format an ISO date string for display using localized month names.
 * @param {string} isoStr
 * @returns {string}
 */
export function fmtDate(isoStr) {
  if (!isoStr) return '—';
  const [y, m, d] = isoStr.split('-');
  return `${Number(d)} ${t.months[Number(m) - 1]} ${y}`;
}

/**
 * Format a duration in seconds for display.
 * @param {number} seconds
 * @returns {string}
 */
export function fmtDuration(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}${t.time_m} ${s}${t.time_s}` : `${s}${t.time_s}`;
}
