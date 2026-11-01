import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { provideMocks } from './provide-mocks';
import { MemoryRoomStore, ROOM_STORE, BrowserRoomStore } from './room-store';
import { ROOM_GATEWAY, RoomGateway } from '../../ports/room-gateway';
import { SESSION_STORAGE, SessionContext } from '../../state/session-context';
import { MockPlayerSimulator } from './mock-player-simulator';

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}
const clients: EnvironmentInjector[] = [];
beforeEach(() => TestBed.configureTestingModule({}));
afterEach(() => {
  for (const client of clients.splice(0)) client.destroy();
});
function client(store: MemoryRoomStore, storage = new MemoryStorage()) {
  const injector = createEnvironmentInjector(
    [
      ...provideMocks(),
      SessionContext,
      MockPlayerSimulator,
      { provide: ROOM_STORE, useValue: store },
      { provide: SESSION_STORAGE, useValue: storage },
    ],
    TestBed.inject(EnvironmentInjector),
  );
  clients.push(injector);
  return {
    gateway: injector.get(ROOM_GATEWAY),
    session: injector.get(SessionContext),
    simulator: injector.get(MockPlayerSimulator),
    storage,
  };
}
async function create(gateway: RoomGateway) {
  const result = await gateway.create('general-knowledge', undefined, 'Наташа');
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

it('supports a complete host create/add/remove/reset/start flow', async () => {
  const host = client(new MemoryRoomStore());
  const room = await create(host.gateway);
  expect((await firstValueFrom(host.gateway.observe(room.code)))?.viewerRole).toBe('host');
  expect(await host.gateway.start(room.code)).toEqual({ ok: false, error: 'not-enough-players' });
  const first = await host.simulator.add(room.code, 'Первый');
  expect(first.ok).toBe(true);
  await host.simulator.add(room.code, 'Второй');
  if (!first.ok) throw new Error('Missing player');
  await host.gateway.removePlayer(room.code, first.value.id);
  expect((await firstValueFrom(host.gateway.observe(room.code)))?.players).toHaveLength(1);
  await host.simulator.reset(room.code);
  expect((await firstValueFrom(host.gateway.observe(room.code)))?.players).toHaveLength(0);
  await host.simulator.add(room.code, await host.simulator.nickname(room.code));
  await host.simulator.add(room.code, await host.simulator.nickname(room.code));
  const start = await host.gateway.start(room.code);
  expect(start.ok).toBe(true);
  if (!start.ok) throw new Error('Start rejected');
  expect(start.value.phase).toBe('question');
  expect(start.value.currentRound?.questionId).toBe('general-1');
  expect(start.value.currentRound!.deadline - start.value.currentRound!.openedAt).toBe(20000);
  expect(start.value.playerIds).not.toContain(start.value.hostId);
  expect(await host.gateway.start(room.code)).toEqual({ ok: false, error: 'game-started' });
  expect((await firstValueFrom(host.gateway.observe(room.code)))?.room.currentRound).toEqual(
    start.value.currentRound,
  );
  expect(await host.simulator.add(room.code, 'После старта')).toEqual({
    ok: false,
    error: 'game-started',
  });
  expect(await host.simulator.reset(room.code)).toEqual({ ok: false, error: 'game-started' });
});

it('rejects player and visitor management commands and prevents host competition', async () => {
  const store = new MemoryRoomStore();
  const host = client(store);
  const player = client(store);
  const room = await create(host.gateway);
  expect(await host.gateway.join(room.code, 'Участник')).toEqual({
    ok: false,
    error: 'host-cannot-join',
  });
  expect(await player.gateway.start(room.code)).toEqual({ ok: false, error: 'forbidden' });
  const joined = await player.gateway.join(room.code, 'Саша');
  expect(joined.ok).toBe(true);
  expect((await firstValueFrom(player.gateway.observe(room.code)))?.viewerRole).toBe('player');
  expect(await player.gateway.start(room.code)).toEqual({ ok: false, error: 'forbidden' });
  expect(await player.gateway.setMinimumPlayers(room.code, 2)).toEqual({
    ok: false,
    error: 'forbidden',
  });
  expect(await player.gateway.removePlayer(room.code, 'anything')).toEqual({
    ok: false,
    error: 'forbidden',
  });
  expect(await player.simulator.add(room.code, 'Подмена')).toEqual({
    ok: false,
    error: 'forbidden',
  });
  expect(await player.simulator.reset(room.code)).toEqual({ ok: false, error: 'forbidden' });
  player.session.set(room.id, { role: 'host', actorId: room.hostId, token: 'forged' });
  expect(await player.gateway.start(room.code)).toEqual({ ok: false, error: 'forbidden' });
});

it('enforces configurable minimums, name uniqueness, capacity and simulated labels', async () => {
  const host = client(new MemoryRoomStore());
  const room = await create(host.gateway);
  expect(await host.gateway.setMinimumPlayers(room.code, 16)).toEqual({
    ok: false,
    error: 'invalid-settings',
  });
  expect(await host.gateway.setMinimumPlayers(room.code, 2.5)).toEqual({
    ok: false,
    error: 'invalid-settings',
  });
  expect(await host.gateway.setMinimumPlayers(room.code, 3)).toEqual({
    ok: true,
    value: undefined,
  });
  await host.simulator.add(room.code, 'Друг');
  expect(await host.simulator.add(room.code, '  дРУг ')).toEqual({
    ok: false,
    error: 'name-taken',
  });
  expect(await host.simulator.add(room.code, '  наташа ')).toEqual({
    ok: false,
    error: 'name-taken',
  });
  await host.simulator.add(room.code, 'Друг 2');
  expect(await host.gateway.start(room.code)).toEqual({ ok: false, error: 'not-enough-players' });
  for (let i = 3; i <= 15; i++) await host.simulator.add(room.code, `Друг ${i}`);
  expect(await host.simulator.add(room.code, 'Лишний')).toEqual({ ok: false, error: 'room-full' });
  expect(
    (await firstValueFrom(host.gateway.observe(room.code)))?.players.every((p) => p.isMock),
  ).toBe(true);
});

it('preserves real members on simulation reset, restores sessions, and invalidates removed members', async () => {
  const store = new MemoryRoomStore();
  const host = client(store);
  const player = client(store);
  const room = await create(host.gateway);
  const joined = await player.gateway.join(room.code, 'Реальный участник');
  if (!joined.ok) throw new Error('Join failed');
  await host.simulator.add(room.code, 'Макет');
  await host.simulator.reset(room.code);
  expect(
    (await firstValueFrom(host.gateway.observe(room.code)))?.players.map((p) => p.displayName),
  ).toEqual(['Реальный участник']);
  const restoredHost = client(store, host.storage);
  const restoredPlayer = client(store, player.storage);
  expect((await firstValueFrom(restoredHost.gateway.observe(room.code)))?.viewerRole).toBe('host');
  expect((await firstValueFrom(restoredPlayer.gateway.observe(room.code)))?.viewerRole).toBe(
    'player',
  );
  expect(await restoredPlayer.gateway.join(room.code, 'Другое имя')).toEqual(joined);
  await host.gateway.removePlayer(room.code, joined.value.id);
  expect((await firstValueFrom(restoredPlayer.gateway.observe(room.code)))?.viewerRole).toBe(
    'visitor',
  );
  const next = await restoredPlayer.gateway.join(room.code, 'Реальный участник');
  expect(next.ok).toBe(true);
  if (next.ok) expect(next.value.joinedOrder).toBeGreaterThan(joined.value.joinedOrder);
});

it('handles concurrent joins without exceeding capacity', async () => {
  const store = new MemoryRoomStore();
  const host = client(store);
  const created = await host.gateway.create('general-knowledge', {
    questionCount: 3,
    minPlayers: 2,
    maxPlayers: 2,
    timeLimitSeconds: 20,
    pointsPerCorrectAnswer: 1000,
    speedBonusPoints: 500,
  });
  if (!created.ok) throw new Error('Creation failed');
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      client(store).gateway.join(created.value.code, `Игрок ${i}`),
    ),
  );
  expect(results.filter((r) => r.ok)).toHaveLength(2);
  expect(results.filter((r) => !r.ok && r.error === 'room-full')).toHaveLength(3);
});

