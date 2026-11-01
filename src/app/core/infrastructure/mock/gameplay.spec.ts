import { LocalGameEngine } from './local-game-engine';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { provideMocks } from './provide-mocks';
import { MemoryRoomStore, ROOM_STORE } from './room-store';
import { MockRoomGateway } from './mock-room.gateway';
import { ROOM_GATEWAY, RoomSnapshot } from '../../ports/room-gateway';
import { RESULT_REPOSITORY } from '../../ports/result-repository';
import { GAME_CLOCK } from '../../state/game-clock';
import { GameTimingService } from '../../state/game-timing.service';
import { ReplayService } from '../../state/replay.service';
import { ScoringService } from '../../domain/scoring.service';
import { playerStatistics } from '../../../shared/ui/result-statistics';

let now: number;
beforeEach(() => {
  now = 1000;
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      ...provideMocks(),
      { provide: ROOM_STORE, useFactory: () => new MemoryRoomStore() },
      { provide: GAME_CLOCK, useValue: { now: () => now } },
    ],
  });
});
afterEach(() => vi.useRealTimers());
const snapshot = (code: string) =>
  firstValueFrom(TestBed.inject(ROOM_GATEWAY).observe(code)) as Promise<RoomSnapshot>;
async function practice(quizId = 'general-knowledge') {
  const gateway = TestBed.inject(MockRoomGateway);
  const created = await gateway.create(quizId);
  if (!created.ok) throw new Error(created.error);
  expect(await gateway.playLocally(created.value.code)).toEqual({ ok: true, value: undefined });
  return { gateway, code: created.value.code };
}

it.each([
  [true, 20000, 20000, 150],
  [true, 10000, 20000, 125],
  [true, 0, 20000, 100],
  [true, -100, 20000, 100],
  [true, 30000, 20000, 150],
  [false, 20000, 20000, 0],
  [true, 0, 0, 0],
])('scores correct=%s remaining=%s duration=%s as %s', (correct, remaining, duration, expected) => {
  expect(
    TestBed.inject(ScoringService).calculate(Boolean(correct), Number(remaining), Number(duration)),
  ).toBe(expected);
});

it('accepts one answer, returns idempotent retries, locks changes and hides solutions until reveal', async () => {
  const { gateway, code } = await practice();
  const round = (await snapshot(code)).room.currentRound!;
  expect(JSON.stringify(await snapshot(code))).not.toContain('correctOptionId');
  const first = await gateway.submitAnswer(code, round.id, '3', 'one');
  expect(first.ok).toBe(true);
  expect(await gateway.submitAnswer(code, round.id, '3', 'one')).toEqual(first);
  expect(await gateway.submitAnswer(code, round.id, '1', 'two')).toEqual({
    ok: false,
    error: 'already-answered',
  });
  expect((await snapshot(code)).score).toBe(0);
  expect((await snapshot(code)).reveal).toBeNull();
  expect(await gateway.revealAnswer(code, round.id)).toEqual({ ok: false, error: 'forbidden' });
  await gateway.developerAction(code, 'reveal', (await snapshot(code)).room.currentRound!.id);
  expect((await snapshot(code)).score).toBe(150);
  expect((await snapshot(code)).reveal?.solution.correctOptionId).toBe('3');
  await gateway.expire(code, round.id);
  expect((await snapshot(code)).score).toBe(150);
});

it('rejects unknown options and answers at the exact deadline, revealing a timeout worth zero', async () => {
  const { gateway, code } = await practice();
  const round = (await snapshot(code)).room.currentRound!;
  expect(await gateway.submitAnswer(code, round.id, 'wrong-id', 'bad')).toEqual({
    ok: false,
    error: 'invalid-option',
  });
  now = round.deadline;
  expect(await gateway.submitAnswer(code, round.id, '3', 'late')).toEqual({
    ok: false,
    error: 'answer-too-late',
  });
  const state = await snapshot(code);
  expect(state.room.phase).toBe('reveal');
  expect(state.ownAnswer).toBeNull();
  expect(state.score).toBe(0);
});

