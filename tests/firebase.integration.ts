import '@angular/compiler';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, deleteDoc, writeBatch, query, where, limit } from 'firebase/firestore';
import { filter, firstValueFrom, timeout } from 'rxjs';
import { FirebaseConnection } from '../src/app/core/infrastructure/firebase/firebase-connection';
import { FirestoreRoomGateway, RemoteRoom } from '../src/app/core/infrastructure/firebase/firestore-room.gateway';
import { FirestoreQuizRepository, FirestoreResultRepository } from '../src/app/core/infrastructure/firebase/firestore-repositories';
import { ScoringService } from '../src/app/core/domain/scoring.service';
import { MOCK_QUIZZES, MOCK_QUESTIONS, MOCK_SOLUTIONS } from '../src/app/content/quizzes/quizzes.mock';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, signOut, inMemoryPersistence, setPersistence, onAuthStateChanged, deleteUser } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, terminate } from 'firebase/firestore';
import { CommandResult } from '../src/app/core/ports/room-gateway';
import { defaultRoomSettings } from '../src/app/core/domain/room-settings';
import { AdminRepository } from '../src/app/core/infrastructure/firebase/admin.repository';
import { OWNER_EMAIL, newDraft, QuizDraft } from '../src/app/core/domain/admin-quiz';
import { RoomQuestionSet } from '../src/app/core/domain/room-question-set';

