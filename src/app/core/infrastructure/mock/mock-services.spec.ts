beforeEach(() => sessionStorage.clear());
import { MemoryRoomStore, ROOM_STORE } from './room-store';
import { SessionContext } from '../../state/session-context';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { QUIZ_REPOSITORY } from '../../ports/quiz-repository';
import { ROOM_GATEWAY } from '../../ports/room-gateway';
import { RESULT_REPOSITORY } from '../../ports/result-repository';
import { provideMocks } from './provide-mocks';
import { MOCK_SOLUTIONS } from '../../../content/quizzes/quizzes.mock';

beforeEach(() =>
  TestBed.configureTestingModule({
    providers: [
      ...provideMocks(),
      { provide: ROOM_STORE, useFactory: () => new MemoryRoomStore() },
    ],
  }),
);

it('provides three topic-independent quiz datasets with valid option references', async () => {
  const quizzes = TestBed.inject(QUIZ_REPOSITORY);
  const catalog = await quizzes.list();
  expect(catalog).toHaveLength(3);
  const ids: string[] = [];
  for (const quiz of catalog) {
    const questions = await quizzes.getQuestions(quiz.id);
    expect(questions.map((q) => q.id)).toEqual(quiz.questionIds);
    for (const question of questions) {
      ids.push(question.id);
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options.map((o) => o.id)).size).toBe(4);
      expect(question.timeLimitSeconds).toBeGreaterThan(0);
      if (question.status !== 'placeholder') {
        const solution = MOCK_SOLUTIONS.find((s) => s.questionId === question.id);
        expect(solution).toBeDefined();
        expect(question.options.some((o) => o.id === solution?.correctOptionId)).toBe(true);
      }
      expect(question).not.toHaveProperty('correctOptionId');
    }
  }
  expect(new Set(ids).size).toBe(ids.length);
});

it('contains exactly 15 explicitly unverified Quran slots without fabricated references or solutions', async () => {
  const questions = await TestBed.inject(QUIZ_REPOSITORY).getQuestions('quran-three-surahs');
  expect(questions).toHaveLength(15);
  for (const number of [11, 12, 71])
    expect(questions.filter((q) => q.metadata?.['surahNumber'] === number)).toHaveLength(5);
  for (const q of questions) {
    expect(q.status).toBe('placeholder');
    expect(q.metadata).not.toHaveProperty('ayahStart');
    expect(q.metadata).not.toHaveProperty('ayahEnd');
    expect(MOCK_SOLUTIONS.some((s) => s.questionId === q.id)).toBe(false);
  }
});

it('returns null/empty for missing content and isolates returned data from fixtures', async () => {
  const quizzes = TestBed.inject(QUIZ_REPOSITORY);
  expect(await quizzes.get('missing')).toBeNull();
  expect(await quizzes.getQuestions('missing')).toEqual([]);
  const first = await quizzes.getQuestions('programming-basics');
  first[0].metadata!['concept'] = 'changed externally';
  expect((await quizzes.getQuestions('programming-basics'))[0].metadata?.['concept']).toBe(
    'operator precedence',
  );
});

it('creates a room with a non-competing host and versioned quiz reference', async () => {
  const gateway = TestBed.inject(ROOM_GATEWAY);
  const result = await gateway.create('general-knowledge');
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected created room');
  expect(result.value.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  expect(result.value.quizVersion).toBe(1);
  expect(result.value.playerIds).not.toContain(result.value.hostId);
  expect((await firstValueFrom(gateway.observe(result.value.code)))?.players).toEqual([]);
});

it('rejects missing and placeholder quizzes at the service boundary', async () => {
  const gateway = TestBed.inject(ROOM_GATEWAY);
  expect(await gateway.create('missing')).toEqual({ ok: false, error: 'quiz-not-found' });
  expect(await gateway.create('quran-three-surahs')).toEqual({
    ok: false,
    error: 'content-unavailable',
  });
});

it('normalizes codes, rejects duplicate and invalid names, and updates live room streams', async () => {
  const gateway = TestBed.inject(ROOM_GATEWAY);
  const counts: number[] = [];
  const subscription = gateway
    .observe('demo22')
    .subscribe((s) => counts.push(s?.players.length ?? 0));
  expect(await gateway.join(' DEMO22 ', ' аНя ')).toEqual({ ok: false, error: 'name-taken' });
  expect(await gateway.join('DEMO22', '   ')).toEqual({ ok: false, error: 'invalid-name' });
  expect(await gateway.join('DEMO22', 'x'.repeat(25))).toEqual({
    ok: false,
    error: 'invalid-name',
  });
  const result = await gateway.join(' demo22 ', '  Саша  ');
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.value.displayName).toBe('Саша');
  expect(counts[0]).toBe(3);
  expect(counts.at(-1)).toBe(4);
  subscription.unsubscribe();
});

