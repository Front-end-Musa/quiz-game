# Multiplayer Quiz Platform — Approved Architecture

**Owner administration (2026-11-01):** `/admin` now provides owner-only, lazy-loaded content editing/publishing, game defaults, room/result inspection and account access. Rules require the pinned verified owner UID and admin claim. Publishing creates immutable versions and validates completeness atomically through bounded marker documents; live games retain their versions. See [ADMIN_PANEL.md](ADMIN_PANEL.md). Live owner provisioning and Rules publication are complete; no password is embedded or provisioned by scripts.

**Current Firebase implementation (2026-11-01):** `provideFirebase()` now replaces mock providers in normal builds. Anonymous player identity, Google host login, protected content, Firestore rooms/admission, server-timestamped answers, host scoring/recovery and participant results are implemented. Rules and emulator coverage accompany the adapter. Rules and content have been published to `quiz-game-19c55`; a live SDK check verified anonymous sign-in, quiz reads and protected-data denials. See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for the implemented schema, setup and limits. Earlier audit/phase notes below are historical. Browser Google login, actual mobile gameplay and Hosting publication remain separate checks.

Status: approved by the user on 2026-10-31. Phases 2–6 foundation, lobby, local gameplay and results implemented on 2026-10-31.

This document preserves the approved technical plan and product decisions. The newest implementation notes take precedence; earlier phase notes and the original plan are retained as history. Current audit evidence is in FINAL_AUDIT.md; the unimplemented Spark proposal is in FIREBASE_PREPARATION.md.

## Phase 7 audit notes (current behaviour)

- Keep domain/ports/state/infrastructure and lazy features. No new state library, generic repository framework or Firebase implementation was added.
- Optional `DEVELOPMENT_TOOLS` now isolates simulator/test controls from normal RoomGateway. Feature/shared/state source no longer imports mock infrastructure. Results obtain viewer information from RoomGateway rather than reading local credentials.
- Host reveal and advance commands include an expected round/attempt ID. Old-tab commands cannot reveal or advance a newer attempt. Developer controls have the same attempt fence.
- Existing credentialed active players may rejoin after start without changing name/roster; new identities remain denied. This is a mock functional policy, not Firebase security.
- One domain nickname normalizer serves admission and generated-name collision checks. Historical result migrations belong only to the persistence adapter.
- Timing intervals exist only during questions. Expiry is committed after delivering the countdown frame so synchronous local snapshots cannot overwrite a reveal with a stale question frame.
- BroadcastChannel creation/post failures are isolated from successful IndexedDB initialization/commit. Real-browser storage and notification behaviour remains unverified in this environment.
- Verified: strict TypeScript, production build without warnings, and 84 automated tests including a landing-to-winner/replay UI flow and a distinct-identity 15-player adapter flow. Actual browser/mobile/IndexedDB multi-tab checks are explicitly not reported as passed.
- `FINAL_AUDIT.md` records coverage, fixes, structure, decisions, commands, known limits and results. `FIREBASE_PREPARATION.md` specifies the future Spark-only trusted-host schema, Rules policies, server-time deadlines, admission, idempotent host scoring and recovery plan. No server-side score verification is promised under the no-backend constraint.
- User-provided Firebase setup notes are not live integration and remain unchanged. Firebase implementation/deployment requires later approval.

## Phases 5–6 implementation notes (current behaviour)

