import { Quiz } from '../../core/domain/quiz';

export const difficultyLabels: Record<Quiz['difficulty'], string> = {
  beginner: 'Лёгкая',
  intermediate: 'Средняя',
  advanced: 'Сложная',
};
export function durationMinutes(questionCount: number, seconds: number): number {
  // Includes a 15-second allowance per question for host-paced reveals.
  return Math.max(1, Math.ceil((questionCount * (seconds + 15)) / 60));
}
export function questionLabel(count: number): string {
  const labels: Record<string, string> = {
    one: 'вопрос',
    few: 'вопроса',
    many: 'вопросов',
    other: 'вопроса',
  };
  return `${count} ${labels[new Intl.PluralRules('ru').select(count)]}`;
}
