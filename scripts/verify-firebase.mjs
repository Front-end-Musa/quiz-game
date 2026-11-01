import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import ts from 'typescript';
import { cert, initializeApp as initializeAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getSecurityRules } from 'firebase-admin/security-rules';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { deleteUser, getAuth, inMemoryPersistence, setPersistence, signInAnonymously } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore, terminate, query, where } from 'firebase/firestore';

const { values } = parseArgs({ options: {
  'service-account': { type: 'string' }, 'host-email': { type: 'string' },
} });
assert.ok(values['service-account'], 'Provide a local service-account path.');
assert.ok(values['host-email'], 'Provide the enabled host email.');
assert.ok(!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Unset emulator variables for a live check.');
const account = JSON.parse(await readFile(values['service-account'], 'utf8'));
assert.equal(account.project_id, 'quiz-game-19c55');
const admin = initializeAdmin({ projectId: account.project_id, credential: cert(account) }, 'verify-admin');
const adminDb = getAdminFirestore(admin);
let app;
let db;
let temporaryUser;
try {
  const expectedRules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  const released = await getSecurityRules(admin).getFirestoreRuleset();
  assert.ok(released.source.some((file) => file.content === expectedRules), 'Live rules differ from the tested local rules.');
  const host = await adminDb.doc(`hostEmails/${values['host-email'].trim().toLowerCase()}`).get();
  assert.equal(host.data()?.enabled, true, 'Host email is not enabled.');
  console.log('Live rules match the tested local source; host email is enabled.');
  const owner = (await adminDb.doc('adminConfiguration/owner').get()).data();
  assert.equal(owner?.enabled, true);
  const ownerUser = await getAdminAuth(admin).getUser(owner.uid);
  assert.equal(ownerUser.email, owner.email);
  assert.equal(ownerUser.emailVerified, true);
  assert.equal(ownerUser.customClaims?.admin, true);
  assert.equal(ownerUser.disabled, false);
  console.log('Pinned owner identity, verified email and admin claim are configured.');
  const { access_token: accessToken } = await admin.options.credential.getAccessToken();
  const authConfig = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${account.project_id}/config`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (authConfig.ok) {
    const configuration = await authConfig.json();
    console.log(`Localhost authorized for browser Google sign-in: ${configuration.authorizedDomains?.includes('localhost') === true}`);
  } else {
    console.log(`Could not verify browser authorized domains (HTTP ${authConfig.status}); check Firebase Authentication settings.`);
  }

  // Read the exact public web configuration used by the app without instantiating Angular.
  const source = await readFile(new URL('../src/app/core/infrastructure/firebase/firebase-connection.ts', import.meta.url), 'utf8');
  const parsed = ts.createSourceFile('firebase-connection.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = parsed.statements.filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((entry) => entry.name.getText(parsed) === 'firebaseConfig');
  assert.ok(declaration?.initializer, 'Cannot locate the app web configuration.');
  const javascript = ts.transpileModule(`export default ${declaration.initializer.getText(parsed)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const { default: config } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
  app = initializeApp(config, 'live-verification');
  const auth = getAuth(app);
  await setPersistence(auth, inMemoryPersistence);
  temporaryUser = (await signInAnonymously(auth)).user;
  assert.equal(temporaryUser.isAnonymous, true);
  db = getFirestore(app);
  const quizzes = await getDocs(query(collection(db, 'quizzes'), where('published', '==', true), where('archived', '==', false)));
  assert.ok(quizzes.size >= 1);
  const questions = await getDocs(collection(db, 'quizzes', 'general-knowledge', 'versions', '1', 'questions'));
  assert.equal(questions.size, 3);
  for (const question of questions.docs) assert.equal(question.data()['correctOptionId'], undefined);
  await assert.rejects(getDoc(doc(db, 'quizSolutions', 'general-knowledge_v1')), { code: 'permission-denied' });
  await assert.rejects(getDoc(doc(db, 'hostEmails', values['host-email'])), { code: 'permission-denied' });
  await assert.rejects(getDoc(doc(db, 'adminConfiguration', 'owner')), { code: 'permission-denied' });
  await assert.rejects(getDocs(collection(db, 'adminDrafts')), { code: 'permission-denied' });
  console.log('Live anonymous sign-in and quiz reads pass; private solutions and host permissions are inaccessible to players.');
} finally {
  if (temporaryUser) await deleteUser(temporaryUser);
  if (db) await terminate(db);
  if (app) await deleteApp(app);
  await adminDb.terminate();
  await deleteAdmin(admin);
}
