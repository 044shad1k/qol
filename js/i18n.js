const STRINGS = {
  en: {
    tagline: 'Learn fingerspelling with your webcam',
    start: 'Turn on camera',
    privacy: 'Video never leaves your device. No account, no server.',
    loading: 'Loading hand tracking…',
    cameraError: 'Camera is not available. Allow camera access and reload the page.',
    modelError: 'Hand tracking failed to load. Reload the page.',
    tabPractice: 'Practice', tabSpell: 'Words', tabLive: 'Translate', tabTeach: 'Record',
    alphabet: 'Alphabet', noHand: 'Show your hand to the camera',
    needLetters: 'Record at least 2 letters first in the Record tab.',
    goRecord: 'Go to Record',
    showLetter: 'Show this letter', match: 'Match', streak: 'Streak', accuracy: 'Solved',
    skip: 'Skip', perfect: 'Correct!', reference: 'How it was recorded',
    straighten: 'Straighten your {finger}', bend: 'Bend your {finger} more',
    move: 'Move your {finger} {direction}', rotate: 'Close — now it looks like “{letter}”. Check the angle of your hand.',
    hold: 'Hold it…',
    thumb: 'thumb', index: 'index finger', middle: 'middle finger', ring: 'ring finger', pinky: 'little finger',
    left: 'to the left', right: 'to the right', up: 'up', down: 'down',
    spellTitle: 'Spell the word', newWord: 'Next word', customWord: 'Your own word', go: 'Go',
    noWords: 'Record more letters to unlock words, or type your own word using recorded letters.',
    wordDone: 'Word done in {seconds} s', badWord: 'Some letters in this word are not recorded yet.',
    liveTitle: 'Fingerspell to text', liveHint: 'Hold a letter to type it. Lower your hand to add a space.',
    speak: 'Speak', backspace: 'Delete', clear: 'Clear', unknown: '?',
    teachTitle: 'Record your alphabet', teachHint: 'Pick a letter, show it, and press Record (or Space). Record each letter with a few small variations.',
    record: 'Record', recording: 'Recording… move your hand slightly', countdown: 'Get ready: {n}',
    samples: '{n} examples', remove: 'Delete examples', exportPack: 'Export pack', importPack: 'Import pack',
    imported: 'Imported {n} examples', importFailed: 'Could not import: {reason}', saved: 'Saved',
    storageFull: 'Could not save in this browser. Export your pack to keep it.',
    clearAll: 'Delete all recordings', confirmClear: 'Delete all recordings for this alphabet?',
    recorded: '{n} of {total} letters recorded',
  },
  ru: {
    tagline: 'Учите дактильную азбуку с веб-камерой',
    start: 'Включить камеру',
    privacy: 'Видео не покидает устройство. Без аккаунта и без сервера.',
    loading: 'Загружаю распознавание руки…',
    cameraError: 'Камера недоступна. Разрешите доступ к камере и обновите страницу.',
    modelError: 'Не удалось загрузить распознавание руки. Обновите страницу.',
    tabPractice: 'Учиться', tabSpell: 'Слова', tabLive: 'Перевод', tabTeach: 'Запись',
    alphabet: 'Азбука', noHand: 'Покажите руку в камеру',
    needLetters: 'Сначала запишите хотя бы 2 буквы во вкладке «Запись».',
    goRecord: 'Перейти к записи',
    showLetter: 'Покажите букву', match: 'Сходство', streak: 'Серия', accuracy: 'Решено',
    skip: 'Пропустить', perfect: 'Верно!', reference: 'Как записано',
    straighten: 'Выпрямите {finger}', bend: 'Согните {finger} сильнее',
    move: 'Сдвиньте {finger} {direction}', rotate: 'Почти — сейчас похоже на «{letter}». Проверьте наклон кисти.',
    hold: 'Держите…',
    thumb: 'большой палец', index: 'указательный палец', middle: 'средний палец', ring: 'безымянный палец', pinky: 'мизинец',
    left: 'влево', right: 'вправо', up: 'вверх', down: 'вниз',
    spellTitle: 'Покажите слово', newWord: 'Следующее слово', customWord: 'Своё слово', go: 'Начать',
    noWords: 'Запишите больше букв, чтобы открыть слова, или введите своё слово из записанных букв.',
    wordDone: 'Слово за {seconds} с', badWord: 'Некоторые буквы этого слова ещё не записаны.',
    liveTitle: 'Дактиль в текст', liveHint: 'Держите букву, чтобы напечатать её. Опустите руку — будет пробел.',
    speak: 'Озвучить', backspace: 'Стереть', clear: 'Очистить', unknown: '?',
    teachTitle: 'Запишите свою азбуку', teachHint: 'Выберите букву, покажите её и нажмите «Записать» (или пробел). Записывайте каждую букву с небольшими вариациями.',
    record: 'Записать', recording: 'Запись… слегка двигайте рукой', countdown: 'Приготовьтесь: {n}',
    samples: 'примеров: {n}', remove: 'Удалить примеры', exportPack: 'Экспорт набора', importPack: 'Импорт набора',
    imported: 'Импортировано примеров: {n}', importFailed: 'Не удалось импортировать: {reason}', saved: 'Сохранено',
    storageFull: 'Не удалось сохранить в браузере. Экспортируйте набор, чтобы не потерять его.',
    clearAll: 'Удалить все записи', confirmClear: 'Удалить все записи для этой азбуки?',
    recorded: 'Записано букв: {n} из {total}',
  },
};

let language = 'en';

export function setLanguage(next) {
  language = STRINGS[next] ? next : 'en';
}

export function getLanguage() {
  return language;
}

export function t(key, values = {}) {
  const template = STRINGS[language][key] ?? STRINGS.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
}

// Turns advice from the classifier into a sentence.
export function adviceText(advice) {
  if (!advice) return t('hold');
  if (advice.kind === 'rotate') return t('rotate', { letter: advice.confusedWith });
  if (advice.kind === 'move') return t('move', { finger: t(advice.finger), direction: t(advice.direction) });
  if (advice.kind === 'straighten' || advice.kind === 'bend') return t(advice.kind, { finger: t(advice.finger) });
  return '';
}

export const LANGUAGES = Object.keys(STRINGS);
