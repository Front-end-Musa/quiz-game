import { Quiz } from '../../core/domain/quiz';
import { QuestionSolution, QuizQuestion } from '../../core/domain/quiz-question';

const options = (texts: readonly string[]) => texts.map((text, i) => ({ id: String(i + 1), text }));

// Slots only: no Quranic claims, quotations, ayah references or answer keys.
const quranQuestions: QuizQuestion[] = [11, 12, 71].flatMap((surahNumber) =>
  Array.from({ length: 5 }, (_, i) => ({
    id: `quran-${surahNumber}-${i + 1}`,
    quizId: 'quran-three-surahs',
    prompt: `Место для вопроса ${i + 1} по суре ${surahNumber}. Текст ещё не подготовлен и не проверен.`,
    options: options([
      'Вариант ещё не подготовлен',
      'Вариант ещё не подготовлен',
      'Вариант ещё не подготовлен',
      'Вариант ещё не подготовлен',
    ]),
    timeLimitSeconds: 20,
    status: 'placeholder' as const,
    metadata: { surahNumber, reviewStatus: 'requires-review' },
  })),
);

const generalQuestions: QuizQuestion[] = [
  {
    id: 'general-1',
    quizId: 'general-knowledge',
    prompt: 'Какая планета ближе всего к Солнцу?',
    options: options(['Венера', 'Марс', 'Меркурий', 'Земля']),
    timeLimitSeconds: 20,
    status: 'demo',
    metadata: { subject: 'astronomy' },
  },
  {
    id: 'general-2',
    quizId: 'general-knowledge',
    prompt: 'Сколько сторон у шестиугольника?',
    options: options(['Четыре', 'Пять', 'Шесть', 'Восемь']),
    timeLimitSeconds: 20,
    status: 'demo',
    metadata: { subject: 'geometry' },
  },
  {
    id: 'general-3',
    quizId: 'general-knowledge',
    prompt: 'Какой газ растения поглощают при фотосинтезе?',
    options: options(['Гелий', 'Углекислый газ', 'Водород', 'Неон']),
    timeLimitSeconds: 20,
    status: 'demo',
    metadata: { subject: 'biology' },
  },
];
const programmingQuestions: QuizQuestion[] = [
  {
    id: 'programming-1',
    quizId: 'programming-basics',
    prompt: 'Какое значение имеет выражение 2 + 3 * 4?',
    options: options(['20', '14', '24', '9']),
    timeLimitSeconds: 20,
    status: 'demo',
    metadata: { language: 'TypeScript', concept: 'operator precedence' },
  },
  {
    id: 'programming-2',
    quizId: 'programming-basics',
    prompt: 'Какой оператор LINQ фильтрует элементы последовательности?',
    options: options(['Select', 'OrderBy', 'Where', 'Count']),
    timeLimitSeconds: 20,
    status: 'demo',
    metadata: { language: 'C#', concept: 'LINQ' },
  },
  {
    id: 'programming-3',
    quizId: 'programming-basics',
    prompt: 'Какой HTTP-метод обычно используют для получения ресурса?',
    options: options(['GET', 'DELETE', 'PATCH', 'POST']),
    timeLimitSeconds: 20,
    status: 'demo',
    metadata: { concept: 'HTTP' },
  },
];

export const MOCK_QUESTIONS: readonly QuizQuestion[] = [
  ...quranQuestions,
  ...generalQuestions,
  ...programmingQuestions,
];
export const MOCK_QUIZZES: readonly Quiz[] = [
  {
    id: 'quran-three-surahs',
    version: 1,
    title: 'Коран: три суры',
    description:
      'Худ (11), Юсуф (12), Нух (71). Структура из 15 мест для будущих проверенных вопросов. Пока недоступно для игры.',
    topic: 'Коран',
    difficulty: 'intermediate',
    questionIds: quranQuestions.map((q) => q.id),
    defaultTimeLimitSeconds: 20,
    status: 'placeholder',
  },
  {
    id: 'general-knowledge',
    version: 1,
    title: 'Обо всём на свете',
    description: 'Небольшой демонабор: космос, геометрия и природа. Попробуем вместе?',
    topic: 'Общие знания',
    difficulty: 'beginner',
    questionIds: generalQuestions.map((q) => q.id),
    defaultTimeLimitSeconds: 20,
    status: 'demo',
  },
  {
    id: 'programming-basics',
    version: 1,
    title: 'Программирование: начало',
    description: 'Код, логика и немного LINQ. Демонабор для знакомства с платформой.',
    topic: 'Программирование',
    difficulty: 'beginner',
    questionIds: programmingQuestions.map((q) => q.id),
    defaultTimeLimitSeconds: 20,
    status: 'demo',
  },
];

/** Adapter-side data only. Never imported by UI or included in active question payloads. */
export const MOCK_SOLUTIONS: readonly QuestionSolution[] = [
  {
    questionId: 'general-1',
    correctOptionId: '3',
    explanation: 'Меркурий — ближайшая к Солнцу планета.',
  },
  { questionId: 'general-2', correctOptionId: '3', explanation: 'У шестиугольника шесть сторон.' },
  {
    questionId: 'general-3',
    correctOptionId: '2',
    explanation: 'При фотосинтезе растения поглощают углекислый газ.',
  },
  {
    questionId: 'programming-1',
    correctOptionId: '2',
    explanation: 'Умножение выполняется перед сложением: 2 + 12 = 14.',
  },
  {
    questionId: 'programming-2',
    correctOptionId: '3',
    explanation: 'Where оставляет элементы, удовлетворяющие предикату.',
  },
  {
    questionId: 'programming-3',
    correctOptionId: '1',
    explanation: 'GET запрашивает представление ресурса.',
  },
];
