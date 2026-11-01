# Firebase integration

Room creators can now use [private, editable question sets](ROOM_QUESTIONS.md). Their questions and protected keys live under their room, with edits allowed only before the game starts. This does not approve or populate the shared Quran placeholder.

**Owner administration is implemented and activated.** See [ADMIN_PANEL.md](ADMIN_PANEL.md) for `/admin/login`, owner-only permissions, private password setup, content publishing and the latest validation results.

Implemented 2026-11-01. The normal application now uses Firebase Authentication and Firestore for project `quiz-game-19c55`. Firebase Console setup alone does not deploy the repository's Rules or publish quiz data. These last operator steps require project-owner credentials; no credentials belong in source control or chat.

**Live setup completed 2026-11-01:** the tested Rules were published to `quiz-game-19c55`, all three quiz summaries and versioned content were seeded, and the user-designated Google host account was enabled. A live SDK check confirmed anonymous authentication, quiz/question reads, and denial of private solution/host-permission reads. The temporary anonymous verification user was deleted. Hosting was not deployed, and browser Google sign-in and a full game on actual devices remain to be exercised.

## Finish the live setup

1. In Firebase Console, verify Anonymous and Google sign-in and your Firestore database (the default database in Standard/native mode). Under Authentication → Settings → Authorized domains, add `localhost` for development and your hosting/custom domain when deploying.
2. Deploy the tested Rules from the project root:

   ```sh
   npx firebase login
   npx firebase deploy --only firestore:rules,firestore:indexes --project quiz-game-19c55
   ```

   The supplied Admin SDK service account can publish Rules directly but the CLI's API-status pre-check fails with a Service Usage permission error. The tested fallback is:

   ```sh
   npm run firebase:rules -- --service-account=/absolute/private/path/service-account.json
   ```

   This uses the official Admin SDK to publish the same `firestore.rules`; it does not change IAM. The app requires only default single-field indexes, so there are no custom indexes to publish.

3. Seed the quizzes and allow your Google account to host. Use Application Default Credentials if already configured (`gcloud auth application-default login`), or generate a service-account private key via Firebase Console → Project settings → Service accounts → Generate new private key. Keep that file outside this repository and supply its local path:

   ```sh
   npm run firebase:seed -- --service-account=/absolute/private/path/service-account.json --host-email=YOUR_GOOGLE_EMAIL
   ```

   With Application Default Credentials, omit `--service-account`. A host can alternatively be enabled with `--host-uid=UID`; the creation page displays the current UID. Email-based permission requires a verified Google email. Only grant hosting to trusted people: they can read all quiz solutions and calculate scores.

   This creates three quiz summaries, versioned question documents, and two protected solution documents. The Quran quiz stays unavailable pending content review. Re-running the seed preserves existing immutable versions; content updates need a new version. The Admin SDK writes content without weakening client Rules.

4. Start the app with `npm start`, open http://localhost:4200, select a playable quiz, and sign in through Google on the room creation page. Create the room and keep the host page open. Join from separate browser profiles or devices, using the six-character room code. Browsers share Firebase identity between same-origin tabs, so two normal tabs are not two players. Keep the same browser identity to reconnect.
5. To publish the website after verifying a full game:

   ```sh
   npm run build
   npx firebase deploy --only hosting --project quiz-game-19c55
   ```

   Hosting serves `dist/quiz-game/browser` with an SPA rewrite. No Functions, App Hosting, paid backend, or automatic deployment is configured. Stay on Spark if that remains your plan.

## Local verification without live writes

Use a supported Node release (Node 24 LTS recommended for the Firebase CLI) and Java 21+ for the Firestore emulator:

```sh
npm run typecheck
npm test
npm run build
npm run test:firebase
```

The Firebase suite starts Auth and Firestore emulators under `demo-quiz-game`, installs the real Rules and tests the real Firebase gateway. It exercises complete games, concurrent admissions up to 15 players, reconnects, host recovery after closure, private solutions/answers, stale commands, idempotent scoring, deadline checks, immutable submissions, forged identity and score writes.

Verified locally on 2026-11-01: strict typecheck, 84 Angular tests, 7 Firebase emulator tests, and the production build pass. The quiz seed was run twice against the emulator to verify repeatability. The production build import graph contains no mock adapters, fixture data or bundled solutions. Initial production assets total about 913 kB raw / 235 kB estimated transfer, exceeding the earlier 500 kB warning threshold but remaining under the 1 MB error limit. Live Rules publication, content upload and SDK access checks subsequently passed as recorded above.

To repeat the live access check (it creates and deletes one temporary anonymous Auth user):

```sh
npm run firebase:verify -- --service-account=/absolute/private/path/service-account.json --host-email=YOUR_GOOGLE_EMAIL
```

For manual emulator play, run these in separate terminals:

```sh
npm run firebase:emulators
```

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run firebase:seed -- --emulator --host-email=host@example.com
npm run start:emulator
```

The Auth emulator supplies a simulated Google login popup. Use the seeded host email. The emulator build uses project `demo-quiz-game`; it never falls back to live services. `npm run start:mock` preserves the original offline local prototype with simulated players. Normal builds have no mock provider or bundled quiz solutions.

## Storage and authority

- `hostAccess/{uid}` or `hostEmails/{verifiedEmail}`: operator-managed permission to host. Clients cannot grant access.
- `quizzes/{id}` and `quizzes/{id}/versions/{version}/questions/{questionId}`: public authenticated content without keys.
- `quizSolutions/{quizId}_v{version}`: protected host-only solutions.
- `roomCodes/{code}`: minimal discovery by exact code; listing is denied.
- `rooms/{code}`: member-only room, roster, current round, published reveal and compact scoreboard.
- `rooms/{code}/joinRequests/{uid}`: player-owned request; the listening host automatically admits or rejects it in a transaction.
- `rooms/{code}/rounds/{attemptId}`: server start time, allowed options, duration, closed/scored markers.
- `rooms/{code}/rounds/{attemptId}/answers/{uid}`: one immutable, server-timestamped answer per player. Rules enforce identity, option and deadline; other players cannot read it.
- `results/{code}`: immutable final results, queryable only by participants. Results retain the quiz version.

This implements the trusted-host plan in a compact schema: the roster, scoreboard and latest reveal share a single member-only room document rather than separate documents per projection. The default 15-player cap keeps this bounded. The `closing` flag is persisted and shown while the host scores; answer creation is forbidden after closure. Scoring and the `scored` marker commit atomically to prevent duplicate awards. Refreshing the host resumes a closed round.

The host must remain connected to admit players, reveal answers and advance rounds. If absent, Rules still reject answers past their deadline, but players wait for the host to return. There is no background scheduler or precise online-presence detector; member connection labels do not establish presence. UI countdowns use local time, while answer acceptance uses server time. Rules protect host authority but do not independently prove honest host calculations. Clearing browser identity storage loses anonymous player membership; signing into a different Google account changes identity. There is no host transfer.

Browser Google sign-in, actual mobile gameplay, and quota usage still require a manual test. Dependencies include development-only Firebase CLI/Admin tooling; review normal dependency audit output before a production release. The Firebase SDK increases the initial browser bundle relative to the static prototype.
