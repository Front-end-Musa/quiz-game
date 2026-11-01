export function adminError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === 'permission-denied') return 'Нет доступа или сессия устарела. Войдите заново через Google и повторите действие.';
  if (code?.startsWith('auth/')) return 'Вход не выполнен. Проверьте данные или войдите через Google. Для изменения пароля может понадобиться повторный вход.';
  return error instanceof Error ? error.message : 'Не удалось сохранить изменения. Проверьте соединение.';
}