let env: RulesTestEnvironment;
const injectors: EnvironmentInjector[] = [];
const subscriptions: { unsubscribe(): void }[] = [];
const errors: unknown[] = [];
before(async () => {
  assert.equal(process.env['FIRESTORE_EMULATOR_HOST'], '127.0.0.1:8080');
  env = await initializeTestEnvironment({ projectId: 'demo-quiz-game',
    firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } });
});
beforeEach(async () => {
  for (const subscription of subscriptions.splice(0)) subscription.unsubscribe();
  for (const injector of injectors.splice(0)) injector.destroy();
  errors.length = 0;
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'hostAccess', 'host'), { enabled: true });
    batch.set(doc(db, 'hostAccess', 'owner'), { enabled: true });
    batch.set(doc(db, 'adminConfiguration', 'owner'), { uid: 'owner', email: OWNER_EMAIL, enabled: true });
    batch.set(doc(db, 'hostEmails', 'owner@example.com'), { enabled: true });
    for (const quiz of MOCK_QUIZZES) {
      batch.set(doc(db, 'quizzes', quiz.id), { ...quiz, published: true, archived: false });
      batch.set(doc(db, 'quizzes', quiz.id, 'versions', String(quiz.version)), quiz);
      for (const question of MOCK_QUESTIONS.filter((entry) => entry.quizId === quiz.id))
        batch.set(doc(db, 'quizzes', quiz.id, 'versions', String(quiz.version), 'questions', question.id), question);
      batch.set(doc(db, 'quizSolutions', `${quiz.id}_v1`), {
        solutions: MOCK_SOLUTIONS.filter((entry) => quiz.questionIds.includes(entry.questionId)),
      });
    }
    await batch.commit();
  });
});
after(async () => {
  for (const subscription of subscriptions) subscription.unsubscribe();
  for (const injector of injectors) injector.destroy();
  await env?.cleanup();
});
function client(uid: string, claims?: Parameters<RulesTestEnvironment['authenticatedContext']>[1]) {
  const db = env.authenticatedContext(uid, claims).firestore();
  const connection = { db, auth: { currentUser: { uid } }, ready: async () => ({ uid }),
    report: (error: unknown) => errors.push(error) };
  const injector = createEnvironmentInjector([
    { provide: FirebaseConnection, useValue: connection },
    FirestoreQuizRepository, FirestoreResultRepository, AdminRepository, { provide: ScoringService, useValue: new ScoringService() },
  ], null as unknown as EnvironmentInjector);
  injectors.push(injector);
  return { db, rooms: runInInjectionContext(injector, () => new FirestoreRoomGateway()),
    quizzes: injector.get(FirestoreQuizRepository), results: injector.get(FirestoreResultRepository), admin: injector.get(AdminRepository) };
}
function value<T>(result: CommandResult<T>): T {
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
async function create(host = client('host'), count = 2) {
  const quiz = MOCK_QUIZZES[1];
  const room = value(await host.rooms.create(quiz.id, { ...defaultRoomSettings(quiz), questionCount: count }));
  return { host, room };
}
function watch(host: ReturnType<typeof client>, code: string) {
  const subscription = host.rooms.observe(code).subscribe();
  subscriptions.push(subscription);
  return subscription;
}
async function joinedGame(count = 2) {
  const { host, room } = await create(undefined, count);
  watch(host, room.code);
  const a = client('player-a');
  const b = client('player-b');
  value(await a.rooms.join(room.code, 'Аня'));
  value(await b.rooms.join(room.code, 'Борис'));
  return { host, room, a, b };
}

test('only enabled hosts can create rooms; protected solutions stay private', async () => {
  const player = client('player');
  assert.equal((await player.quizzes.list()).length, 3);
  assert.equal((await player.quizzes.getQuestions('general-knowledge')).length, 3);
  assert.equal((await player.rooms.create('general-knowledge')).ok, false);
  await assertFails(getDoc(doc(player.db, 'quizSolutions', 'general-knowledge_v1')));
  await assertFails(setDoc(doc(player.db, 'hostAccess', 'player'), { enabled: true }));
  await assertFails(getDocs(collection(player.db, 'rooms')));
  await assertFails(getDocs(collection(player.db, 'roomCodes')));
  assert.deepEqual(await client('host').rooms.create('quran-three-surahs'), { ok: false, error: 'content-unavailable' });
  await create();
});

function owner() { return client('owner', { email: OWNER_EMAIL, email_verified: true, admin: true, auth_time: Math.floor(Date.now() / 1000) }); }
function validDraft(count = 1): QuizDraft {
  const draft = newDraft();
  draft.quiz = { ...draft.quiz, title: 'Новый набор', description: 'Проверенный набор', topic: 'Наука' };
  draft.reviewed = true;
  draft.questions = Array.from({ length: count }, (_, index) => ({ id: `question-${index}`, quizId: draft.quiz.id,
    prompt: `Вопрос ${index + 1}`, options: ['1', '2', '3', '4'].map((id) => ({ id, text: `Вариант ${id}` })),
    timeLimitSeconds: 20, status: 'approved' }));
  draft.solutions = draft.questions.map((question) => ({ questionId: question.id, correctOptionId: '1', explanation: 'Проверенное объяснение.', reference: '' }));
  return draft;
}
function customContent(quizId = 'general-knowledge', count = 1): RoomQuestionSet {
  const draft = validDraft(count);
  return { reviewed: true, questions: draft.questions.map((question) => ({ ...question, quizId })), solutions: draft.solutions, revision: 0 };
}
test('room creator can edit text, options, answer keys, selection and order without changing the shared quiz', async () => {
  const { host, room, a, b } = await joinedGame(3);
  const original = value(await host.rooms.editableRoomQuestions(room.code));
  const changed: RoomQuestionSet = { ...original, reviewed: true,
    questions: [original.questions[2], { ...original.questions[0], prompt: 'Вопрос, изменённый ведущим',
      status: 'approved', options: ['1', '2', '3', '4'].map((id) => ({ id, text: `Новый вариант ${id}` })) }]
      .map((question) => ({ ...question, status: 'approved' })),
    solutions: [original.solutions[2], { ...original.solutions[0], correctOptionId: '2', explanation: 'Новое проверенное объяснение.' }] };
  value(await host.rooms.updateQuestions(room.code, changed));
  assert.equal((await a.rooms.publicQuestions(room.code))[1].prompt, 'Вопрос, изменённый ведущим');
  assert.deepEqual((await a.rooms.publicQuestions(room.code)).map((question) => question.id), ['general-3', 'general-1']);
  assert.equal((await a.quizzes.getQuestions('general-knowledge'))[0].prompt, 'Какая планета ближе всего к Солнцу?');
  assert.deepEqual(await host.rooms.updateQuestions(room.code, changed), { ok: false, error: 'invalid-settings' });
  assert.deepEqual(await a.rooms.editableRoomQuestions(room.code), { ok: false, error: 'forbidden' });
  await assertFails(getDoc(doc(a.db, 'rooms', room.code, 'private', 'solutions')));
  await assertFails(updateDoc(doc(a.db, 'rooms', room.code), { contentRevision: 999 }));
  const started = value(await host.rooms.start(room.code));
  value(await host.rooms.revealAnswer(room.code, started.currentRound!.id));
  value(await host.rooms.advanceQuestion(room.code, started.currentRound!.id));
  const next = (await getDoc(doc(host.db, 'rooms', room.code))).data() as RemoteRoom;
  assert.equal(next.currentRound?.questionId, 'general-1');
  value(await a.rooms.submitAnswer(room.code, next.currentRound!.id, '2', 'custom-answer'));
  value(await host.rooms.revealAnswer(room.code, next.currentRound!.id));
  const revealed = (await getDoc(doc(a.db, 'rooms', room.code))).data() as RemoteRoom;
  assert.equal(revealed.reveal?.solution.correctOptionId, '2');
  assert.equal(revealed.reveal?.awards.find((award) => award.playerId === 'player-a')?.correct, true);
  const latest = value(await host.rooms.editableRoomQuestions(room.code));
  assert.deepEqual(await host.rooms.updateQuestions(room.code, latest), { ok: false, error: 'game-started' });
  await assertFails(updateDoc(doc(host.db, 'rooms', room.code, 'private', 'solutions'), { reviewed: false }));
  await assertFails(updateDoc(doc(host.db, 'rooms', room.code, 'content', 'questions'), { questions: [] }));
});

test('verified Google host can create a 15-question private room and a reviewed room from the Quran placeholder', async () => {
  const host = client('google-host', { email: 'owner@example.com', email_verified: true });
  const content = customContent('general-knowledge', 15);
  const room = value(await host.rooms.create('general-knowledge', undefined, 'Ведущий', content));
  assert.equal(room.questionIds.length, 15);
  assert.equal(room.hasCustomQuestions, true);
  assert.equal((await host.rooms.publicQuestions(room.code)).length, 15);
  const editable = value(await host.rooms.editableRoomQuestions(room.code));
  value(await host.rooms.updateQuestions(room.code, { ...editable, reviewed: true,
    questions: editable.questions.map((question, index) => index === 0 ? { ...question, prompt: 'Изменённый вопрос большого набора' } : question) }));
  assert.equal((await host.rooms.publicQuestions(room.code))[0].prompt, 'Изменённый вопрос большого набора');
  assert.equal((await client('player').quizzes.getQuestions('general-knowledge')).length, 3);
  assert.deepEqual(await host.rooms.create('quran-three-surahs'), { ok: false, error: 'content-unavailable' });
  const quranContent = customContent('quran-three-surahs');
  const quranRoom = value(await host.rooms.create('quran-three-surahs', undefined, 'Ведущий', quranContent));
  assert.equal(quranRoom.settings.questionCount, 1);
  assert.equal((await client('player').quizzes.get('quran-three-surahs'))?.status, 'placeholder');
  watch(host, quranRoom.code);
  const a = client('player-a'); const b = client('player-b');
  value(await a.rooms.join(quranRoom.code, 'Первый')); value(await b.rooms.join(quranRoom.code, 'Второй'));
  const started = value(await host.rooms.start(quranRoom.code));
  value(await a.rooms.submitAnswer(quranRoom.code, started.currentRound!.id, '1', 'answer'));
  value(await host.rooms.revealAnswer(quranRoom.code, started.currentRound!.id));
  value(await host.rooms.advanceQuestion(quranRoom.code, started.currentRound!.id));
  const result = await a.results.getByRoom(quranRoom.code);
  assert.equal(result?.hasCustomQuestions, true);
  const replay = value(await host.rooms.editableRoomQuestions(quranRoom.code));
  const replayRoom = value(await host.rooms.create('quran-three-surahs', result!.settings, result!.hostNickname, replay));
  assert.deepEqual((await host.rooms.publicQuestions(replayRoom.code)).map((question) => question.prompt), replay.questions.map((question) => question.prompt));
  await assertFails(getDoc(doc(a.db, 'rooms', replayRoom.code, 'content', 'questions')));
  await assertFails(updateDoc(doc(host.db, 'quizzes', 'quran-three-surahs'), { status: 'approved' }));
});

test('room content validation is enforced by Rules and cannot be bypassed with direct writes', async () => {
  const host = client('host');
  const content = customContent();
  const room = value(await host.rooms.create('general-knowledge', undefined, 'Ведущий', content));
  const parent = doc(host.db, 'rooms', room.code);
  await assertFails(updateDoc(doc(host.db, 'rooms', room.code, 'content', 'questions'), { questions: [{ correctOptionId: '1' }] }));
  for (const mutation of ['public-key', 'invalid-option', 'unreviewed', 'missing-question']) {
    const snapshot = (await getDoc(parent)).data() as RemoteRoom;
    const revision = snapshot.contentRevision! + 1;
    const question: Record<string, unknown> = { ...content.questions[0], metadata: { position: 0 } };
    if (mutation === 'public-key') question['correctOptionId'] = '1';
    const batch = writeBatch(host.db);
    batch.update(parent, { contentRevision: revision, revision: snapshot.revision + 1 });
    batch.set(doc(parent, 'content', 'questions'), { revision, questions: mutation === 'missing-question' ? [] : [question] });
    batch.set(doc(parent, 'private', 'solutions'), { revision, reviewed: mutation !== 'unreviewed', solutions: [{ ...content.solutions[0],
      reference: '', correctOptionId: mutation === 'invalid-option' ? '9' : '1' }] });
    for (const part of ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ready']) batch.set(doc(parent, 'contentChecks', part), { revision });
    await assertFails(batch.commit());
  }
  const rejected = await client('player').rooms.create('general-knowledge', undefined, 'Самозванец', content);
  assert.equal(rejected.ok, false);
  assert.deepEqual(await host.rooms.create('general-knowledge', undefined, 'Ведущий', { ...content, reviewed: false }), { ok: false, error: 'invalid-settings' });
});
test('owner access requires the pinned identity, verified email, claim and enabled record', async () => {
  const claims = { email: OWNER_EMAIL, email_verified: true, admin: true, auth_time: Math.floor(Date.now() / 1000) };
  for (const user of [client('outsider', claims), client('owner', { ...claims, admin: false }),
    client('owner', { ...claims, email_verified: false }), client('owner', { ...claims, email: 'other@example.com' }), client('host')]) {
    await assertFails(getDoc(doc(user.db, 'adminConfiguration', 'owner')));
    await assertFails(getDocs(query(collection(user.db, 'adminDrafts'), limit(20))));
    await assertFails(setDoc(doc(user.db, 'adminDrafts', 'forged'), { admin: true }));
  }
  const admin = owner();
  await assertSucceeds(getDoc(doc(admin.db, 'adminConfiguration', 'owner')));
  await assertFails(updateDoc(doc(admin.db, 'adminConfiguration', 'owner'), { uid: 'attacker' }));
  await env.withSecurityRulesDisabled((context) => updateDoc(doc(context.firestore(), 'adminConfiguration', 'owner'), { enabled: false }));
  await assertFails(getDoc(doc(admin.db, 'adminConfiguration', 'owner')));
});

test('owner draft publication produces a playable immutable version and supports all 15 questions', async () => {
  const admin = owner();
  const draft = validDraft(15);
  draft.revision = await admin.admin.save(draft);
  await assertFails(getDoc(doc(client('host').db, 'adminDrafts', draft.id)));
  await admin.admin.publish(draft);
  const quiz = await client('player').quizzes.get(draft.quiz.id);
  assert.equal(quiz?.questionIds.length, 15);
  assert.deepEqual((await client('player').quizzes.getQuestions(draft.quiz.id)).map((question) => question.id), draft.questions.map((question) => question.id));
  assert.equal((await client('player').quizzes.list()).length, 4);
  await assertFails(updateDoc(doc(admin.db, 'quizzes', draft.quiz.id, 'versions', '1'), { title: 'Changed' }));
  await assertFails(updateDoc(doc(admin.db, 'quizzes', draft.quiz.id, 'versions', '1', 'questions', 'question-0'), { prompt: 'Changed' }));
  await assertFails(updateDoc(doc(admin.db, 'quizSolutions', `${draft.quiz.id}_v1`), { solutions: [] }));
  const room = value(await admin.rooms.create(draft.quiz.id));
  watch(admin, room.code);
  const a = client('player-a'); const b = client('player-b');
  value(await a.rooms.join(room.code, 'Первый')); value(await b.rooms.join(room.code, 'Второй'));
  const started = value(await admin.rooms.start(room.code));
  value(await a.rooms.submitAnswer(room.code, started.currentRound!.id, '1', 'answer'));
  value(await admin.rooms.revealAnswer(room.code, started.currentRound!.id));
  assert.equal((await getDoc(doc(a.db, 'rooms', room.code))).data()?.['standings'][0].playerId, 'player-a');
  const revised = await admin.admin.editPublished(draft.quiz.id);
  revised.quiz = { ...revised.quiz, title: 'Новая версия' }; revised.reviewed = true;
  revised.revision = await admin.admin.save(revised);
  await admin.admin.publish(revised);
  assert.equal((await a.quizzes.get(draft.quiz.id))?.version, 2);
  assert.equal((await getDoc(doc(a.db, 'rooms', room.code))).data()?.['quizVersion'], 1);
  await admin.admin.archiveQuiz(draft.quiz.id, true);
  assert.equal((await a.quizzes.list()).some((entry) => entry.id === draft.quiz.id), false);
  assert.equal((await admin.rooms.create(draft.quiz.id)).ok, false);
  assert.equal((await a.quizzes.getQuestions(draft.quiz.id, 1)).length, 15);
  value(await admin.rooms.advanceQuestion(room.code, started.currentRound!.id));
});

test('draft conflict checks, settings limits and recent-auth checks are enforced', async () => {
  const admin = owner();
  const draft = validDraft();
  draft.revision = await admin.admin.save(draft);
  const stale = structuredClone(draft);
  draft.revision = await admin.admin.save(draft);
  await assert.rejects(admin.admin.save(stale), /другой вкладке/);
  await assert.rejects(admin.admin.publish(stale), /актуальный черновик/);
  await admin.admin.saveDefaults({ ...defaultRoomSettings(MOCK_QUIZZES[1]), questionCount: 15 });
  await assertFails(setDoc(doc(client('host').db, 'appSettings', 'gameDefaults'), { questionCount: 1 }));
  await assertFails(updateDoc(doc(admin.db, 'appSettings', 'gameDefaults'), { maxPlayers: 100 }));
  const oldSession = client('owner', { email: OWNER_EMAIL, email_verified: true, admin: true, auth_time: Math.floor(Date.now() / 1000) - 3600 });
  const recentDraft = validDraft(); recentDraft.revision = await oldSession.admin.save(recentDraft);
  await assert.rejects(oldSession.admin.publish(recentDraft));
  await assertFails(getDocs(collection(admin.db, 'rooms')));
  assert.ok((await admin.admin.page('rooms')).rows.length <= 20);
});

test('server rejects malformed publication, missing documents and answer keys in public questions', async () => {
  const admin = owner();
  const draft = validDraft(); draft.revision = await admin.admin.save(draft);
  draft.reviewed = false;
  await assert.rejects(admin.admin.publish(draft), /проверку/);
  await assertFails(setDoc(doc(admin.db, 'quizzes', 'malformed', 'versions', '1'), { ...draft.quiz, id: 'malformed', reviewed: true, questionIds: ['missing'] }));
  draft.reviewed = true; await admin.admin.publish(draft);
  await assertFails(setDoc(doc(admin.db, 'quizzes', draft.quiz.id, 'versions', '1', 'questions', 'new-question'), {
    ...draft.questions[0], id: 'new-question', correctOptionId: '1', metadata: { position: 0 },
  }));
  await assertFails(updateDoc(doc(admin.db, 'rooms', 'UNKNOWN'), { phase: 'finished' }));
});

test('real anonymous Auth emulator credentials authorize Firestore reads', async () => {
  const app = initializeApp({ projectId: 'demo-quiz-game', apiKey: 'demo-api-key' }, 'auth-integration');
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  await setPersistence(auth, inMemoryPersistence);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  try {
    const user = (await signInAnonymously(auth)).user;
    assert.equal(user.isAnonymous, true);
    assert.ok(user.uid);
    assert.equal((await getDoc(doc(db, 'quizzes', 'general-knowledge'))).exists(), true);
    await assertFails(getDoc(doc(db, 'quizSolutions', 'general-knowledge_v1')));
    await signOut(auth);
    // Force a server query so an authenticated cached document cannot satisfy this check.
    await assertFails(getDocs(collection(db, 'quizzes')));
  } finally { await terminate(db); await deleteApp(app); }
});

test('Firebase connection shares one identity across concurrent initial readers', async () => {
  const connection = new FirebaseConnection();
  assert.equal(connection.app.options.projectId, 'demo-quiz-game');
  const initialState = new Promise((resolve) => {
    const stop = onAuthStateChanged(connection.auth, (user) => { stop(); resolve(user); });
  });
  const first = connection.ready();
  await initialState;
  const [a, b, c] = await Promise.all([first, connection.ready(), connection.ready()]);
  try {
    assert.equal(a.uid, b.uid); assert.equal(b.uid, c.uid);
    assert.equal((await connection.ready()).uid, a.uid);
    assert.equal(connection.status(), 'Подключено');
  } finally {
    for (const user of new Map([a, b, c].map((user) => [user.uid, user])).values()) await deleteUser(user);
    await terminate(connection.db); await deleteApp(connection.app);
  }
});

test('Google host allowlist requires verified email; clients cannot grant themselves access', async () => {
  for (const verified of [false, true]) {
    const db = env.authenticatedContext(`google-${verified}`, { email: 'owner@example.com', email_verified: verified }).firestore();
    const request = getDoc(doc(db, 'quizSolutions', 'general-knowledge_v1'));
    if (verified) await assertSucceeds(request); else await assertFails(request);
    await assertFails(setDoc(doc(db, 'hostEmails', 'attacker@example.com'), { enabled: true }));
  }
});

test('host admits real identities and publishes authoritative answers, scores and final results', async () => {
  const { host, room, a, b } = await joinedGame();
  const outsider = client('outsider');
  assert.deepEqual(await outsider.rooms.join(room.code, 'Аня'), { ok: false, error: 'name-taken' });
  const started = value(await host.rooms.start(room.code));
  const round = started.currentRound!;
  assert.ok(round.openedAt > 0 && round.deadline - round.openedAt === 20000);
  const replay = client('player-a');
  assert.equal(value(await replay.rooms.join(room.code, 'Новое имя')).displayName, 'Аня');
  assert.deepEqual(await outsider.rooms.join(room.code, 'Новый'), { ok: false, error: 'game-started' });
  const answer = value(await a.rooms.submitAnswer(room.code, round.id, '3', 'answer-a'));
  assert.ok(answer.acceptedAt >= round.openedAt);
  assert.deepEqual(value(await a.rooms.submitAnswer(room.code, round.id, '3', 'answer-a')), answer);
  assert.deepEqual(await a.rooms.submitAnswer(room.code, round.id, '1', 'different'), { ok: false, error: 'already-answered' });
  value(await b.rooms.submitAnswer(room.code, round.id, '1', 'answer-b'));
  await assertFails(getDoc(doc(b.db, 'rooms', room.code, 'rounds', round.id, 'answers', 'player-a')));
  await assertFails(getDocs(collection(b.db, 'rooms', room.code, 'rounds', round.id, 'answers')));
  assert.deepEqual(await a.rooms.revealAnswer(room.code, round.id), { ok: false, error: 'forbidden' });
  const secondHostTab = client('host');
  await Promise.all([host.rooms.revealAnswer(room.code, round.id), secondHostTab.rooms.revealAnswer(room.code, round.id)])
    .then((results) => results.forEach(value));
  const revealed = (await getDoc(doc(host.db, 'rooms', room.code))).data() as RemoteRoom;
  assert.equal(revealed.phase, 'reveal');
  assert.equal(revealed.reveal?.solution.correctOptionId, '3');
  assert.equal(revealed.standings[0].playerId, 'player-a');
  assert.ok(revealed.standings[0].totalPoints >= 100 && revealed.standings[0].totalPoints <= 150);
  value(await host.rooms.revealAnswer(room.code, round.id));
  assert.deepEqual((await getDoc(doc(host.db, 'rooms', room.code))).data()?.['standings'], revealed.standings);
  value(await host.rooms.advanceQuestion(room.code, round.id));
  assert.deepEqual(await host.rooms.advanceQuestion(room.code, round.id), { ok: false, error: 'stale-round' });
  const next = (await getDoc(doc(host.db, 'rooms', room.code))).data() as RemoteRoom;
  value(await host.rooms.revealAnswer(room.code, next.currentRound!.id));
  value(await host.rooms.advanceQuestion(room.code, next.currentRound!.id));
  const result = await a.results.getByRoom(room.code);
  assert.equal(result?.isDemo, false);
  assert.equal(result?.questionCount, 2);
  assert.equal(result?.quizVersion, 1);
  assert.equal((await a.results.list()).length, 1);
  assert.equal((await outsider.results.list()).length, 0);
  await assertFails(getDoc(doc(outsider.db, 'results', room.code)));
  assert.equal(errors.filter((error) => (error as {code?: string}).code !== 'permission-denied').length, 0);
});

test('capacity is enforced during concurrent admissions and players cannot change membership or scores', async () => {
  const { host, room } = await create();
  watch(host, room.code);
  const players = Array.from({ length: 16 }, (_, index) => client(`player-${index}`));
  const results = await Promise.all(players.map((player, index) => player.rooms.join(room.code, `Игрок ${index}`)));
  assert.equal(results.filter((result) => result.ok).length, 15);
  assert.equal(results.filter((result) => !result.ok && result.error === 'room-full').length, 1);
  const member = players[results.findIndex((result) => result.ok)];
  const ref = doc(member.db, 'rooms', room.code);
  await assertFails(updateDoc(ref, { playerIds: ['attacker'] }));
  await assertFails(updateDoc(ref, { standings: [{ totalPoints: 999999 }] }));
  await assertFails(updateDoc(ref, { hostId: 'attacker' }));
  await assertFails(deleteDoc(ref));
});

test('rules reject forged identities, invalid options, altered answers and late submissions', async () => {
  const { host, room, a, b } = await joinedGame();
  const round = value(await host.rooms.start(room.code)).currentRound!;
  const ref = doc(a.db, 'rooms', room.code, 'rounds', round.id, 'answers', 'player-a');
  const payload = { id: 'cmd', commandId: 'cmd', roomId: room.id, playerId: 'player-a', questionId: round.questionId,
    roundIndex: round.index, roundId: round.id, optionId: '3', acceptedAt: serverTimestamp() };
  await assertFails(setDoc(doc(b.db, 'rooms', room.code, 'rounds', round.id, 'answers', 'player-a'), payload));
  await assertFails(setDoc(ref, { ...payload, optionId: 'unknown' }));
  await assertFails(setDoc(ref, { ...payload, points: 10000 }));
  await assertFails(setDoc(ref, { ...payload, acceptedAt: Timestamp.fromMillis(0) }));
  await assertSucceeds(setDoc(ref, payload));
  await assertFails(updateDoc(ref, { optionId: '1' }));
  await assertFails(deleteDoc(ref));
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'rooms', room.code, 'rounds', round.id), {
      startedAt: Timestamp.fromMillis(Date.now() - 60000),
    });
  });
  const late = { ...payload, playerId: 'player-b', id: 'late', commandId: 'late' };
  await assertFails(setDoc(doc(b.db, 'rooms', room.code, 'rounds', round.id, 'answers', 'player-b'), late));
});

