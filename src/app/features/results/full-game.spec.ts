import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { routes } from '../../app.routes';
import { provideMocks } from '../../core/infrastructure/mock/provide-mocks';
import { MemoryRoomStore, ROOM_STORE } from '../../core/infrastructure/mock/room-store';
import { ROOM_GATEWAY } from '../../core/ports/room-gateway';
import { RESULT_REPOSITORY } from '../../core/ports/result-repository';
import { GAME_CLOCK } from '../../core/state/game-clock';
import { LocalGameEngine } from '../../core/infrastructure/mock/local-game-engine';

let now: number;
beforeEach(() => {
  now = 1000;
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      ...provideMocks(),
      { provide: ROOM_STORE, useFactory: () => new MemoryRoomStore() },
      { provide: GAME_CLOCK, useValue: { now: () => now } },
    ],
  });
});
async function text(harness: RouterTestingHarness, value: string) {
  await vi.waitFor(() => {
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain(value);
  });
}
async function click(harness: RouterTestingHarness, label: string) {
  await vi.waitFor(() => {
    harness.detectChanges();
    const button = [...harness.routeNativeElement!.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(label),
    );
    expect(button, label).toBeDefined();
    expect(button!.disabled).toBe(false);
  });
  [...harness.routeNativeElement!.querySelectorAll('button')]
    .find((b) => b.textContent?.includes(label))!
    .click();
}

it('plays from creation through all reveals to the winner, then replays into a clean lobby', async () => {
  const harness = await RouterTestingHarness.create('/');
  await text(harness, 'Собираемся.');
  harness.routeNativeElement!.querySelector<HTMLAnchorElement>('a[href="/quizzes"]')!.click();
  await text(harness, 'Во что сыграем?');
  await text(harness, 'Обо всём на свете');
  harness
    .routeNativeElement!.querySelector<HTMLAnchorElement>('a[href="/quiz/general-knowledge"]')!
    .click();
  await text(harness, 'Как устроена игра');
  harness
    .routeNativeElement!.querySelector<HTMLAnchorElement>(
      'a[href="/create-room/general-knowledge"]',
    )!
    .click();
  await text(harness, 'Создать локальную комнату');
  await click(harness, 'Создать локальную комнату');
  await text(harness, 'Играть самому');
  const code = harness.routeNativeElement!.querySelector('.room-code')!.textContent!.trim();
  await click(harness, 'Играть самому');
  await text(harness, 'Какая планета ближе всего к Солнцу?');
  expect(harness.routeNativeElement?.querySelectorAll('.answer-option')).toHaveLength(4);
  expect(harness.routeNativeElement?.querySelector('.answer-option.correct')).toBeNull();
  harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('.answer-option')[2].click();
  await text(harness, 'Ответ принят');
  expect(
    [...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('.answer-option')].every(
      (b) => b.disabled,
    ),
  ).toBe(true);
  expect(harness.routeNativeElement?.querySelector('.answer-reveal')).toBeNull();
  await click(harness, 'Раскрыть ответ · DEV');
  await text(harness, 'Рейтинг после вопроса');
  await text(harness, '+150 очков');
  await text(harness, 'Верно! Отличная работа.');
  expect(harness.routeNativeElement?.querySelector('.round-answer-summary')?.textContent).toContain(
    'Меркурий',
  );
  expect(harness.routeNativeElement?.textContent).toContain('Источник не указан в демонаборе.');
  await click(harness, 'Следующий вопрос · DEV');
  await text(harness, 'Сколько сторон у шестиугольника?');
  harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('.answer-option')[0].click();
  await text(harness, 'Ответ принят');
  await click(harness, 'Раскрыть ответ · DEV');
  await text(harness, 'В этот раз — другой ответ.');
  expect(harness.routeNativeElement?.querySelector('.answer-option.incorrect')).not.toBeNull();
  await click(harness, 'Следующий вопрос · DEV');
  await text(harness, 'Какой газ растения поглощают');
  const room = await firstValueFrom(TestBed.inject(ROOM_GATEWAY).observe(code));
  now = room!.room.currentRound!.deadline;
  await text(harness, 'Вы не успели ответить.');
  await click(harness, 'Следующий вопрос · DEV');
  await text(harness, 'Финальные результаты');
  await text(harness, '33%');
  await text(harness, 'Игрок (тест)');
  expect(harness.routeNativeElement?.querySelector('.winner-banner')).not.toBeNull();
  const details = harness.routeNativeElement!.querySelector('details')!;
  details.querySelector('summary')!.click();
  expect(details.open).toBe(true);
  expect(details.textContent).toContain('Без ответа');
  await click(harness, 'Сыграть ещё');
  await text(harness, 'Все в сборе?');
  const nextCode = harness.routeNativeElement!.querySelector('.room-code')!.textContent!.trim();
  expect(nextCode).not.toBe(code);
  await text(harness, 'Игроки: 0 / 15');
  expect((await TestBed.inject(RESULT_REPOSITORY).getByRoom(code))?.standings[0].totalPoints).toBe(
    150,
  );
});

it('shows a supplied reference only after reveal', async () => {
  const engine = TestBed.inject(LocalGameEngine);
  const original = engine.solution.bind(engine);
  vi.spyOn(engine, 'solution').mockImplementation((id) => {
    const solution = original(id);
    return solution
      ? { ...solution, reference: 'Тестовый источник для проверки отображения' }
      : undefined;
  });
  const harness = await RouterTestingHarness.create('/create-room/general-knowledge');
  await text(harness, 'Создать локальную');
  await click(harness, 'Создать локальную');
  await text(harness, 'Играть самому');
  await click(harness, 'Играть самому');
  await text(harness, 'Какая планета');
  expect(harness.routeNativeElement?.textContent).not.toContain('Тестовый источник');
  await click(harness, 'Раскрыть ответ · DEV');
  await text(harness, 'Источник: Тестовый источник');
});

it('labels seeded results and supports home navigation and their replay action', async () => {
  const harness = await RouterTestingHarness.create('/results/FINISH');
  await text(harness, 'Демонстрационные результаты');
  expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Аня');
  expect(harness.routeNativeElement?.querySelector('a[href="/"]')).not.toBeNull();
  expect(harness.routeNativeElement?.textContent).toContain('MOCK');
  harness.routeNativeElement!.querySelector<HTMLAnchorElement>('a[href="/"]')!.click();
  await text(harness, 'Собираемся.');
  await harness.navigateByUrl('/results/FINISH');
  await text(harness, 'Демонстрационные результаты');
  await click(harness, 'Сыграть ещё');
  await text(harness, 'Игроки: 0 / 15');
});
