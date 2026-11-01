# Квиз Круг — multiplayer quiz prototype

**Room question editing:** creators can edit prompts, options, correct answers, explanations and question order before creation and in the lobby. Changes are private to that room and locked at game start. A Quran room can use the host's own reviewed content; the shared Quran quiz still contains unfinished placeholders. See [ROOM_QUESTIONS.md](ROOM_QUESTIONS.md).

**Owner admin panel:** open `/admin/login`, sign in through the designated owner's Google account, then manage quizzes, question/answer drafts, published versions, game defaults and room history. See [ADMIN_PANEL.md](ADMIN_PANEL.md). Set a fresh private password under “Мой доступ” if email/password login is desired.

**Firebase update (2026-11-01):** normal runs/builds now use Firebase Authentication and Firestore. Follow [FIREBASE_SETUP.md](FIREBASE_SETUP.md) to deploy Rules, seed the empty database and enable your Google host account. `npm run start:mock` runs the original local prototype. The phase notes below describe that earlier mock implementation.

Russian-language Angular 22 standalone prototype for a reusable party quiz platform. Architecture: [ARCHITECTURE.md](ARCHITECTURE.md). Audit evidence/limitations: [FINAL_AUDIT.md](FINAL_AUDIT.md). Future Spark integration: [FIREBASE_PREPARATION.md](FIREBASE_PREPARATION.md).

## Run

Use Node compatible with Angular 22 (`^22.22.3`, `^24.15.0`, or Node 26+). Tested here with Node 26.12.1 and npm 12.2.1.

```sh
npm ci
npm start
```

Open http://localhost:4200. Normal runs connect to Firebase; complete [Firebase setup](FIREBASE_SETUP.md) first. Use `npm run start:mock` for the offline demo.

```sh
npm run typecheck
npm test
npm run build
```

The production SPA is emitted to `dist/quiz-game/browser`. Static hosting must fall back to `index.html` for application routes.

## What works through Phase 6

- Lazy-loaded routes: `/`, `/quizzes`, `/quiz/:quizId`, `/create-room/:quizId`, `/join`, `/lobby/:roomCode`, `/game/:roomCode`, `/results/:roomCode`, `/leaderboard`.
- Three mock quiz datasets, responsive Russian shell, shared SCSS tokens, accessible buttons/inputs, and loading/missing/error states.
- Art-directed landing, category-filtered catalogue, quiz preview, configurable room creation, and validated join with an explicit success state. Shared cards display difficulty, estimated duration and availability.
- Configure question count, time, base points, maximum speed bonus, and capacity. Settings are validated in both the form and adapter, saved to the room and displayed in its lobby. Defaults: all questions, 20 seconds, 100 base points, up to 50 bonus, 15 players.
- Create a room with a host nickname and configurable minimum player count (default two for local testing; intended groups remain 8–15). Host ownership is separate from competing players.
- Complete role-aware lobby with title, host, code/copy action, roster, counts, settings and waiting/start status. Only the host can remove players, change the minimum or start.
- In development, host tools add named mock players, generate random nicknames, remove individuals and reset only mock players. All simulated roster entries are explicitly labelled. Production hides these tools and rejects simulation commands.
- Rooms persist in IndexedDB; role credentials persist in sessionStorage across reloads. BroadcastChannel notifies other tabs in the same browser profile/origin. Without IndexedDB, a visible warning explains the in-memory fallback.
- Complete gameplay: a deadline-based countdown, immediate immutable answers, correct/incorrect/timeout feedback, explanations, optional references, and per-question rankings. The timer reveals automatically; the host advances.
- Shared winner screen on game completion and the results route: first place, animated celebration with reduced-motion support, final rankings, points, correct count, accuracy and per-player statistics.
- Replay creates a fresh room with the same settings, leaving past results intact. The leaderboard lists games separately and clearly labels fixtures and mock participants.
- Seed lobby: `/lobby/DEMO22` (three example players); join it with code `DEMO22`.
- Illustrative completed results: `/results/FINISH`. These are not earned scores. Leaderboards remain scoped to individual games.
- Fifteen Quran question slots, five per surah, explicitly marked as placeholders. There are no unverified religious claims or invented references. Creating a room for this dataset is blocked.

## Try the entire lobby flow

1. Run `npm start` (development mode), choose a playable demo quiz, and create a room. Enter your host nickname and desired minimum.
2. In its lobby, note the room code. Under **Симулятор игроков**, use **Случайное имя**, then **Добавить mock-игрока**. Repeat until the minimum is reached.
3. Remove an individual or use **Сбросить mock-игроков**. The reset preserves genuine local memberships and host ownership.
4. Adjust **Минимум игроков**, save, then add enough mocks and press **Начать игру**. The first question opens. Repeated starts cannot reset the round.
5. Reload to restore the room and role. To try an actual player, open an independent tab at the same origin, enter the code and a unique nickname. The player sees a waiting lobby and no start/management controls. A host cannot join their own competitive roster.
6. The development-only **Предпросмотр экрана игрока** previews the layout without changing host ownership or creating a competing player.

