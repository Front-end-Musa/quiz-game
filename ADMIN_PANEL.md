# Owner administration

The Angular application has a Russian-language administration area at `/admin`. Run `npm start` and open http://localhost:4200/admin/login. The original mock build does not grant administration.

Room creators also have a separate [private room question editor](ROOM_QUESTIONS.md). It does not grant catalogue/admin access or modify immutable published versions.

Activated in `quiz-game-19c55` on 2026-11-01: the existing verified Google UID is pinned as owner, the admin claim and Email/Password provider are enabled, visibility/default-settings migration is complete, and the tested Rules are published. No password was set by operator tooling; set a fresh private password after your first Google login.

## Access

Only `rufatulymusa567@gmail.com` with the pinned Firebase UID, verified email, `admin: true` custom claim and enabled `adminConfiguration/owner` record may administer the app. A game host has no administrative privileges. Route guards provide navigation behaviour; Firestore Rules protect the actual data, including direct SDK/REST requests.

Sign in through Google first. If permission was just provisioned, sign in again or use “Проверить доступ снова” to refresh the token. Administrative sessions use browser-session persistence. The shell hides private screens and redirects to login on sign-out, changed identity or disabled access.

Set a fresh private password in **Мой доступ**. This links Email/Password to the same Firebase UID as Google; it does not create a separate administrator. Enter the password only into the app's password form. Passwords are passed to Firebase Authentication, cleared from the form afterwards, and are never stored in the application database or repository. Google remains an alternative sign-in method. Password reset is available on the login screen.

Publishing, archival and default-settings writes require an authentication time within 15 minutes. **Мой доступ → Подтвердить вход через Google** renews authentication. A normal token refresh alone does not renew that authentication time.

## Screens

- `/admin`: overview with bounded counts (20+ when there may be more).
- `/admin/quizzes`: paginated published catalogue, archived quizzes and private drafts; edit or duplicate existing content.
- `/admin/edit/new` and `/admin/edit/{draftId}`: metadata, up to 15 ordered questions, four options each, protected answer keys, explanations/references, previews and review confirmation. Partial drafts can be saved. Editing content clears the review checkbox; publication requires a complete checked quiz. Dirty forms prompt before navigation/unload.
- `/admin/settings`: validated defaults for new rooms, including question count, time limit, scoring and player limits. Defaults are clamped to the selected quiz size. Existing rooms retain their settings.
- `/admin/sessions`: paginated room/participant and result inspection. Only completed rooms can be archived. No score overrides or destructive room deletion.
- `/admin/account`: recent Google reauthentication and private password setup.

## Storage and publishing

Drafts in `adminDrafts` are readable and writable only by the owner. Revision checks prevent silent overwrites between tabs. Saving or publishing updates server timestamps and editor UID; these metadata are for review and are not an independently trustworthy audit ledger.

Publishing atomically writes an immutable version manifest, public question documents, protected solutions and the catalogue summary. Two immutable `versions/{version}/checks/{first|second}` documents validate completeness in groups of at most eight questions. This keeps each operation within Firestore Rules' ten-document access limit; publication of all 15 questions is covered by emulator tests. These marker documents are internal to publication and are owner-readable only.

Public questions have a strict field allowlist that excludes correct answers. Published versions, questions and solution documents cannot be overwritten or deleted by any browser client, including the owner. New content requires a new version. Correct answers are in separate `quizSolutions` documents, readable by permitted hosts and the owner. The reviewed checkbox is an explicit owner acknowledgement, not an automated factual verification; Quran placeholders remain unplayable until the owner fills and reviews a new version.

Catalogue reads filter `published == true` and `archived == false`. Archiving a quiz removes it from the player catalogue and rejects new-room creation in Rules. Existing rooms pin their quiz version and continue reading that immutable version, including after archival. Seed tooling creates missing summaries and preserves existing owner edits, current versions and archival flags.

Room archival only adds owner/timestamp/archive metadata to a finished room. It does not erase participants' final results. Firestore document deletion would not recursively remove subcollections, so that feature is deliberately outside this release.

## Operator setup

Use an owner-authorized service-account file outside the repository:

```sh
npm run firebase:admin -- --service-account=/absolute/private/path/service-account.json
npm run firebase:rules -- --service-account=/absolute/private/path/service-account.json
npm run firebase:verify -- --service-account=/absolute/private/path/service-account.json --host-email=rufatulymusa567@gmail.com
```

The bootstrap script verifies the existing Google account and refuses to transfer an existing owner binding to another UID. It preserves other custom claims, enables Email/Password without setting a password, adds catalogue visibility fields to existing quiz summaries, and creates default settings only if absent. It never overwrites existing game defaults or edits published quiz versions. Do not rerun it to revoke access: disable the owner record using trusted operator tooling instead. Browser clients cannot change that record or grant admin claims.

The direct Admin SDK Rules publisher is used because the service account can publish Rules but the Firebase CLI's API-status pre-check lacks a Service Usage permission. No Firebase IAM permissions or billing changes are required by this panel. Hosting publication remains a separate operation.

## Verification

`npm run typecheck`, `npm test`, `npm run build`, and `npm run test:firebase` verify application compilation/UI behaviour and the real Firestore adapters against emulated Rules. Tests include owner identity/claims/email/disablement checks; private drafts; complete 15-question publication; playing the new quiz; new versions during existing games; catalogue archival; unchanged old-room access; stale draft saves; malformed publication; immutable versions; limited admin queries; settings bounds and stale authentication. The original multiplayer security tests remain in the same suite.

The live verification script creates and deletes one temporary anonymous user and checks published quiz reads and denial of private solutions, host allowlists, owner configuration and drafts. Owner Google-popup behaviour and actual mobile gameplay still require a browser smoke test with the real owner's interaction. No owner password is automated or captured by verification tools.

Validation on 2026-11-01: strict typecheck, 91 application/UI tests, 12 Firebase emulator tests, and the production build pass. Live verification confirmed matching deployed Rules, the pinned verified owner and admin claim, and denial of admin data to an anonymous player. Production imports exclude mock fixtures, answer-key seed data and privileged Admin SDK/operator tools. The initial browser assets remain above the existing 500 kB warning budget (about 928 kB raw / 243 kB estimated transfer), below the 1 MB error limit. Hosting was not published during admin implementation.
