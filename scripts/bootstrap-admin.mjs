import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { cert, initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
const { values } = parseArgs({ options: { 'service-account': { type: 'string' } } });
if (!values['service-account'] || process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error('Provide an owner-authorized credential for live setup, with emulator variables unset.');
const account = JSON.parse(await readFile(values['service-account'], 'utf8'));
if (account.project_id !== 'quiz-game-19c55') throw new Error('Wrong project.');
const credential = cert(account);
const app = initializeApp({ projectId: account.project_id, credential });
const db = getFirestore(app);
const email = 'rufatulymusa567@gmail.com';
try {
  const user = await getAuth(app).getUserByEmail(email);
  if (user.disabled || !user.emailVerified || !user.providerData.some((provider) => provider.providerId === 'google.com'))
    throw new Error('Owner must first sign into the app using the verified Google account.');
  const ref = db.doc('adminConfiguration/owner');
  const existing = await ref.get();
  if (existing.exists && existing.data().uid !== user.uid) throw new Error('Owner UID differs. Refusing to transfer ownership.');
  const token = await credential.getAccessToken();
  const response = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${account.project_id}/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `projects/${account.project_id}/config`, signIn: { email: { enabled: true, passwordRequired: true } } }),
  });
  if (!response.ok) throw new Error(`Could not enable Email/Password (HTTP ${response.status}). Enable it in Firebase Console, then retry.`);
  await getAuth(app).setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
  const batch = db.batch();
  batch.set(ref, { uid: user.uid, email, enabled: true, updatedAt: FieldValue.serverTimestamp() });
  for (const snapshot of (await db.collection('quizzes').get()).docs) batch.update(snapshot.ref, {
    published: snapshot.data().published ?? true, archived: snapshot.data().archived ?? false,
  });
  const defaults = db.doc('appSettings/gameDefaults');
  if (!(await defaults.get()).exists) batch.create(defaults, { questionCount: 15, timeLimitSeconds: 20,
    pointsPerCorrectAnswer: 100, speedBonusPoints: 50, minPlayers: 2, maxPlayers: 15,
    updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid });
  await batch.commit();
  console.log(`Owner administration enabled for ${email}. Email/Password is enabled; no password was set by this script.`);
  console.log('Sign in again through Google at /admin/login, then set a fresh private password under My access.');
} finally { await db.terminate(); await deleteApp(app); }
