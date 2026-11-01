# Final static prototype audit — Phase 7

Historical static-prototype audit. Firebase integration was subsequently added on 2026-11-01; see [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for the current implementation and validation instructions.

Audit date: 2026-10-31. Scope: Angular static prototype only; Firebase remains unimplemented. The detailed future integration proposal is [FIREBASE_PREPARATION.md](FIREBASE_PREPARATION.md).

## Functional coverage and evidence

The application contains functional game commands and persistent local data adapters, not just screen previews. Automated verification uses Angular RouterTestingHarness/jsdom and deterministic service tests. It does not establish real-browser or remote multiplayer behaviour.

| Requested step | Verification and result |
| --- | --- |
| Open landing | Route tests and the complete UI playthrough begin at `/`; primary navigation is followed. |
| Browse quizzes | UI playthrough navigates to the catalogue; tests cover all three cards, metadata, filters and upcoming-topic empty state. |
| Open preview | UI playthrough opens General Knowledge preview; rules and create-room navigation work. Missing quiz and Quran-unavailable states are covered. |
| Create room | Reactive form tests cover defaults/custom settings, invalid counts/bonus combinations, host nickname, and navigation into a created lobby. |
| Join with nickname | Join form tests cover nickname/code validation, duplicate/missing-room errors and success-to-lobby navigation. Separate host/player test identities exercise actual gateway admission. |
| Simulate players | Host UI tests add random mock names, remove individuals and reset mock-only entries. Simulations remain labelled and cannot send player answers. |
| Start | Host start and minimum/capacity rules are tested. Player/visitor/forged-role commands are rejected by the local adapter. |
| Answer | Full UI playthrough submits an option and locks all choices. Service tests cover one accepted answer, immutable selection, idempotent retries, stale attempt/option rejection and exact-deadline rejection. |
| Reveal | UI covers correct, incorrect, no-answer and optional-reference presentation; active snapshots do not expose solution keys. Countdown expiry reveals automatically in mock mode. |
| Complete questions | Both playable topics complete all three questions in service tests. UI completes correct → incorrect → timeout → final screen. |
| Calculate scores | Deterministic tests cover defaults, configured scoring, clamped time, zero/wrong/no answer, restart rollback and no duplicate awards. |
| Final ranking | Correct count, points, accuracy, mock labels, host exclusion and tie-break priorities are tested. Results persist in the shared adapter and appear through the results repository. |
| Restart/replay | UI and service tests create a fresh lobby with copied settings and empty roster, keeping the old result intact. Developer current-question restart is tested separately. |
| Target room size | A 15-player adapter integration test uses distinct host and actual player identities plus 14 labelled mock participants, completes all rounds, verifies winner/host exclusion and creates a replay. This is not a 15-device browser load test. |

## Discovered issues and fixes

- **Rejoin rejected after start:** join used a lobby-only command guard before checking existing identity. Credentialed active members now resume without changing the roster/name; new identities remain rejected after start. Regression test included.
- **Stale host controls could affect the next round:** reveal/advance now require expected attempt ID. Development controls use the same fence. Delayed commands return `stale-round`. Regression test included.
- **UI depended directly on mock infrastructure:** added the small optional `DEVELOPMENT_TOOLS` port. Lobby and gameplay state now depend on the interface; regular RoomGateway no longer advertises development overrides. Results UI obtains viewer identity from gateway projection rather than accessing local credentials. Rendering without a development-tools provider is tested.
- **Duplicate result-migration logic:** historical data upgrade stays in RoomStore; result retrieval now consumes normalized records instead of repeating that migration.
- **Inconsistent nickname normalization:** one generic domain helper is shared by admission and generated-name collision detection.
- **Timer kept waking outside questions:** timing intervals now exist only for active questions and stop at reveal/finish or unsubscription. The full UI timeout test caught a synchronous snapshot ordering problem during this change; expiry commit is now deferred until the current countdown frame is delivered. Service/UI regression tests pass.
- **Broadcast notification errors could invalidate persistence or report committed writes as failures:** BroadcastChannel creation/post errors are now isolated from IndexedDB initialization/commit. These paths were inspected and fixed, but actual IndexedDB/BroadcastChannel browser behaviour remains unverified here.

These changes improve correctness and replaceability without adding a new state library, a generic repository framework, Firebase stubs or a separate backend abstraction.

## Architecture review

- **Domain:** separate Quiz, QuizQuestion, GameRoom, GamePlayer, PlayerAnswer and GameResult files. Generic metadata only; no Quran-specific engine fields. Solutions and reveal awards are distinct from public active questions.
- **Responsibilities:** repositories retrieve content/results; gateway validates and commits commands; mock engine transforms adapter-side room records; scoring service performs generic arithmetic; timing service owns countdown scheduling; replay service creates fresh rooms. Components render state and forward actions.
- **State:** observable room/session changes are projected into readonly Signals and computed state. Route-scoped gameplay facade owns UI selection/pending/error state. No global mutable UI store is needed at this scale.
- **Routing:** lazy standalone feature pages, explicit missing-data states and wildcard page. UI navigation is tested; URL guards are not presented as security boundaries.
- **Mock separation:** fixtures remain in `content/quizzes`, imported only by mock infrastructure and tests. Production feature/shared/state code has no direct mock-infrastructure imports after this audit. Mock providers are still deliberately selected for this static prototype.
- **Scoring:** latest defaults are 100 base + up to 50 speed points. Existing explicit settings remain intact. Ranking is points, correct count, summed correct-answer response time, then original join order. Accuracy includes unanswered completed questions.
- **Timing:** absolute deadlines, injected clock and service-owned RxJS scheduling. Local members can reconcile expired questions in mock mode; future Firebase must move state changes to the authenticated host and deadline rejection to Rules.
- **Remaining coupling:** LocalGameEngine deliberately uses StoredRoom and adapter-side keys. It is not a ready-made Firebase server engine. Future host orchestration needs its own persistence mapping, while scoring/ranking policies and presentation remain reusable.

Project structure:

```text
src/app/
  core/domain/                Generic models, nickname/settings rules, scoring
  core/ports/                 Quiz/room/result and optional development interfaces
  core/state/                 Session, gameplay facade, timing, replay
  core/infrastructure/mock/   Local adapters, IndexedDB, engine, simulator
  content/quizzes/            Questions, placeholders and demo fixtures
  features/                   Home, catalogue/preview, setup, join, lobby, gameplay, results
  shared/ui/                  Reusable controls, cards, loading/empty/results/rankings
  shared/styles/              Tokens, controls and responsive page styles
```

## Known limitations and unverified behaviour

- Browser rendering, touch/mobile behaviour, real IndexedDB disk recovery and BroadcastChannel multi-tab operation are not verified in this sandbox. Angular harness tests do not substitute for those checks.
- `npm start -- --host 127.0.0.1 --port 4200` was attempted during this audit and failed with `listen EPERM`; the environment denies local listening sockets. Earlier Chromium launch attempts were also blocked. This does not establish a development-server failure on an unrestricted machine.
- Tests share an in-memory transactional adapter between independent identities and recreate session contexts. They test logical state restoration, not actual browser refresh or Firebase networking.
- Local actor tokens and mock answer fixtures are inspectable. No secure Authentication, protected remote answer store, tamper-proof scores or remote presence is implemented. Do not treat local adapter permission checks as server-side security.
- Separate phones/profiles do not share the mock room store. Same-origin tab identities depend on sessionStorage; opener-created tabs may inherit its initial copy. Storage denial gives a disclosed memory-only fallback. Lack of BroadcastChannel can prevent automatic cross-tab notifications even when IndexedDB works.
- Only the two three-question demo topics are playable. The Quran dataset contains 15 clearly labelled slots, no invented verified references/solutions, and is blocked from play pending content review.
- Development simulator/one-tab control features are absent in production mode. Production local games need actual participants in independent tabs and the host's normal reveal/advance controls.
- Clearing site data loses local rooms/credentials. There is no host transfer or cross-device recovery. Saved state edited manually through developer tools is not a supported input format.
- No automated accessibility audit or real-device load/performance audit was run. Keyboard semantics, focus styling, responsive breakpoints and reduced-motion support were reviewed in source.

## Run and verify

```sh
npm ci
npm start
npm run typecheck
npm test
npm run build
```

Use localhost or HTTPS. The development server normally serves http://localhost:4200. For one-tab play: landing → catalogue → playable quiz → create room → **Играть самому · DEV**. Select answers, reveal or wait for timeout, advance, inspect results, and **Сыграть ещё**. The host remains a separate non-competing identity.

To exercise distinct participants, retain the host tab, open an independent same-origin tab and join by code/nickname. Use the host's simulator only for explicitly labelled mock participants. Browser-level verification of this procedure remains a manual follow-up outside this environment.

Production output: `dist/quiz-game/browser`. Static hosting needs an index.html fallback for Angular routes. No Firebase hosting configuration or deployment was added.

## Quality results

Final commands and results are recorded after the audit fixes:

- `npm run typecheck`: passed (strict TypeScript).
- `npm test`: 84 tests passed across six files, including the complete UI playthrough/replay, separate-identity 15-player flow, stale host controls and rejoin regression cases.
- `npm run build`: passed, including strict Angular template compilation; no warnings. Initial output 321.48 kB raw / approximately 85.72 kB estimated transfer, within configured budgets.
- Development server/browser checks: blocked as described above; not reported as passed.

The audit did not install dependencies, connect to the Firebase project, change the user-provided Firebase notes, create Rules files or deploy anything. See [FIREBASE_PREPARATION.md](FIREBASE_PREPARATION.md) for the exact adapter replacement plan, schema, permission/deadline requirements, trusted-host limits and emulator release gates.