- Local playable lifecycle is `lobby → question → reveal → question → … → finished`. Timing belongs to `GameTimingService`, with an injectable clock and absolute deadlines; no component-owned intervals. Returning after a deadline reconciles the reveal.
- The latest user defaults supersede the original plan: 100 points for a correct answer and at most 50 speed points, floor-proportional to clamped remaining time. Existing explicitly configured rooms retain their settings. Incorrect and unanswered questions earn zero.
- Selecting an option submits immediately and locks selection. Transactions prevent duplicate scoring or changed answers; attempt IDs reject stale requests. Accepted command retries are idempotent. Solutions enter public snapshots only in reveal.
- `ScoringService` is separate from the local adapter-side engine. Question explanations and optional references remain content, never Quran-specific engine logic. Missing demo references are disclosed rather than invented.
- Host controls reveal and progression. Development-only controls reveal/advance/restart/finish. Restart replaces the attempt ID and removes that attempt's answer and awards before recalculation.
- Development **Играть самому** creates a separate non-mock local player identity and labelled mock participants to meet the minimum, keeping the host out of standings. Retained host credentials authorize only the explicit development-controller commands; normal host APIs still reject that player's identity.
- Per-question results show correct and submitted answers, correctness, earned points, explanation/reference and updated ranking.
- A shared ResultsSummary presents the winner, a finite reduced-motion-aware celebration, readable rankings, personal result, and expandable player statistics on both game completion and the dedicated results route.
- GameResult stores completed/planned question counts, replay settings and host nickname. Standings store answered count and mock status. Accuracy is correct answers / completed questions, rounded to a percentage; timeouts count in the denominator. Early developer finishes are labelled and use only completed rounds.
- Ranking remains points, correct count, cumulative correct-response time, then original join order. Simulated participants are explicitly labelled, including if one wins an all-zero tie.
- Replay creates a fresh room with the finished game's settings and an empty roster; the previous game and results remain unchanged. A new room is intentionally not a reset of the finished one.
- Firebase integration is not implemented. The user's proposed Spark architecture requires Anonymous Authentication, Firestore/Hosting only, host-controlled scores/progression, protected solutions and no Functions/backend. That proposal remains pending approval; it does not describe the security of the local mock adapter.
- Automated verification includes full Angular UI playthrough → final statistics → replay, both quiz topics, fake-clock expiry, duplicate prevention, late/stale answers, scoring, restart rollback and tie-breaks. Browser screenshots/actual IndexedDB multi-tab verification remain unavailable under sandbox restrictions.
- Earlier phase notes below are historical where they conflict with this section.

## Phase 4 implementation notes (current behaviour)

- Lobby shows quiz title, host nickname, room code/copy action, participant count/capacity, roster, mock disclosure, settings and waiting state. Host and player/visitor controls differ.
- `SessionContext` persists per-room role/actor/token credentials in sessionStorage. Hosts are not GamePlayers and cannot join their own competitive roster. Mock adapter commands validate ownership tokens, not caller-supplied role strings. This is a local simulation boundary, not secure authentication.
- The planned native IndexedDB adapter now stores private room records transactionally. BroadcastChannel invalidates same-origin tab views. If IndexedDB cannot initialize, a visible warning accompanies the memory fallback. Session storage failures retain identity only in the current instance.
- `GameRoom` adds hostNickname and nextJoinOrder. Player removal does not reuse join positions. `GamePlayer.isMock` distinguishes simulations from local participants everywhere.
- `RoomSettings.minPlayers` is configurable from creation and host lobby, integer 2..maxPlayers. Default two supports the requested local test flow; intended groups remain 8–15. Host commands remain blocked below the configured minimum and after start.
- `RoomGateway` adds host-only removePlayer, setMinimumPlayers and start commands. Creation accepts a host nickname. Public snapshots expose viewerRole, optional viewerPlayerId and persistence availability without private tokens.
- A separate development simulator adds explicitly marked mock players, generates unique random nicknames and resets only mock players. Host ownership is still required. `isDevMode()` hides the panel in production and rejects simulation writes. Production continues to disclose saved mock participants.
- Starting atomically locks lobby membership, opens the first selected question with absolute timestamps, and navigates room members to `/game/:roomCode`. Retry cannot reset the round. Live countdown progression, answers, scoring and later rounds are outside Phase 4.
- Seed DEMO22 has simulated members but no visitor-owned host credential. Users create their own room for host tools. Development player preview does not change identity or add the host to rankings.
- Tests cover the complete UI host flow, authorization, capacity, uniqueness, minimums, session recreation, simulated reset preserving real members, and memory fallback. Real IndexedDB/BroadcastChannel and browser refresh must still be verified in a browser because the environment blocks Chromium/local sockets.
- Earlier Phase 2/3 in-memory and no-host-control notes below are historical and superseded by this section. Domain/port/adapter and topic separation remain unchanged.

## Phase 3 implementation notes

The user requested the main consumer UI on the existing architecture. Domain/port/adapter separation and feature routing remain unchanged.

