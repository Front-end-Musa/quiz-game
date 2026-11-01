beforeEach(() => sessionStorage.clear());
import { MemoryRoomStore, ROOM_STORE } from './core/infrastructure/mock/room-store';
import { SessionContext } from './core/state/session-context';
import { filter, firstValueFrom } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';
import { provideMocks } from './core/infrastructure/mock/provide-mocks';

beforeEach(() =>
  TestBed.configureTestingModule({
    providers: [provideRouter(routes, withComponentInputBinding()), ...provideMocks()],
  }),
);

it('renders a Russian shell with primary navigation and a skip link', async () => {
  const fixture = TestBed.createComponent(App);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  expect(element.querySelector('nav')?.getAttribute('aria-label')).toBe('Главная навигация');
  expect(element.querySelector('.skip-link')?.getAttribute('href')).toBe('#main-content');
  expect(element.textContent).toContain('сохраняются в этом браузере');
});

const pages = [
  ['/', 'Собираемся.'],
  ['/quizzes', 'Во что сыграем?'],
  ['/quiz/general-knowledge', 'Обо всём на свете'],
  ['/quiz/quran-three-surahs', 'Контент не проверен'],
  ['/create-room/programming-basics', 'Создать локальную комнату'],
  ['/join', 'Заходите, мы ждём!'],
  ['/lobby/DEMO22', 'Аня'],
  ['/game/DEMO22', 'Здесь будет игра'],
  ['/results/FINISH', 'Демонстрационные результаты'],
  ['/leaderboard', 'Демопример'],
  ['/does-not-exist', 'Такой страницы нет'],
  ['/quiz/missing', 'Викторина не найдена'],
  ['/create-room/missing', 'Тема не найдена'],
  ['/lobby/missing', 'Комната не найдена'],
  ['/game/missing', 'Комната не найдена'],
  ['/results/missing', 'Финал ещё впереди'],
];
it.each(pages)('loads %s and renders its data or recovery state', async (url, text) => {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  await harness.fixture.whenStable();
  harness.detectChanges();
  expect(harness.routeNativeElement?.textContent).toContain(text);
});

it('reacts to changed quiz parameters when Angular reuses the detail component', async () => {
  const harness = await RouterTestingHarness.create('/quiz/general-knowledge');
  await harness.fixture.whenStable();
  await harness.navigateByUrl('/quiz/programming-basics');
  await harness.fixture.whenStable();
  harness.detectChanges();
  expect(harness.routeNativeElement?.textContent).toContain('Программирование: начало');
  expect(harness.routeNativeElement?.textContent).not.toContain('Какая планета');
});

it('blocks placeholder room creation in the page', async () => {
  const harness = await RouterTestingHarness.create('/create-room/quran-three-surahs');
  await harness.fixture.whenStable();
  harness.detectChanges();
  expect(harness.routeNativeElement?.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
});

it('creates a local room from the form and navigates to its lobby', async () => {
  const harness = await RouterTestingHarness.create('/create-room/general-knowledge');
  await harness.fixture.whenStable();
  harness.detectChanges();
  harness.routeNativeElement?.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
  await harness.fixture.whenStable();
  harness.detectChanges();
  expect(harness.routeNativeElement?.textContent).toContain('Все в сборе?');
  expect(harness.routeNativeElement?.textContent).toContain('Пока тихо.');
});

it('joins the demo room through the reactive form', async () => {
  const harness = await RouterTestingHarness.create('/join');
  for (const [id, value] of [
    ['room-code', 'demo22'],
    ['player-name', 'Новый игрок'],
  ]) {
    const input = harness.routeNativeElement!.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }
  harness.detectChanges();
  harness.routeNativeElement
    ?.querySelector('form')
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await harness.fixture.whenStable();
  harness.detectChanges();
  expect(harness.routeNativeElement?.textContent).toContain('Новый игрок');
  expect(harness.routeNativeElement?.textContent).toContain('Вы в кругу!');
  harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a[href="/lobby/DEMO22"]')?.click();
  await harness.fixture.whenStable();
  harness.detectChanges();
  expect(harness.routeNativeElement?.textContent).toContain('4 / 15');
});

function fill(harness: RouterTestingHarness, id: string, value: string) {
  const input = harness.routeNativeElement!.querySelector<HTMLInputElement>(`#${id}`)!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new Event('blur'));
  harness.detectChanges();
}
function submit(harness: RouterTestingHarness) {
  harness
    .routeNativeElement!.querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  harness.detectChanges();
}

it('connects both landing CTAs and featured quiz without promoting placeholders as playable', async () => {
  const harness = await RouterTestingHarness.create('/');
  await harness.fixture.whenStable();
  harness.detectChanges();
  const links = harness.routeNativeElement!.querySelectorAll('a');
  expect([...links].find((a) => a.textContent?.includes('Играть'))?.getAttribute('href')).toBe(
    '/join',
  );
  expect(
    [...links].find((a) => a.textContent?.includes('Создать игру'))?.getAttribute('href'),
  ).toBe('/quizzes');
  expect([...links].some((a) => a.getAttribute('href') === '/quiz/quran-three-surahs')).toBe(true);
  expect(harness.routeNativeElement?.textContent).toContain('требует подготовки и проверки');
});

