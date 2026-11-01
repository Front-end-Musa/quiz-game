# Owner admin panel plan

Status: implemented 2026-11-01. See [ADMIN_PANEL.md](ADMIN_PANEL.md) for operation, security, publication details and validation. This document retains the original design and acceptance criteria.

## Goal and scope

Add a Russian-language `/admin` area to the existing Angular application. Only the verified Firebase identity belonging to `rufatulymusa567@gmail.com` may administer application content and settings. Hosting a game and administering the application are distinct permissions: existing host access does not grant administration.

The panel manages data supported by the application. Editing application code, Firebase IAM, billing, Authentication providers, or deploying new website code remains an operator task outside the browser panel. Preserve the existing Spark-compatible architecture without adding Cloud Functions or an external backend.

## 1. Owner identity and login

- Identify the owner's existing Google-linked Firebase user by email and verify the account's email and provider before binding its UID. If the owner has never signed in, complete Google sign-in first. Do not create a second unrelated account for the same owner.
- Support the requested email/password login using Firebase Authentication's Email/Password provider, linked to the same owner UID as Google. Keep Google as an alternative login method and recovery path. Set a fresh password privately through an authenticated setup/reset flow; never embed credentials in source, Firestore application documents, logs, fixtures, or build output.
- The password shared in conversation will not be copied into this plan or used as a hardcoded credential. Use a fresh private password for the real account.
- Bootstrap admin permission through a local Admin SDK operator script. Grant an `admin: true` custom claim only to the verified owner UID, preserving any existing claims. Create an operator-owned singleton `adminConfiguration/owner` containing the pinned UID, expected email and an enabled flag. Browser clients, including the admin UI, cannot edit this ownership record or grant admin claims.
- Firestore's `isOwnerAdmin()` must require authentication, the pinned owner UID, the admin claim, matching verified email and the enabled flag. Tokens must refresh after claim provisioning. Email comparisons and route guards alone do not grant permission.
- Add `/admin/login`, login error states, sign-out, password-reset support, and session persistence limited to the admin browser session. Require recent authentication for sensitive operations where it can be enforced in Rules with `auth_time`. Signing out or changing identities clears admin data/listeners and reevaluates guards.
- Display an admin navigation link only after successful authorization. Other users get a useful access-denied screen if they type an admin URL.

## 2. First release screens

| Screen | Owner controls | Boundaries |
| --- | --- | --- |
| Overview | Quiz/draft counts and recent rooms/results | Bounded queries and pagination; no unbounded realtime scans |
| Quiz library | Create, edit, duplicate, archive, preview, and publish quizzes | Published versions are immutable; archive blocks new games but preserves existing games/results |
| Question editor | Prompt, exactly four options, correct option, explanation, optional reference, and question order | Draft answer keys are owner-only; published answer keys remain host-only |
| Game defaults | Time limit, question count, player limits, points and speed bonus | Validated within existing domain limits; changes affect new rooms only |
| Rooms and results | Inspect rooms, participants and results; archive completed sessions | First release avoids editing scores or removing running games |

Do not add arbitrary project mutation or permanent room deletion to the first release. Firestore parent deletion does not delete subcollections, so a future cleanup tool must explicitly enumerate and remove descendants and handle partial failures. Account deletion and broad Firebase Auth user administration would require trusted tooling beyond a browser-only panel.

## 3. Data model and publishing

- `adminConfiguration/owner`: singleton bootstrap record. Client writes always denied.
- `adminDrafts/{draftId}`: owner-only quiz metadata, questions, solutions, review state and revision, with bounded size/shape. Drafts never appear in player catalogue queries.
- `appSettings/gameDefaults`: owner-managed defaults read by room setup. Keep all values within existing domain limits and validate them again at room creation.
- Existing `quizzes/{quizId}`, `versions/{version}`, public question documents and separate `quizSolutions/{quizId}_v{version}` remain the published format.
- The catalogue currently lists every quiz document. Update repository queries and Rules together so only available, published summaries are player-readable. Archive must block new creation in both Rules and the gateway. Existing rooms use their pinned quiz version; published versions/questions and solution keys must remain available to authorized participants/hosts after archival.
- Save drafts with revision checks to reject accidental overwrites from two admin tabs. Editing a published quiz creates a new draft/version rather than overwriting the old one.
- Validate title, question count, unique IDs/order, exactly four nonempty answer options, correct-option membership and required explanations before publishing. Quran content remains unavailable until explicitly reviewed; saving text alone does not mark it approved.
- Publish new public questions, protected solutions, version manifest and current summary in an atomic batch/transaction sized within Firestore limits. Validate authorization, schema and immutability in Rules; test cross-document access limits. Start with bounded quizzes and no bulk imports. Rule validation and emulator tests determine the final publication size cap.
- Store server timestamps, editor UID and version/revision metadata on saves. Lightweight activity records can aid review, but do not describe browser-written logs as an independently trustworthy audit trail.

## 4. Angular implementation

- Add lazy routes under `src/app/features/admin`, with a shared admin shell and owner route guard before the wildcard route.
- Add an owner-access service and an admin repository under `core/infrastructure/firebase`. Extend `FirebaseConnection` for password login, credential linking, claim refresh, reset and sign-out without breaking normal anonymous players or Google hosts.
- Keep Firebase operations out of form components. Use reactive forms, domain validation, pending/saved/error states and unsaved-change navigation protection.
- Keep correct answers inside authorized admin/editor data paths. Never import a seed file or service-account credential into browser code.
- Add previews that distinguish an owner answer-key view from the public player question view.

## 5. Security and verification

- Add narrowly scoped owner permissions to Rules; avoid a blanket recursive admin allow rule. In particular, a wildcard admin write rule must not accidentally override published-version immutability or protected ownership records.
- Preserve player answer immutability, deadlines, room membership, host-only scoring and private solutions. An ordinary allowed host must not become an administrator.
- Test anonymous users, signed-in nonowners, ordinary hosts, owner email without the pinned UID, forged client role fields, missing claims, disabled admin access, and the correct owner account.
- Test private draft denial, publication/version consistency, archived-quiz admission, old-room continuity, malformed questions/settings and conflicting admin saves.
- Add owner login/guard/form/publishing UI tests and a full draft-to-published-quiz-to-playable-game emulator test. Keep the existing 84 application tests and Firebase multiplayer/security suite passing.
- Check production assets for private credentials, hardcoded passwords and bundled unrevealed solutions. Verify build/typecheck and document Firestore query/write costs.

## 6. Delivery order

1. Owner bootstrap, authentication, route guard and restrictive Rules.
2. Read-only admin shell and overview to verify owner-only access.
3. Draft quiz/question editing and previews.
4. Versioned publishing, archival and game defaults.
5. Room/result inspection, regression tests and local review.
6. Deploy verified Rules, provision owner access and perform a live owner/nonowner smoke test. Hosting publication is a separate explicit action if the website is to be published.

Completion means the owner can sign in, create and publish a valid quiz and use it in a new game; another user cannot read drafts, enter the admin area, change settings or grant themselves admin access, including through direct Firestore requests.

References: [Firebase custom claims](https://firebase.google.com/docs/auth/admin/custom-claims), [linking authentication providers](https://firebase.google.com/docs/auth/web/account-linking).