Seed room DEMO22 is a visitor/player demonstration, not a host-owned room. Create your own room to access host and simulator controls.

## Play a complete game in one tab

1. Run `npm start`, select General Knowledge or Programming Basics, and create a room.
2. In the lobby's development panel, press **Играть самому · DEV**. This creates a separate local participant for you, retains the non-competing host identity as a development controller, fills the minimum with labelled mock players, and starts.
3. Tap one of four options. It submits immediately and locks further choices. Correct options remain hidden until reveal.
4. Let the timer expire or use **Раскрыть ответ · DEV**. Review your answer, explanation, earned points and updated ranking. Sources are displayed only when available; missing demo references are explicitly disclosed.
5. Use **Следующий вопрос · DEV** after each reveal. The last advance opens the winner screen.
6. Expand player statistics or open the results page. **Сыграть ещё** creates a new lobby with the same settings; **На главную** returns home.

Development controls also restart the current attempt (rolling back only its answer/points) or finish early. Early results show completed versus planned question counts. Production hides development controls; regular hosts retain reveal/advance actions, and actual local participants can play from independent tabs.

## Current limits

This is local-browser authorization, not secure authentication. IndexedDB and credentials remain inspectable, and separate phones/profiles do not connect. Session credentials belong to the current tab and survive its reload; a new independent tab must join as a player. Tabs opened with an opener may inherit the browser's sessionStorage copy. Clearing site data removes rooms/identity. If session storage is blocked, identity lasts only for the current application instance.

Production builds intentionally hide simulator tools. They preserve and label any mock participants previously saved during development. No presence heartbeat claims remote connectivity. Mock players never send answers.

Gameplay is complete for the two playable mock quizzes. Quran content remains placeholder-only and unavailable for play. Real phones require Firebase integration; the proposed Spark trusted-host architecture is awaiting approval and is not implemented.

## Code boundaries

- `core/domain`: separate `Quiz`, `QuizQuestion`, `GameRoom`, `GamePlayer`, `PlayerAnswer`, and `GameResult` models; generic metadata only.
- `core/ports`: asynchronous quiz/result repositories, room commands/observation, and optional development-tools contract. UI and state do not import mock implementations.
- `core/infrastructure/mock`: injectable adapters. `provideMocks()` is the replacement point for future implementations.
- `content/quizzes`: quiz, question, solution and room/result fixtures. Components never import fixtures.
- `features`: lazy standalone pages grouped by feature.
- `shared`: presentation components and design tokens.

Correct options are separated from active question payloads. The local bundle is inspectable; this is a preparation for future protected data, not a security guarantee.

## Verification

The Vitest/Angular suite covers DI, routes/forms, host/player permissions, lobby management, complete playthroughs of both playable topics, timeout boundaries, scoring clamps, duplicate/stale answers, restart rollback, solution secrecy before reveal, ranking tie-breaks, accuracy, references, winner/history/replay UI, and Quran placeholder integrity. Service tests share an in-memory transactional store between independent client injectors and recreate session contexts from storage; they do not exercise real IndexedDB disk I/O. Build compiles strict TypeScript and strict Angular templates.

Dependencies are pinned and a lockfile is included in the source deliverable. In this environment installation succeeded offline using the available package cache because registry DNS was unavailable.

### Results in this environment

- `npm run typecheck`: passed.
- `npm test`: 84 tests passed across six test files, including complete landing-to-gameplay/replay UI tests, a distinct-identity 15-player flow, and deterministic timer, scoring, stale-control and rejoin checks.
- `npm run build`: passed, including strict Angular template compilation; within configured bundle budgets.
- `npm start`: could not bind `127.0.0.1:4200` because this sandbox rejects local listening sockets (`EPERM`).
- A Chromium smoke attempt was also blocked by sandbox process/socket restrictions before page launch. Real-browser rendering and responsive layout are therefore not verified here.

## Phase 7 audit changes

Credentialed members can rejoin an already-started game without a second roster entry; new identities still cannot join. Host reveal/advance commands carry the expected attempt ID so a stale tab cannot control a later question. Timer intervals stop outside active questions. Broadcast notification failures no longer discard a working database or turn a committed write into a reported failure. IndexedDB migrations have one owner rather than being duplicated in result retrieval.

`DEVELOPMENT_TOOLS` is supplied only by mock providers; normal UI does not depend on MockPlayerSimulator or read private session tokens. Firebase integration remains documentation only. The existing user-provided `FIREBASE.md` notes were preserved and are not wired into the app.
