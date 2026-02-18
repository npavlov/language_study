/**
 * Russian UI strings for all game modes.
 * Single source of truth for localization.
 */

export const t = {
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
  type_translation: 'Напиши перевод…',
  submit: 'Ответ',
  show_hint: 'Подсказка',
  show_russian_hint: 'Русская подсказка',
  no_more_hints: 'Подсказок нет',
  reveal_letter: 'Буква',
  all_revealed: 'Всё открыто',
  skip: 'Пропустить',
  next_word: 'Дальше',
  correct_answer: 'Правильно! \u2713',
  answer_is: 'Ответ:',
  close_answer: 'Почти! Ответ:',
  type_answer_first: 'Сначала напиши ответ.',
  review_these: 'Повтори эти слова:',
  you_said: 'ты написал:',

  // Match
  round: 'Раунд',
  wrong_attempts: 'Ошибки',
  pairs_matched: 'Пар найдено',
  next_round: 'Следующий раунд',

  // Language labels
  lang_en: 'Английский',
  lang_sr: 'Сербский',
  lang_ru: 'Русский',
};

/**
 * Localized language label.
 * @param {string} lang - 'en', 'sr', or 'ru'
 * @returns {string}
 */
export function langLabel(lang) {
  const map = { en: t.lang_en, sr: t.lang_sr, ru: t.lang_ru };
  return map[lang] || lang.toUpperCase();
}