- Landing: original CSS game-card illustration, primary “Играть” link to join, secondary “Создать игру” link to catalogue, repository-backed Quran feature, how-to steps, and category links.
- Catalogue: shared quiz cards with topic, description, count, estimated duration, difficulty, and availability. Query-parameter category filters support direct links and useful upcoming-category empty states.
- Preview: rules, sample prompts, estimated duration, difficulty and default room settings. Placeholder content has planned difficulty clearly labelled and no create-room CTA.
- Creation: validated question count, answer duration, base points, maximum speed bonus and player capacity; live summary and reset action. Chosen settings and the first N question IDs are saved in the room and visible in its lobby.
- Join: per-field accessible feedback, normalization, useful service errors, demo-code helper and an explicit success screen with a lobby link. Joining no longer immediately navigates away.
- Shared presentation: native button directive, projected form fields, badges, page headers, loading/empty states, quiz artwork, facts and cards. No custom form-control framework or additional runtime dependencies.
- `Quiz` now has generic difficulty metadata. `RoomSettings` adds questionCount, pointsPerCorrectAnswer, speedBonusPoints; `GameRoom` stores selected questionIds. `RoomGateway.create` accepts optional settings and can reject `invalid-settings`.
- Defaults remain all available questions, 20 seconds (or quiz default), 1,000 points, maximum 500 bonus points, and capacity 15. Constraints: question count 1..available, time 5..120 seconds, base points 100..5,000, bonus 0..base, capacity 2..15; all numeric values must be integers. Future scoring uses the configured base and maximum bonus in the original proportional-time formula. Zero maximum bonus disables it.
- Duration estimates allow 15 seconds per question for host-paced reveals. They are guidance, not enforced game duration.
- Cream remains the foundation, coral marks primary actions, emerald anchors the Quran feature, and blue/lavender support topic illustrations. System typography remains offline; no external fonts or AI-generated bitmap assets are required.
- Responsive breakpoints adapt the hero, cards, preview, settings and join pages. Reduced motion, keyboard focus, native form semantics and explicit unavailable states remain required.
- Live gameplay, Firebase and cross-tab persistence remain outside this UI phase. No genuine Quran content has been invented.

## Phase 2 implementation notes

- The user's Phase 2 entity names are authoritative: `Quiz`, `QuizQuestion`, `GameRoom`, `GamePlayer`, `PlayerAnswer`, and `GameResult`, each in its own domain file. `QuestionSolution` remains separate from player questions.
- Question metadata is `Record<string, string | number>`; no topic fields appear on game entities.
- The user's Phase 2 routes replace the original route proposal: `/`, `/quizzes`, `/quiz/:quizId`, `/create-room/:quizId`, `/join`, `/lobby/:roomCode`, `/game/:roomCode`, `/results/:roomCode`, `/leaderboard`, plus a not-found route.
- Three DI ports cover quiz reads, room observation/create/join commands, and result reads. The small foundation does not yet need a room facade, session context, clock service, or game engine.
- The current room adapter is intentionally in memory: create/join and reactive roster updates work in one tab only. Reload resets changes. IndexedDB, BroadcastChannel, tab identity, host authorization, and reconnection remain future multiplayer-stage work; this is a scope deferral, not a replacement architecture.
- Quran content consists of 15 explicitly labelled placeholder slots, five per surah, without invented ayah references, quotations, or answer keys. Placeholder room creation is blocked in both UI and service until content is prepared and reviewed.
- System font stacks establish offline typography. Custom self-hosted fonts remain optional visual polish after license verification; no remote font requests are made.
- Basic navigation, catalog/detail, create/join, lobby, and demo results work. The game route is an explicit future-gameplay placeholder. No live timer, scoring engine, host controls, or real prize award is implemented yet.
- Cross-quiz totals are intentionally not combined; `/leaderboard` lists results per game.

## Product and scope

A reusable private multiplayer quiz platform for friends, initially targeting 8–15 competing players and one non-competing host. The interface is Russian. Games use timed multiple-choice questions, points, speed bonuses, and a final leaderboard with one prize winner.

The first quiz is “Quran Challenge — Three Surahs”: Hud (11), Yusuf (12), and Nuh (71). Future topics include programming, movies, history, science, and general knowledge. The engine must remain topic-independent; Quran information belongs only in content and metadata.

The first phase is a static, locally functional Angular prototype. No Firebase SDK, APIs, authentication, backend, deployment, or remote multiplayer. Real phones will join host rooms after Firebase integration.

## Repository discovery

The initial inspection found no application files, package manifest, lockfile, Angular configuration, styles, assets, routes, components, or applicable AGENTS.md. Only empty environment directories were present: `.agents`, `.aws`, `.codex`, and `.git`. Git did not recognize the workspace as a repository.

