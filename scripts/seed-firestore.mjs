import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import ts from 'typescript';

const { values } = parseArgs({ options: {
  emulator: { type: 'boolean', default: false },
  'service-account': { type: 'string' },
  'host-email': { type: 'string' },
  'host-uid': { type: 'string' },
} });
if (values.emulator && process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
  throw new Error('Emulator seed requires FIRESTORE_EMULATOR_HOST=127.0.0.1:8080.');
}
if (!values.emulator && process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Unset FIRESTORE_EMULATOR_HOST to seed the live project.');
}
const projectId = values.emulator ? 'demo-quiz-game' : 'quiz-game-19c55';
const credential = values['service-account']
  ? cert(JSON.parse(await readFile(values['service-account'], 'utf8')))
  : values.emulator ? undefined : applicationDefault();
initializeApp({ projectId, ...(credential ? { credential } : {}) });
const db = getFirestore();
// This source is read by the operator tool only; solutions never enter the web bundle.
const source = await readFile(new URL('../src/app/content/quizzes/quizzes.mock.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext } }).outputText;
const { MOCK_QUIZZES: quizzes, MOCK_QUESTIONS: questions, MOCK_SOLUTIONS: solutions } =
  await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const batch = db.batch();
for (const quiz of quizzes) {
  const versionRef = db.doc(`quizzes/${quiz.id}/versions/${quiz.version}`);
  // create() protects immutable published content from accidental reseeding/overwrites.
  if (!(await versionRef.get()).exists) {
    batch.create(versionRef, { ...quiz });
    for (const question of questions.filter((entry) => entry.quizId === quiz.id)) {
      batch.create(versionRef.collection('questions').doc(question.id), question);
    }
    const keys = solutions.filter((entry) => quiz.questionIds.includes(entry.questionId));
    if (keys.length) batch.create(db.doc(`quizSolutions/${quiz.id}_v${quiz.version}`), {
      quizId: quiz.id, version: quiz.version, solutions: keys,
    });
  }
  if (!(await db.doc(`quizzes/${quiz.id}`).get()).exists)
    batch.create(db.doc(`quizzes/${quiz.id}`), { ...quiz, published: true, archived: false });
}
if (values['host-email']) {
  const email = values['host-email'].trim().toLowerCase();
  if (!/^[^/@\s]+@[^/@\s]+\.[^/@\s]+$/.test(email)) throw new Error('Invalid host email.');
  batch.set(db.doc(`hostEmails/${email}`), { enabled: true });
}
if (values['host-uid']) {
  const uid = values['host-uid'];
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error('Invalid host UID.');
  batch.set(db.doc(`hostAccess/${uid}`), { enabled: true });
}
await batch.commit();
console.log(`Seeded ${quizzes.length} quiz summaries in ${projectId}; existing versions preserved.`);
console.log('Quran content remains an unplayable placeholder. Host access granted only when explicitly supplied.');
await db.terminate();