it('derives countdowns from deadlines, automatically reveals at zero, and disposes its interval', async () => {
  vi.useFakeTimers();
  const { code } = await practice();
  let latest: { seconds: number; state: RoomSnapshot | null } | undefined;
  const subscription = TestBed.inject(GameTimingService)
    .watch(code)
    .subscribe((frame) => (latest = frame));
  expect(latest?.seconds).toBe(20);
  now += 19999;
  await vi.advanceTimersByTimeAsync(100);
  expect(latest?.seconds).toBe(1);
  expect(latest?.state?.room.phase).toBe('question');
  now += 1;
  await vi.advanceTimersByTimeAsync(100);
  expect(latest?.seconds).toBe(0);
  expect((await snapshot(code)).room.phase).toBe('reveal');
  subscription.unsubscribe();
  expect(vi.getTimerCount()).toBe(0);
});

it('rolls back only the restarted attempt and rejects stale answers and timers', async () => {
  const { gateway, code } = await practice();
  const old = (await snapshot(code)).room.currentRound!;
  await gateway.submitAnswer(code, old.id, '3', 'first');
  await gateway.developerAction(code, 'reveal', (await snapshot(code)).room.currentRound!.id);
  expect((await snapshot(code)).score).toBe(150);
  await gateway.developerAction(code, 'restart', (await snapshot(code)).room.currentRound!.id);
  const restarted = await snapshot(code);
  expect(restarted.score).toBe(0);
  expect(restarted.ownAnswer).toBeNull();
  expect(restarted.room.currentRound?.id).not.toBe(old.id);
  expect(await gateway.expire(code, old.id)).toEqual({ ok: false, error: 'stale-round' });
  expect(await gateway.submitAnswer(code, old.id, '3', 'stale')).toEqual({
    ok: false,
    error: 'stale-round',
  });
});

it.each([
  ['general-knowledge', ['3', '3', '2']],
  ['programming-basics', ['2', '3', '1']],
])('plays every question of %s and persists an accurate final result', async (quizId, answers) => {
  const { gateway, code } = await practice(quizId as string);
  for (const option of answers as string[]) {
    const state = await snapshot(code);
    expect(state.room.phase).toBe('question');
    await gateway.submitAnswer(code, state.room.currentRound!.id, option, crypto.randomUUID());
    await gateway.developerAction(code, 'reveal', (await snapshot(code)).room.currentRound!.id);
    await gateway.developerAction(code, 'advance', (await snapshot(code)).room.currentRound!.id);
  }
  const final = await snapshot(code);
  expect(final.room.phase).toBe('finished');
  expect(final.score).toBe(450);
  const result = await TestBed.inject(RESULT_REPOSITORY).getByRoom(code);
  expect(result?.questionCount).toBe(3);
  expect(result?.standings[0].correctAnswers).toBe(3);
  expect(playerStatistics(result!.standings[0], 3).accuracy).toBe(100);
  expect(result?.standings.some((p) => p.playerId === final.room.hostId)).toBe(false);
  expect(
    await gateway.developerAction(code, 'advance', (await snapshot(code)).room.currentRound!.id),
  ).toEqual({
    ok: false,
    error: 'invalid-phase',
  });
});

