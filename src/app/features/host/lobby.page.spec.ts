import { DEVELOPMENT_TOOLS } from '../../core/ports/development-tools';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding, Router, NavigationEnd } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { filter, firstValueFrom } from 'rxjs';
import { routes } from '../../app.routes';
import { provideMocks } from '../../core/infrastructure/mock/provide-mocks';
import { MemoryRoomStore, ROOM_STORE } from '../../core/infrastructure/mock/room-store';
import { ROOM_GATEWAY } from '../../core/ports/room-gateway';
import { MockPlayerSimulator } from '../../core/infrastructure/mock/mock-player-simulator';

beforeEach(() => {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      ...provideMocks(),
      { provide: ROOM_STORE, useFactory: () => new MemoryRoomStore() },
    ],
  });
});
function button(harness: RouterTestingHarness, text: string) {
  return [...harness.routeNativeElement!.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(text),
  )!;
}
async function settle(harness: RouterTestingHarness) {
  await harness.fixture.whenStable();
  harness.detectChanges();
}

it('completes room creation, developer add/remove/reset, minimum settings, and host start through UI', async () => {
  const harness = await RouterTestingHarness.create('/create-room/general-knowledge');
  await settle(harness);
  const hostInput = harness.routeNativeElement!.querySelector<HTMLInputElement>('#host-nickname')!;
  hostInput.value = 'Лена';
  hostInput.dispatchEvent(new Event('input'));
  button(harness, 'Создать локальную').click();
  await settle(harness);
  expect(harness.routeNativeElement?.textContent).toContain('Лена');
  expect(harness.routeNativeElement?.textContent).toContain('Обо всём на свете');
  expect(harness.routeNativeElement?.querySelector('.room-code')?.textContent).toMatch(
    /[A-Z2-9]{6}/,
  );
  expect(button(harness, 'Начать игру').disabled).toBe(true);
  for (let i = 0; i < 2; i++) {
    button(harness, 'Случайное имя').click();
    await settle(harness);
    button(harness, 'Добавить mock').click();
    await settle(harness);
  }
  expect(harness.routeNativeElement?.textContent).toContain('Игроки: 2 / 15');
  expect(harness.routeNativeElement?.textContent).toContain('MOCK · симуляция');
  expect(button(harness, 'Начать игру').disabled).toBe(false);
  harness.routeNativeElement
    ?.querySelector<HTMLButtonElement>('button[aria-label^="Удалить игрока"]')
    ?.click();
  await settle(harness);
  expect(harness.routeNativeElement?.textContent).toContain('Игроки: 1 / 15');
  button(harness, 'Сбросить mock').click();
  await settle(harness);
  expect(harness.routeNativeElement?.textContent).toContain('Игроки: 0 / 15');
  const minimum = harness.routeNativeElement!.querySelector<HTMLInputElement>('#lobby-minimum')!;
  minimum.value = '3';
  minimum.dispatchEvent(new Event('input'));
  button(harness, 'Сохранить минимум').click();
  await settle(harness);
  expect(harness.routeNativeElement?.textContent).toContain('Минимум для старта: 3');
  const code = harness.routeNativeElement!.querySelector('.room-code')!.textContent!.trim();
  const sim = TestBed.inject(MockPlayerSimulator);
  for (let i = 0; i < 3; i++) await sim.add(code, `Друг ${i}`);
  await settle(harness);
  const navigation = firstValueFrom(
    TestBed.inject(Router).events.pipe(filter((e) => e instanceof NavigationEnd)),
  );
  button(harness, 'Начать игру').click();
  await navigation;
  await settle(harness);
  expect(harness.routeNativeElement?.textContent).toContain('Игра началась!');
  expect(harness.routeNativeElement?.textContent).toContain('Какая планета ближе всего к Солнцу?');
  const state = await firstValueFrom(TestBed.inject(ROOM_GATEWAY).observe(code));
  expect(state?.room.phase).toBe('question');
});

it('shows player waiting information without management or simulation controls', async () => {
  await TestBed.inject(ROOM_GATEWAY).join('DEMO22', 'Настоящий игрок');
  const harness = await RouterTestingHarness.create('/lobby/DEMO22');
  await settle(harness);
  expect(harness.routeNativeElement?.textContent).toContain('ждём ведущего');
  expect(harness.routeNativeElement?.textContent).toContain('Ведущий демо');
  expect(harness.routeNativeElement?.textContent).toContain('Это вы');
  expect(harness.routeNativeElement?.querySelector('.dev-tools')).toBeNull();
  expect(button(harness, 'Начать игру')).toBeUndefined();
  expect(harness.routeNativeElement?.querySelector('button[aria-label^="Удалить"]')).toBeNull();
});

it('supports a clearly labelled player preview without losing host ownership', async () => {
  const created = await TestBed.inject(ROOM_GATEWAY).create('general-knowledge');
  if (!created.ok) throw new Error('No room');
  const harness = await RouterTestingHarness.create(`/lobby/${created.value.code}`);
  await settle(harness);
  button(harness, 'Предпросмотр экрана игрока').click();
  await settle(harness);
  expect(button(harness, 'Начать игру')).toBeUndefined();
  expect(harness.routeNativeElement?.textContent).toContain(
    'Предпросмотр: ваша роль ведущего не меняется',
  );
  button(harness, 'Вернуться к управлению').click();
  await settle(harness);
  expect(button(harness, 'Начать игру')).toBeDefined();
  expect(
    (await firstValueFrom(TestBed.inject(ROOM_GATEWAY).observe(created.value.code)))?.viewerRole,
  ).toBe('host');
});

it('renders normal host controls without a development-tools implementation', async () => {
  TestBed.overrideProvider(DEVELOPMENT_TOOLS, { useValue: null });
  const created = await TestBed.inject(ROOM_GATEWAY).create('general-knowledge');
  if (!created.ok) throw new Error('No room');
  const harness = await RouterTestingHarness.create(`/lobby/${created.value.code}`);
  await settle(harness);
  expect(harness.routeNativeElement?.querySelector('.dev-tools')).toBeNull();
  expect(button(harness, 'Начать игру')).toBeDefined();
});
