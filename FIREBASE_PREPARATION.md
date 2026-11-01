# Firebase preparation — Spark trusted-host proposal

Historical proposal: implementation was authorized and added on 2026-11-01. [FIREBASE_SETUP.md](FIREBASE_SETUP.md) describes the implemented compact schema, verification and remaining owner-authenticated publication steps. The original proposal below is retained for context.

Status: documentation only, 2026-10-31. No Firebase SDK, Authentication calls, Firestore integration, Security Rules files, Firebase project changes, or deployment have been implemented. This proposal preserves the user's Spark constraints and awaits implementation approval.

Existing `FIREBASE.md` contains user-provided setup notes. It is not imported by the application, was left unchanged, and does not establish that the live project or its configuration has been tested.

## 1. Authority and scope

Use Angular, Firebase Anonymous Authentication, Cloud Firestore Standard edition and static Firebase Hosting. No Cloud Functions, Realtime Database presence bridge, paid services or external backend. Intended room size is 8–15 players plus a non-competing host; retain configurable minimums for tests and a hard maximum of 15 competitors.

This is a trusted-host architecture. The host knows the solutions and calculates scores. Security Rules can restrict who writes scores; they do not establish that the host's calculations are honest. Fully independent score verification would require changing the no-backend constraint, and is not part of this proposal.

The trusted server execution under these constraints is Firebase Authentication plus Firestore Security Rules and atomic database operations. UI guards and Angular services are conveniences, not security boundaries.

## 2. Current implementation → future implementation

| Responsibility | Current implementation | Required replacement |
| --- | --- | --- |
| Identity/authentication | `SessionContext`: per-room local actor/token credentials in sessionStorage | Firebase identity service restoring Anonymous Auth UID before protected reads/writes. Resolve roles from persisted room membership and immutable host UID; never trust a role submitted by the browser. |
| Quiz retrieval | `QUIZ_REPOSITORY` → `MockQuizRepository` | `FirestoreQuizRepository`: published, immutable quiz versions and public questions without answer keys. |
| Creation | `ROOM_GATEWAY` → `MockRoomGateway.create` | Host-authenticated Firestore transaction reserving a code and creating a lobby with validated settings and immutable ownership/version. |
| Joining | `MockRoomGateway.join` | Player-owned join request; host controller admits/rejects in a transaction. Existing admitted UID resumes through listeners without creating another membership. |
| Presence | Local membership flags; mock labels; no real presence detector | Optional member-owned presence documents with server-timestamp heartbeats and best-effort last-seen UI. Host heartbeat drives “waiting for host” feedback. |
| Synchronization | `ROOM_STORE`: IndexedDB transactions and BroadcastChannel notifications | Role-scoped Firestore listeners assembled into `RoomSnapshot`; unsubscribe on route/attempt changes. Use connection/cache/pending-write metadata instead of treating local data as server acknowledgement. |
| Answers | Transactional local `submitAnswer` with attempt/command IDs | Create-only `answers/{uid}` under the current attempt. Authenticated UID, immutable payload, server timestamp and deadline enforced by Rules. |
| Timing | `GameTimingService`, `GAME_CLOCK`; local members can reconcile expiry | Client display derived from committed server start time; only host controller writes closure/reveal. Players never advance shared state. |
| Scoring/progression | Adapter-side `LocalGameEngine` and generic `ScoringService` | Host controller reads protected solutions and committed answers, reuses scoring/ranking rules, and atomically publishes idempotent awards/aggregates. Do not reuse `StoredRoom` as a Firestore schema. |
| Results/leaderboard | `RESULT_REPOSITORY` → `MockResultRepository` | `FirestoreResultRepository` reads host-published final results scoped to authorized rooms. Keep rankings per game rather than combining incomparable quizzes. |
| Development tools | Optional `DEVELOPMENT_TOOLS` port, supplied by mock providers | Omit in Firebase production. Supply only a deliberately isolated emulator implementation if needed; no production identity switching or score overrides. |