There is no installed project Angular version to report and no existing functionality to preserve. Workspace scaffolding, tooling, tests, content, and usable Git initialization are missing.

## Technical baseline

- Angular 22 stable, standalone components, strict TypeScript, Angular Router, SCSS, and reactive forms.
- Signals for readonly view state and computed values; RxJS for asynchronous room streams.
- Use compatible Node and TypeScript versions from https://angular.dev/reference/versions and pin exact versions when scaffolding. Recheck stable compatibility at implementation time.
- Angular-supported unit-test setup and Playwright for browser scenarios.
- Lazy-loaded features. No global state library or SSR in the prototype.

## Folder structure

```text
src/app/
  core/
    domain/                 Topic-independent models and pure game rules
    ports/                  Room and quiz repository contracts
    state/                  Session context and room facade
    infrastructure/mock/    Browser persistence, coordination, demo players
  shared/
    ui/                     Buttons, inputs, timer, player list, podium
    styles/                 Tokens, typography, motion, global styles
  features/
    home/
    quiz-library/
    room-setup/
    join/
    host/
    player/
    results/
  content/
    quizzes/                Versioned content and review metadata
```

Shared UI receives inputs and emits events; it does not access persistence or calculate scores.

## Domain models

| Model | Responsibility |
| --- | --- |
| QuizSummary | Topic, title, description, question count, review status |
| QuizDefinition | Versioned question sequence and default settings |
| Question | Stable ID, prompt, options, time limit, optional explanation and metadata |
| QuestionSolution | Correct option and explanation, separate from active player projections |
| RoomSettings | Capacity, answer duration, scoring settings, optional prize description |
| RoomSession | Room ID/code, host identity, quiz version, phase, roster, round and revision |
| Participant | ID, display name, joined order, participation and connection status |
| Round | Question ID, opening time, deadline and lifecycle |
| AnswerSubmission | Participant, round, option, accepted timestamp and command ID |
| ScoreEntry | Correct count, base points, speed points and cumulative answer time |
| LeaderboardEntry | Rank, totals and tie-break information |

Use explicit string unions for phases and typed command failures. Metadata must not affect transitions or scoring. Quran metadata may include surah number, verse references, translation source, and reviewer status.

## Services and state

- **QuizRepository:** asynchronously list summaries and load versioned definitions.
- **RoomGateway:** create/join rooms, observe role-appropriate snapshots, submit answers, issue host commands, and leave/rejoin.
- **Pure game rules:** validate commands, transition phases, score answers, and rank players without Angular dependencies.
- **RoomFacade:** consume gateway streams and expose readonly Signals and computed UI state.
- **SessionContext:** preserve tab-specific participant/host credentials in sessionStorage. Names are not identities.
- **Clock:** injectable time source for deterministic tests and deadline-based displays.
- **DemoPlayerController:** send ordinary player commands through the gateway with reproducible delays.

Components must not import mock implementations. Angular injection tokens select adapters. Commands return typed success/failure outcomes; room observation uses RxJS observables. UI states distinguish loading, ready, reconnecting, missing room, rejected command, and closed session.

## Local multiplayer adapter

The approved demonstration uses synchronized tabs in the same browser profile and origin, plus optional clearly labelled demo players.

Use IndexedDB for shared persistence and transactional command updates. BroadcastChannel notifies tabs to reread snapshots; broadcast messages are not the source of truth.

- Check commands against the current revision and phase.
- Use command IDs for idempotent retries.
- The host tab coordinates deadline transitions; subsequent host actions reconcile expired deadlines.
- Reload restores the tab's role and current room state.
- Unsupported storage/broadcast capabilities show a useful error.
- This is not secure against browser inspection and does not connect separate devices.

## Firebase replacement boundary

Later, replace gateway and repository adapters through dependency injection without changing component contracts. Keep all writes behind commands, mutable database documents out of components, and host/player projections separate.

Firebase integration additionally requires trusted identity, authorization, authoritative timestamps, atomic answer acceptance, protected solutions, presence, trusted scoring and phase transitions, and backend-owned scheduling. An SDK swap alone cannot provide these guarantees.

Maintain gateway contract tests for both adapters. Local credentials provide prototype continuity only and must not be treated as future authentication.

## Routes and navigation