it('counts correct, incorrect and unanswered questions and preserves finished games on replay', async () => {
  const { gateway, code } = await practice();
  let state = await snapshot(code);
  await gateway.submitAnswer(code, state.room.currentRound!.id, '3', 'correct');
  await gateway.developerAction(code, 'reveal', (await snapshot(code)).room.currentRound!.id);
  await gateway.developerAction(code, 'advance', (await snapshot(code)).room.currentRound!.id);
  state = await snapshot(code);
  await gateway.submitAnswer(code, state.room.currentRound!.id, '1', 'incorrect');
  await gateway.developerAction(code, 'reveal', (await snapshot(code)).room.currentRound!.id);
  await gateway.developerAction(code, 'advance', (await snapshot(code)).room.currentRound!.id);
  state = await snapshot(code);
  now = state.room.currentRound!.deadline;
  await gateway.expire(code, state.room.currentRound!.id);
  await gateway.developerAction(code, 'advance', (await snapshot(code)).room.currentRound!.id);
  const result = (await snapshot(code)).result!;
  expect(result.standings[0].totalPoints).toBe(150);
  expect(playerStatistics(result.standings[0], 3)).toMatchObject({
    accuracy: 33,
    incorrect: 1,
    unanswered: 1,
  });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  await TestBed.inject(ReplayService).start(result);
  const replayCode = navigate.mock.calls[0][0][1] as string;
  expect(replayCode).not.toBe(code);
  const replay = await snapshot(replayCode);
  expect(replay.room.settings).toEqual(result.settings);
  expect(replay.players).toEqual([]);
  expect(replay.room.phase).toBe('lobby');
  expect(replay.score).toBe(0);
  expect((await TestBed.inject(RESULT_REPOSITORY).getByRoom(code))?.standings).toEqual(
    result.standings,
  );
});

it('uses completed questions for statistics when a development game finishes early', async () => {
  const { gateway, code } = await practice();
  await gateway.developerAction(code, 'finish', (await snapshot(code)).room.currentRound!.id);
  const result = (await snapshot(code)).result!;
  expect(result.questionCount).toBe(1);
  expect(result.plannedQuestionCount).toBe(3);
  expect(result.standings.map((p) => p.totalPoints)).toEqual([0, 0]);
  expect(result.standings.filter((p) => p.rank === 1)).toHaveLength(1);
});

it('ranks by points, correct count, correct-answer time, then original join order', () => {
  const store = TestBed.inject(ROOM_STORE);
  const base = store.changes.value![0];
  const [a, b, c] = base.players;
  const solution = { questionId: 'general-1', correctOptionId: '3', explanation: 'Test fixture' };
  const reveals = [
    {
      roundId: 'one',
      questionId: 'general-1',
      index: 0,
      solution,
      awards: [
        { playerId: a.id, points: 100, correct: true, responseTimeMs: 1000 },
        { playerId: b.id, points: 50, correct: true, responseTimeMs: 3000 },
        { playerId: c.id, points: 50, correct: true, responseTimeMs: 2000 },
      ],
    },
    {
      roundId: 'two',
      questionId: 'general-2',
      index: 1,
      solution,
      awards: [
        { playerId: a.id, points: 0, correct: false, responseTimeMs: 0 },
        { playerId: b.id, points: 50, correct: true, responseTimeMs: 3000 },
        { playerId: c.id, points: 50, correct: true, responseTimeMs: 2000 },
      ],
    },
  ];
  const engine = TestBed.inject(LocalGameEngine);
  expect(engine.standings({ ...base, reveals }).map((p) => p.playerId)).toEqual([c.id, b.id, a.id]);
  expect(engine.standings(base).map((p) => p.playerId)).toEqual([a.id, b.id, c.id]);
  const higherPoints = reveals.map((r, i) =>
    i
      ? r
      : {
          ...r,
          awards: r.awards.map((award) =>
            award.playerId === a.id ? { ...award, points: 200 } : award,
          ),
        },
  );
  expect(engine.standings({ ...base, reveals: higherPoints })[0].playerId).toBe(a.id);
});

it('does not keep countdown intervals alive after reveal or finish', async () => {
  vi.useFakeTimers();
  const { gateway, code } = await practice();
  const subscription = TestBed.inject(GameTimingService).watch(code).subscribe();
  expect(vi.getTimerCount()).toBe(1);
  await gateway.developerAction(code, 'reveal', (await snapshot(code)).room.currentRound!.id);
  expect(vi.getTimerCount()).toBe(0);
  await gateway.developerAction(code, 'advance', (await snapshot(code)).room.currentRound!.id);
  expect(vi.getTimerCount()).toBe(1);
  await gateway.developerAction(code, 'finish', (await snapshot(code)).room.currentRound!.id);
  expect(vi.getTimerCount()).toBe(0);
  subscription.unsubscribe();
});
