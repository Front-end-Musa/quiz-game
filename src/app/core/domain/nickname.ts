/** Match the same nickname spelling across lobby admission and development generation. */
export const normalizeNickname = (name: string): string =>
  name.trim().normalize('NFKC').toLocaleLowerCase('ru');