| Route | Purpose |
| --- | --- |
| `/` | Welcome, host/join actions, short rules |
| `/quizzes` | Quiz selection and review status |
| `/host/new/:quizId` | Room settings and prize description |
| `/join` | Room code and player name |
| `/join/:code` | Prefilled invitation |
| `/host/:code` | Host lobby and phase-driven console |
| `/play/:code` | Player lobby, question, waiting and reveal views |
| `/results/:code` | Final podium and complete leaderboard |
| `/**` | Friendly not-found page |

Keep phases within the host/player routes so refresh does not rely on navigation history. Guards check local session/role and route to join or recovery screens; guards are UX controls, not security.

## Rooms, roles and participants

- Six-character uppercase room codes excluding ambiguous characters; retry collisions.
- Exactly one host, excluded from competitive rankings.
- Target 8–15 players; hard maximum 15. Smaller games are allowed for testing with host confirmation below eight.
- Trim names, require case-insensitive uniqueness within a room, and limit to 24 characters.
- Host may remove players in the lobby, start, reveal, advance, and end with confirmation.
- Lock new joins after start; existing participants may reconnect using their session identity.
- Disconnected players retain scores; unanswered rounds earn zero.
- No host transfer or live question editing in v1.
- If the host tab closes, players wait. Reopening the host route in the same tab/session restores control when its credential is retained.

## Game lifecycle

```text
lobby → question_open → answers_locked → reveal
             ↑                            |
             └──────── next round ─────────┘
                                          → finished
Any active phase → cancelled
```

- Starting opens the first question; advancing opens the next.
- Default duration: 20 seconds, with question-level overrides.
- Host sees response counts, not unrevealed choices.
- Lock answers at the deadline or when every active competitor has answered.
- Host explicitly reveals, then advances; after the final reveal, host finishes.
- No pause/resume or early manual closure in v1.
- Store absolute opening/deadline timestamps and derive countdowns from the clock. Background throttling must not extend the window.
- Accept only when `acceptedAt < deadline`.
- Selection is tentative until “Ответить”; one accepted submission is final.
- Retries cannot overwrite answers. Unconfirmed selections never auto-submit.

## Scoring and winner

Correct answers earn:

```text
1,000 base points
+ floor(500 × remainingMilliseconds / durationMilliseconds)
```

Clamp the bonus to 0–500. Incorrect answers and timeouts earn zero; no penalties.

Rank by total points, then correct count, then lowest cumulative response time on correct answers, then earliest lobby join order. Display these rules before play. Use identical rules for interim and final rankings; there is exactly one prize winner.

## UI and visual direction

The product should feel like a polished, positive party quiz for friends, not a SaaS dashboard.

- Warm paper background, dark ink, and a restrained coral/yellow/mint/violet palette.
- Bold shapes, crisp outlines, tactile button shadows, deliberate layouts.
- Cyrillic-capable expressive headings, such as Unbounded, and readable body text, such as Golos Text; self-host after license verification.
- Large, restrained question text; no excessive gradients, glassmorphism, generic card grids, or random decoration.
- Friendly Russian copy: “Все в сборе?”, “Ответ принят”, “Готовы к следующему вопросу?”.
- Sacred text and explanations remain respectful and neutral. Humor belongs to interface interactions, never sacred content.
- Meaningful answer confirmation, score and podium animations; celebrate player achievement.

Host screens prioritize room code, roster, question, response count, timer, and one clear phase action. Player screens prioritize large options, explicit submission status, and calm waiting states. Reveals show correct answer, explanation, points, and rank movement. Results show winner, optional prize, podium, and all competitors.

“Сыграть ещё” creates a fresh room and preserves previous results.

Shared UI: buttons, labelled inputs, dialogs, notifications, code/invitation display, roster, avatar initials, connection indicators, question panel, options, countdown, question progress, response count, score reveal, leaderboard, podium, and loading/empty/recovery/error states.

### Responsive and accessible behavior

- Mobile-first player screens from 320 px; desktop/projector-friendly host screens.
- Stacked full-width options on phones; two columns when space permits.
- Minimum 44 px touch targets, visible keyboard focus, sufficient contrast.
- Correctness must not depend on color alone.
- Respect reduced motion; do not announce every countdown tick.
- Document language is Russian; Arabic quotations receive appropriate language and direction attributes.

## Initial content

Prepare 15 draft questions: five each for Hud (11), Yusuf (12), and Nuh (71), with four options and one correct answer. Each requires an explanation, precise verse references, translation/source attribution, and review status.