test('host refresh recovers a closed round and realtime subscriptions expose only own accepted answer', async () => {
  const { host, room, a, b } = await joinedGame(1);
  const round = value(await host.rooms.start(room.code)).currentRound!;
  const observing = firstValueFrom(a.rooms.observe(room.code).pipe(filter((state) => !!state?.ownAnswer), timeout(10000)));
  value(await a.rooms.submitAnswer(room.code, round.id, '3', 'cmd'));
  const state = await observing;
  assert.equal(state?.ownAnswer?.playerId, 'player-a');
  assert.equal(state?.canUseDevControls, false);
  await env.withSecurityRulesDisabled(async (context) => {
    const batch = writeBatch(context.firestore());
    batch.update(doc(context.firestore(), 'rooms', room.code), { closing: true });
    batch.update(doc(context.firestore(), 'rooms', room.code, 'rounds', round.id), { closed: true });
    await batch.commit();
  });
  const recovered = client('host');
  const recovery = firstValueFrom(recovered.rooms.observe(room.code).pipe(filter((snapshot) => snapshot?.room.phase === 'reveal'), timeout(10000)));
  assert.equal((await recovery)?.standings[0].totalPoints! >= 100, true);
  assert.deepEqual(await b.rooms.submitAnswer(room.code, round.id, '2', 'late'), { ok: false, error: 'answer-too-late' });
});
