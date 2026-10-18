// Letter sets the user can record. Recognition is learned from recordings,
// so no letter shapes are hard-coded here.
const RUSSIAN = 'А Б В Г Д Е Ё Ж З И Й К Л М Н О П Р С Т У Ф Х Ц Ч Ш Щ Ъ Ы Ь Э Ю Я'.split(' ');

export const ALPHABETS = {
  kk: {
    name: 'Қазақ / Kazakh',
    speech: 'kk-KZ',
    letters: 'А Ә Б В Г Ғ Д Е Ё Ж З И Й К Қ Л М Н Ң О Ө П Р С Т У Ұ Ү Ф Х Һ Ц Ч Ш Щ Ъ Ы І Ь Э Ю Я'.split(' '),
    words: ['АНА', 'ӘКЕ', 'СӘЛЕМ', 'ДОС', 'КІТАП', 'МЕКТЕП', 'ҚАЛА', 'НАН', 'СУ', 'ҮЙ', 'АЛМА', 'РАХМЕТ'],
  },
  ru: {
    name: 'Русский / Russian',
    speech: 'ru-RU',
    letters: RUSSIAN,
    words: ['МАМА', 'ПАПА', 'ДОМ', 'МИР', 'ДРУГ', 'ШКОЛА', 'КОТ', 'ЛЕС', 'ВОДА', 'НЕБО', 'СПАСИБО', 'ПРИВЕТ'],
  },
  asl: {
    name: 'ASL (English)',
    speech: 'en-US',
    letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
    words: ['HELLO', 'FRIEND', 'LOVE', 'HOME', 'BOOK', 'CAT', 'SUN', 'HELP', 'THANKS', 'SCHOOL', 'WATER', 'YES'],
  },
};

// Words that can be practised with the letters recorded so far.
export function playableWords(alphabetId, recorded) {
  const have = new Set(recorded);
  return ALPHABETS[alphabetId].words.filter((word) => [...word].every((letter) => have.has(letter)));
}