Keep components dependent on ports and facades. Firebase imports, Timestamp conversion, document references, listener lifetimes, transactions and error mapping belong in `core/infrastructure/firebase`. Select mock/emulator/Firebase providers through separate build configuration. In a Firebase production build, verify that mock content, solutions, local controller tokens and mock providers are unreachable in the import graph—not merely hidden by CSS or a disabled button.

Before integration, add Firebase-specific loading/offline/pending-admission states to the gateway projection and asynchronous join response. Add immutable quiz version to persisted final results for version-exact historical replay. Do not introduce those remote behaviours into the static prototype prematurely.

## 3. Proposed schema

All timestamps below are Firestore timestamps in persistence; mappers expose domain-friendly values.

| Document path | Contents |
| --- | --- |
| `hostAccess/{uid}` | Operator-managed host enablement and permitted quiz versions. Client cannot grant itself host access. |
| `quizzes/{quizId}` | Published summary, availability and current version. |
| `quizzes/{quizId}/versions/{versionId}` | Immutable question order and default settings. |
| `quizzes/{quizId}/versions/{versionId}/questions/{questionId}` | Prompt, exactly four option IDs/texts and generic metadata. No solution, explanatory answer hints or unrevealed references. |
| `quizSolutions/{versionKey}` | Correct-option map, explanations and references, readable only by permitted hosts. Operator-provisioned reviewed content. |
| `roomCodes/{code}` | Minimal exact-code lookup: room ID, title and join availability. Deny collection listing. A short code is a discovery mechanism, not proof of membership. |
| `rooms/{roomId}` | Immutable host UID/quiz version, settings, active player UIDs, next join order, revision, phase and current attempt ID. |
| `rooms/{roomId}/joinRequests/{uid}` | Requested nickname, request timestamp, admission decision/reason. Player can submit/correct their own pending/rejected request but cannot accept it. |
| `rooms/{roomId}/players/{uid}` | Host-managed nickname, join order and active/removed membership. Host UID cannot be a competitor. |
| `rooms/{roomId}/presence/{uid}` | Own-member last-seen heartbeat only; no permission to change authoritative membership, scores or room state. |
| `rooms/{roomId}/rounds/{attemptId}` | Question snapshot/options, index, server start, immutable duration, question/closed/revealed status, then public solution and per-player awards only on reveal. |
| `rooms/{roomId}/rounds/{attemptId}/answers/{uid}` | UID, option ID, attempt ID and server submission timestamp. One immutable document per player and attempt. |
| `rooms/{roomId}/scoreboards/current` | Compact score/correct/time aggregates for at most 15 players. Host-only write; update once per reveal. |
| `rooms/{roomId}/results/final` | Winner, stable ranks, score/count/time statistics, completed/planned questions, quiz version and replay settings. |

Recommended host policy: manually provision permitted anonymous UIDs using the Firebase Console. If everyone can create a host room for the same quiz, participants can create another room to obtain its solutions. That alternative weakens answer secrecy and must be a conscious product decision. The allowlist policy remains a proposal, not an implemented permission system.