Avoid disputed interpretations and unverified quotations. Use synthetic topic-neutral fixtures for engine tests. Draft rooms show “Черновик: требуется проверка” and require host acknowledgement before starting. Actual content approval requires user review before real play. Acknowledgement is not content approval. Authoring tools are outside v1.

## Implementation stages

### 1. Foundation

- **Files/components:** workspace configuration, app.config.ts, route shell, global SCSS.
- **Behavior:** strict standalone Angular app and tooling.
- **Dependencies:** none.
- **Acceptance/testing:** development and production builds and baseline tests pass; Russian shell renders; exact dependency versions recorded.

### 2. Domain rules

- **Files/components:** core/domain models and pure transition, scoring and ranking functions.
- **Behavior:** topic-independent game engine.
- **Dependencies:** stage 1.
- **Acceptance/testing:** unit tests for legal/illegal transitions, deadline boundaries, duplicate answers, scoring limits, timeouts, tie-breaks and host exclusion.

### 3. Content boundary

- **Files/components:** quiz repository contract, static adapter, Quran draft and generic fixtures.
- **Behavior:** versioned catalog with review metadata.
- **Dependencies:** stage 2.
- **Acceptance/testing:** validation detects duplicate IDs, invalid correct options and missing references; unrelated topics load through the same contract.

### 4. UI foundation and entry flow

- **Files/components:** shared UI/styles, home, quiz library, room setup and join pages.
- **Behavior:** playful responsive identity and Russian forms.
- **Dependencies:** stages 1 and 3.
- **Acceptance/testing:** keyboard navigation and validation work; inspect 320 px, tablet and desktop layouts; draft warning is visible.

### 5. Mock rooms and lobby

- **Files/components:** RoomGateway, IndexedDB adapter, broadcaster, session context, host/player lobbies.
- **Behavior:** create/join/rejoin, roster, capacity and lobby removal.
- **Dependencies:** stages 2–4.
- **Acceptance/testing:** multiple browser pages in one context verify concurrent joins, unique names, capacity, refresh recovery, unauthorized commands and invitation links.

### 6. Live rounds

- **Files/components:** room facade, clock, host console, player question/waiting/reveal views.
- **Behavior:** timed submissions and host-paced transitions.
- **Dependencies:** stage 5.
- **Acceptance/testing:** fake-clock tests cover expiry and background recovery; browser tests cover simultaneous submissions, last-answer locking, reconnect, late answers and repeated clicks.

### 7. Scores and results

- **Files/components:** score reveal, leaderboard, podium, results route.
- **Behavior:** final winner, ranking, prize and fresh-room replay.
- **Dependencies:** stage 6.
- **Acceptance/testing:** scripted games produce exact scores and one winner; refresh preserves results; cancellation does not award a winner.

### 8. Demo and release readiness

- **Files/components:** demo-player controller, recovery states, browser scenarios, README.
- **Behavior:** reproducible 8–15-player demonstrations.
- **Dependencies:** stage 7.
- **Acceptance/testing:** complete games with 8 and 15 participants, including disconnections; keyboard and reduced-motion checks; clean build and targeted test suite; document local limitations and Firebase handoff.

## Integration risks

| Risk | Mitigation |
| --- | --- |
| Mock mistaken for real multiplayer | Explain same-browser scope and phone limitation |
| Client manipulation of answers/roles | Prototype limitation; command boundary and separate projections prepare trusted enforcement |
| Clock/latency affecting prize fairness | Injectable clock now; authoritative acceptance times and deliberate latency policy later |
| Concurrent writes or duplicate scoring | Transactions, idempotency and revision checks |
| Host suspension | Deadline reconciliation and waiting/recovery UI; backend scheduling later |
| Content changes during a game | Immutable quiz version bound to each room |
| Firestore details leaking into UI | Gateway contracts, domain projections and adapter contract tests |
| Session identity confused with authentication | Local credentials are continuity only |
| Incorrect/inappropriate Quran content | References, source attribution, review status and explicit content approval |

## Approved decisions and defaults

The user explicitly chose host-paced rounds, synchronized tabs with optional demo players, and a reviewable Russian Quran draft. Real phone participation is deferred to Firebase.

The approved plan uses 15 draft questions, a 20-second default timer, the scoring formula and deterministic tie-breaks above, a late-join lock, and no pause or host transfer. Changes to these product decisions should be recorded here.
