import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';

const { values } = parseArgs({ options: { 'service-account': { type: 'string' } } });
const projectId = 'quiz-game-19c55';
if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Unset FIRESTORE_EMULATOR_HOST for live Rules publication.');
let credential = applicationDefault();
if (values['service-account']) {
  const account = JSON.parse(await readFile(values['service-account'], 'utf8'));
  if (account.project_id !== projectId) throw new Error('Service account belongs to a different project.');
  credential = cert(account);
}
initializeApp({ projectId, credential });
const source = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const published = await getSecurityRules().releaseFirestoreRulesetFromSource(source);
console.log(`Published Firestore Rules to ${projectId}: ${published.name}`);