Keep correct answers in physically separate documents: Firestore reads are document-level and cannot hide selected fields in a readable document. Public reveal data intentionally publishes the current solution after closure. [Firestore field access](https://firebase.google.com/docs/firestore/security/rules-fields)

## 4. Required Rules policy (not implemented or emulator-validated)

Default deny. Check authentication, field allowlists/types and immutable IDs on every permitted operation. Future Rules tests must cover `get`, `list`, `create`, `update`, and `delete` separately.

- **Quiz data:** authenticated reads of published versions/questions. No application-client writes. Quran placeholders remain unavailable until content is reviewed.
- **Solutions:** only enabled/authorized host UIDs may read. No client writes. Never put keys in Hosting assets, source maps, public question documents or player snapshots.
- **Room creation:** authenticated permitted host; `hostUid == request.auth.uid`; initial lobby; empty roster; unique code reservation; valid settings and playable quiz/version.
- **Room ownership:** immutable host UID, quiz version and creation timestamp. Only the authenticated host may change settings, roster, phase, current attempt, scores or results. Freeze settings/roster at start; allow explicit removal/cleanup policies only where designed.
- **Capacity/admission:** host transaction admits only while lobby is open, excludes host from competitors, and updates membership plus a unique active UID list of size <= configured maximum <= 15. Use `getAfter()` to validate coordinated writes. Host admission logic enforces normalized nickname uniqueness; do not claim that Rules implement arbitrary Unicode normalization.
- **Started rooms:** new membership creation denied after start. Existing authenticated active membership may resume listening; that is a reconnect, not permission to admit new players. A removed identity is not an active member.
- **Join requests:** player writes only their own UID path, bounded nickname and server request time; cannot self-approve or write a player/score document. Host decides admission and duplicate/full-room errors.
- **Answer identity:** player UID equals the answer document ID and payload UID, belongs to the current active competitor list, and is not host. A caller cannot submit for another player or supply points/correctness fields.
- **Answer uniqueness:** permit `create` only. Deny player updates/deletes, including attempts to change an option or recreate a deleted answer. An SDK retry after an acknowledged answer should read/report the existing document rather than overwrite it.
- **Answer validity:** attempt ID matches the room pointer, round and room accept answers, option ID belongs to the round, allowed fields/types only, and `submittedAt == request.time`.
- **Answer deadline:** require `request.time < startedAt + duration.value(durationSeconds, 's')`. UI clocks do not decide acceptance. Closed/revealed attempts reject new writes even if an early reveal occurred before the time limit.
- **Progression:** host-only legal transitions with expected attempt/revision. Create attempts once; prevent stale control requests from affecting a later attempt. Only the host publishes solutions, awards and final rankings.
- **Scores:** players cannot write any score, award or final-result field. Host writes are type/shape constrained; Rules do not prove the score calculation.
- **Presence:** members write only their own permitted heartbeat fields with server timestamps. Presence writes must not grant a route to mutate game state or another identity.
- **Reads:** host can read committed answers for scoring; players can read their own answer, authorized room/roster/current round/scoreboard/results. Deny other players' raw answer reads, solution collection listing and unrestricted room listing.

Cross-document Rules lookups and atomic request limits must be measured in emulator tests. Use a compact scoreboard instead of a 15-document score-write batch with many repeated authorization checks. [Rules conditions and access-call limits](https://firebase.google.com/docs/firestore/security/rules-conditions)

## 5. Time, submission and host lifecycle

Host writes `startedAt = serverTimestamp()` and an immutable duration from room settings. Derive the shared deadline from committed `startedAt + durationSeconds`; there is no future-server-timestamp transform. Wait for the committed start before presenting the round as ready.

Rules evaluate the authoritative deadline using `request.time`. Firestore documents that server-timestamp writes equal `request.time` during Rules evaluation. The player's displayed countdown remains approximate because local clocks and network latency vary. [Rules request time](https://firebase.google.com/docs/reference/rules/rules.firestore.Request)

Player UI distinguishes selecting/sending from server-confirmed acceptance. An offline queued submission that reaches Firestore late is rejected and must not earn points. Host state-changing transactions require online confirmation; never optimistically display a locally queued reveal as authoritative.

Host-controlled persisted flow:

```text
lobby → question → closing → reveal → question → … → finished
```

1. Host opens a unique attempt in a transaction with server start time.
2. Players create their immutable submissions. Only the host observes all answers.
3. At expiry or early reveal, host first commits the closed state. Players see “Считаем очки…”; answer writes are now barred.
4. Host fetches committed answers after that closure barrier and calculates points from server submission times. Defaults: 100 base + floor(50 × clamped remaining/time limit), with room-configured overrides; wrong/no answer = 0.
5. Host transaction publishes the solution, per-attempt awards, aggregate scoreboard and reveal phase. Mark the attempt scored in the same transaction. A retry checks that marker and cannot award points twice.
6. Host advances only from the expected revealed attempt. Final transition and result are atomic. Replay creates a new room and preserves the old result.

The short `closing` state is a future synchronization addition, not an extra question phase visible to users. Closing first prevents late-arriving answers from changing the set after score calculation. Transaction retries must be idempotent. [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)

## 6. Disconnection, reconnect and identity

Use persistent Anonymous Authentication for host and players. Same UID restores membership after refresh; clearing identity storage loses that anonymous identity. Never transfer host authority by nickname or a client-supplied role. Recommended v1 default: no host transfer or recovery onto another UID; create a new room if host identity is permanently lost.

Default local Auth persistence synchronizes identity across same-origin tabs. The current mock's different per-tab identities must not be assumed to match Firebase behaviour. Test Firebase users on separate devices/profiles or isolated emulator contexts. [Auth persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence)

Firestore has no native disconnect-presence guarantee. Under the permitted stack, implement best-effort last-seen heartbeats, not a claim of precise online status. Suggested host cadence: 20 seconds; after roughly 60 seconds, display “Ведущий временно не отвечает”. Player presence should be low-frequency/visibility-driven, and never change competitive membership automatically. The official Functions/Realtime Database bridge is excluded by these constraints. [Firestore presence limitations](https://firebase.google.com/docs/firestore/solutions/presence)

While host is absent, Rules still reject answers after the deadline, but no independent process publishes a reveal or advances the room. Players wait. Returning host reads committed state: close overdue question, resume closing/scoring if necessary, or continue a published reveal without rescoring. Expected attempt/revision and per-attempt scored markers protect against duplicate host tabs.

## 7. Spark usage and implementation order

Keep the project on Spark; do not enable paid products. Firestore's published Standard no-cost allowance includes 50,000 reads/day, 20,000 writes/day and 1 GiB stored data. These are shared project limits, not per-room guarantees. [Firebase pricing](https://firebase.google.com/pricing)

No countdown writes. Share scoped listener streams; detach old attempts. Host alone observes answers; players observe their own answer plus room/roster/round/compact scoreboard. Heartbeats, listener reconnects and Rules-dependent reads consume quota; measure an actual 15-player session before promising daily capacity. Surface quota/offline errors. Use explicit operator/host cleanup of finished data; no paid TTL or scheduled Functions.

Static Firebase Hosting serves `dist/quiz-game/browser` with an SPA rewrite to index.html; no Functions rewrites or App Hosting. Verify its separate free storage/transfer limits before deployment. [Hosting quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing)

Implementation stages after approval:

1. **Identity/build isolation:** modular Firebase SDK, anonymous identity service, explicit provider configuration, emulator-only development tools. Test UID restoration, host allowlist and absence of bundled mock solutions.
2. **Content/Rules:** provision reviewed versioned quizzes and protected keys; implement deny-by-default Rules and adversarial emulator tests before remote gameplay.
3. **Lobby:** code reservation, host-admitted join requests, membership/capacity/duplicate checks, listener-driven host/player views. Test 15 concurrent joins and started-room rejection/reconnect.
4. **Gameplay:** server-started attempts, immutable answers, authoritative deadline checks, closure barrier, host scoring, atomic reveal/results and idempotent retries. Test clock skew, offline writes, spoofed UID, duplicate attempts, player score writes and stale host controls.
5. **Recovery/hosting:** heartbeat UX, host loss during question/closing/reveal, multi-tab contention, result access/replay, listener cleanup and quota observation. Run on separate devices, then deploy static Hosting only with explicit deployment authorization.

Release gate: emulator Rules tests must demonstrate every forbidden operation is denied, not merely that the Angular UI hides it. No security mechanism in this document is claimed implemented or tested against Firebase yet.