it('filters the catalogue and offers a recovery link for upcoming categories', async () => {
  const harness = await RouterTestingHarness.create('/quizzes?category=Программирование');
  await harness.fixture.whenStable();
  harness.detectChanges();
  expect(harness.routeNativeElement?.querySelectorAll('app-quiz-card')).toHaveLength(1);
  expect(harness.routeNativeElement?.textContent).toContain('Программирование: начало');
  await harness.navigateByUrl('/quizzes?category=Кино');
  await harness.fixture.whenStable();
  harness.detectChanges();
  expect(harness.routeNativeElement?.textContent).toContain('Эта тема ещё впереди');
  expect(harness.routeNativeElement?.querySelectorAll('app-quiz-card')).toHaveLength(0);
});

it('shows complete catalogue metadata and availability for all three quizzes', async () => {
  const harness = await RouterTestingHarness.create('/quizzes');
  await harness.fixture.whenStable();
  harness.detectChanges();
  expect(harness.routeNativeElement?.querySelectorAll('app-quiz-card')).toHaveLength(3);
  for (const card of harness.routeNativeElement!.querySelectorAll('app-quiz-card')) {
    expect(card.textContent).toContain('Сложность');
    expect(card.textContent).toContain('Ориентир по времени');
    expect(card.textContent).toMatch(/Доступно|Скоро/);
  }
});

it('persists custom room settings and question selection in the lobby', async () => {
  const harness = await RouterTestingHarness.create('/create-room/general-knowledge');
  await harness.fixture.whenStable();
  harness.detectChanges();
  fill(harness, 'questionCount', '2');
  fill(harness, 'timeLimitSeconds', '30');
  fill(harness, 'pointsPerCorrectAnswer', '2000');
  fill(harness, 'speedBonusPoints', '0');
  fill(harness, 'maxPlayers', '8');
  const navigation = firstValueFrom(
    TestBed.inject(Router).events.pipe(filter((event) => event instanceof NavigationEnd)),
  );
  submit(harness);
  await navigation;
  await harness.fixture.whenStable();
  harness.detectChanges();
  expect(harness.routeNativeElement?.textContent).toContain('0 / 8');
  expect(harness.routeNativeElement?.textContent).toContain('Вопросов2');
  expect(harness.routeNativeElement?.textContent).toContain('30 сек');
  expect(harness.routeNativeElement?.textContent).toContain('2000 очков + до 0');
});

it('rejects invalid counts and bonus combinations with actionable form feedback', async () => {
  const harness = await RouterTestingHarness.create('/create-room/general-knowledge');
  await harness.fixture.whenStable();
  harness.detectChanges();
  fill(harness, 'questionCount', '4');
  fill(harness, 'pointsPerCorrectAnswer', '10');
  submit(harness);
  await harness.fixture.whenStable();
  harness.detectChanges();
  expect(harness.routeNativeElement?.textContent).toContain('Введите целое число от 1 до 3.');
  expect(harness.routeNativeElement?.textContent).toContain(
    'Бонус за скорость не должен превышать',
  );
  expect(
    harness.routeNativeElement?.querySelector('#questionCount')?.getAttribute('aria-invalid'),
  ).toBe('true');
});

it('resets configuration to sensible defaults', async () => {
  const harness = await RouterTestingHarness.create('/create-room/general-knowledge');
  await harness.fixture.whenStable();
  harness.detectChanges();
  fill(harness, 'timeLimitSeconds', '90');
  [...harness.routeNativeElement!.querySelectorAll('button')]
    .find((b) => b.textContent?.includes('Сбросить'))!
    .click();
  harness.detectChanges();
  expect(
    harness.routeNativeElement?.querySelector<HTMLInputElement>('#timeLimitSeconds')?.value,
  ).toBe('20');
});

it('validates empty join fields and fills the demo code without submitting', async () => {
  const harness = await RouterTestingHarness.create('/join');
  submit(harness);
  await harness.fixture.whenStable();
  harness.detectChanges();
  expect(harness.routeNativeElement?.textContent).toContain('Нужны ровно 6 латинских');
  expect(harness.routeNativeElement?.textContent).toContain('Введите имя от 1 до 24');
  [...harness.routeNativeElement!.querySelectorAll('button')]
    .find((b) => b.textContent?.includes('Подставить'))!
    .click();
  harness.detectChanges();
  expect(harness.routeNativeElement?.querySelector<HTMLInputElement>('#room-code')?.value).toBe(
    'DEMO22',
  );
  expect(harness.routeNativeElement?.querySelector('form')).not.toBeNull();
});

it.each([
  ['ABCDEF', 'Друг', 'Комната не найдена'],
  ['DEMO22', 'Аня', 'Это имя уже занято'],
])('shows helpful join rejection for %s/%s', async (code, name, message) => {
  const harness = await RouterTestingHarness.create('/join');
  fill(harness, 'room-code', code);
  fill(harness, 'player-name', name);
  submit(harness);
  await harness.fixture.whenStable();
  harness.detectChanges();
  await vi.waitFor(() => {
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain(
      message,
    );
  });
  expect(harness.routeNativeElement?.querySelector('form')).not.toBeNull();
});