it('falls back honestly when IndexedDB is unavailable', async () => {
  const store = new BrowserRoomStore();
  await store.transact((rooms) => ({ rooms, result: undefined }));
  expect(store.persistent).toBe(false);
  expect(store.changes.value?.[0].room.code).toBe('DEMO22');
  store.ngOnDestroy();
});

it('ignores malformed session data rather than assigning roles', () => {
  const storage = new MemoryStorage();
  storage.setItem('quiz-session-v1', '{bad json');
  const viewer = client(new MemoryRoomStore(), storage);
  expect(viewer.session.changes.value).toEqual({});
});

it('audits a complete 15-player game with distinct host/player identities, rejoin, scoring and replay data', async () => {
  const store = new MemoryRoomStore();
  const host = client(store);
  const player = client(store);
  const created = await host.gateway.create(
    'general-knowledge',
    {
      questionCount: 3,
      timeLimitSeconds: 20,
      pointsPerCorrectAnswer: 100,
      speedBonusPoints: 50,
      minPlayers: 8,
      maxPlayers: 15,
    },
    'Хозяин вечера',
  );
  if (!created.ok) throw new Error(created.error);
  const code = created.value.code;
  const joined = await player.gateway.join(code, 'Настоящий игрок');
  if (!joined.ok) throw new Error(joined.error);
  for (let i = 0; i < 14; i++) expect((await host.simulator.add(code, `Макет ${i}`)).ok).toBe(true);
  expect((await firstValueFrom(host.gateway.observe(code)))?.players).toHaveLength(15);
  expect((await host.gateway.start(code)).ok).toBe(true);
  // A previously admitted identity may rejoin; a new identity may not join mid-game.
  expect(await player.gateway.join(code, 'Другое имя')).toEqual(joined);
  expect(await client(store).gateway.join(code, 'Опоздавший')).toEqual({
    ok: false,
    error: 'game-started',
  });
  for (const option of ['3', '3', '2']) {
    const before = (await firstValueFrom(player.gateway.observe(code)))!;
    const id = before.room.currentRound!.id;
    expect(before.viewerRole).toBe('player');
    expect(before.reveal).toBeNull();
    expect(JSON.stringify(before)).not.toContain('correctOptionId');
    expect((await player.gateway.submitAnswer(code, id, option, crypto.randomUUID())).ok).toBe(
      true,
    );
    expect((await host.gateway.revealAnswer(code, id)).ok).toBe(true);
    expect(
      (await firstValueFrom(player.gateway.observe(code)))?.reveal?.solution.correctOptionId,
    ).toBe(option);
    expect((await host.gateway.advanceQuestion(code, id)).ok).toBe(true);
  }
  const final = (await firstValueFrom(host.gateway.observe(code)))!;
  expect(final.room.phase).toBe('finished');
  expect(final.result?.standings).toHaveLength(15);
  expect(final.result?.winnerId).toBe(joined.value.id);
  expect(final.result?.standings[0].correctAnswers).toBe(3);
  expect(final.result?.standings[0].totalPoints).toBeGreaterThanOrEqual(300);
  expect(
    final.result?.standings
      .filter((entry) => entry.isMock)
      .every((entry) => entry.totalPoints === 0),
  ).toBe(true);
  expect(final.result?.standings.some((entry) => entry.playerId === final.room.hostId)).toBe(false);
  const replay = await host.gateway.create(
    final.room.quizId,
    final.result!.settings,
    final.room.hostNickname,
  );
  expect(replay.ok).toBe(true);
  if (replay.ok) {
    expect(replay.value.code).not.toBe(code);
    expect((await firstValueFrom(host.gateway.observe(replay.value.code)))?.players).toEqual([]);
  }
  expect((await firstValueFrom(host.gateway.observe(code)))?.result).toEqual(final.result);
});

it('rejects delayed host controls against a newer attempt and blocks all player progression', async () => {
  const store = new MemoryRoomStore();
  const host = client(store);
  const player = client(store);
  const room = await create(host.gateway);
  await player.gateway.join(room.code, 'Игрок');
  await host.simulator.add(room.code, 'Макет');
  await host.gateway.start(room.code);
  const oldId = (await firstValueFrom(host.gateway.observe(room.code)))!.room.currentRound!.id;
  expect(await player.gateway.revealAnswer(room.code, oldId)).toEqual({
    ok: false,
    error: 'forbidden',
  });
  await host.gateway.revealAnswer(room.code, oldId);
  await host.gateway.advanceQuestion(room.code, oldId);
  expect(await host.gateway.revealAnswer(room.code, oldId)).toEqual({
    ok: false,
    error: 'stale-round',
  });
  expect(await host.gateway.advanceQuestion(room.code, oldId)).toEqual({
    ok: false,
    error: 'stale-round',
  });
  const next = (await firstValueFrom(host.gateway.observe(room.code)))!;
  expect(next.room.currentRound?.index).toBe(1);
  expect(next.room.phase).toBe('question');
});