it('enforces capacity and handles missing rooms', async () => {
  const gateway = TestBed.inject(ROOM_GATEWAY);
  for (let i = 0; i < 12; i++) {
    TestBed.inject(SessionContext).clear('demo-room');
    expect((await gateway.join('DEMO22', `Игрок ${i}`)).ok).toBe(true);
  }
  TestBed.inject(SessionContext).clear('demo-room');
  expect(await gateway.join('DEMO22', 'Лишний')).toEqual({ ok: false, error: 'room-full' });
  expect(await gateway.join('ABCDEF', 'Имя')).toEqual({ ok: false, error: 'room-not-found' });
  expect(await firstValueFrom(gateway.observe('ABCDEF'))).toBeNull();
});

it('keeps illustrative results scoped to a game and handles missing results', async () => {
  const results = TestBed.inject(RESULT_REPOSITORY);
  const result = await results.getByRoom('finish');
  expect(result?.isDemo).toBe(true);
  expect(result?.winnerId).toBe(result?.standings[0].playerId);
  expect(result?.standings.filter((s) => s.rank === 1)).toHaveLength(1);
  expect(await results.getByRoom('DEMO22')).toBeNull();
});

it('stores validated custom settings and selected question IDs', async () => {
  const gateway = TestBed.inject(ROOM_GATEWAY);
  const settings = {
    questionCount: 2,
    timeLimitSeconds: 30,
    pointsPerCorrectAnswer: 2000,
    speedBonusPoints: 0,
    minPlayers: 2,
    maxPlayers: 8,
  };
  const result = await gateway.create('general-knowledge', settings);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected created room');
  expect(result.value.settings).toEqual(settings);
  expect(result.value.questionIds).toEqual(['general-1', 'general-2']);
  settings.maxPlayers = 15;
  expect((await firstValueFrom(gateway.observe(result.value.code)))?.room.settings.maxPlayers).toBe(
    8,
  );
  for (let i = 0; i < 8; i++) {
    TestBed.inject(SessionContext).clear(result.value.id);
    expect((await gateway.join(result.value.code, `Друг ${i}`)).ok).toBe(true);
  }
  TestBed.inject(SessionContext).clear(result.value.id);
  expect(await gateway.join(result.value.code, 'Ещё один')).toEqual({
    ok: false,
    error: 'room-full',
  });
});

it.each([
  { questionCount: 4 },
  { questionCount: 0 },
  { questionCount: 1.5 },
  { timeLimitSeconds: 4 },
  { timeLimitSeconds: 121 },
  { pointsPerCorrectAnswer: 99 },
  { pointsPerCorrectAnswer: 5001 },
  { speedBonusPoints: -1 },
  { speedBonusPoints: 1001 },
  { maxPlayers: 1 },
  { maxPlayers: 16 },
  { maxPlayers: NaN },
])('rejects invalid settings at the adapter boundary: %j', async (overrides) => {
  const settings = {
    questionCount: 3,
    timeLimitSeconds: 20,
    pointsPerCorrectAnswer: 1000,
    speedBonusPoints: 500,
    minPlayers: 2,
    maxPlayers: 15,
    ...overrides,
  };
  expect(await TestBed.inject(ROOM_GATEWAY).create('general-knowledge', settings)).toEqual({
    ok: false,
    error: 'invalid-settings',
  });
});
