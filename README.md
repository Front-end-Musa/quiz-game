# Квиз Круг — multiplayer quiz prototype

Russian-language Angular 22 standalone prototype for a reusable party quiz platform. Architecture and future stages: [ARCHITECTURE.md](ARCHITECTURE.md).

## Run

Use Node compatible with Angular 22 (`^22.22.3`, `^24.15.0`, or Node 26+). Tested here with Node 26.12.1 and npm 12.2.1.

```sh
npm ci
npm start
```

Open http://localhost:4200. There are no Firebase dependencies, API calls, backend services, or externally loaded fonts.

```sh
npm run typecheck
npm test
npm run build
```

The production SPA is emitted to `dist/quiz-game/browser`. Static hosting must fall back to `index.html` for application routes.

## What works through Phase 4

- Lazy-loaded routes: `/`, `/quizzes`, `/quiz/:quizId`, `/create-room/:quizId`, `/join`, `/lobby/:roomCode`, `/game/:roomCode`, `/results/:roomCode`, `/leaderboard`.
- Three mock quiz datasets, responsive Russian shell, shared SCSS tokens, accessible buttons/inputs, and loading/missing/error states.
- Art-directed landing, category-filtered catalogue, quiz preview, configurable room creation, and validated join with an explicit success state. Shared cards display difficulty, estimated duration and availability.
- Configure question count, time, base points, maximum speed bonus, and capacity. Settings are validated in both the form and adapter, saved to the room and displayed in its lobby. Defaults: all questions, 20 seconds, 1,000 base points, up to 500 bonus, 15 players.
- Create a room with a host nickname and configurable minimum player count (default two for local testing; intended groups remain 8–15). Host ownership is separate from competing players.
- Complete role-aware lobby with title, host, code/copy action, roster, counts, settings and waiting/start status. Only the host can remove players, change the minimum or start.
- In development, host tools add named mock players, generate random nicknames, remove individuals and reset only mock players. All simulated roster entries are explicitly labelled. Production hides these tools and rejects simulation commands.
- Rooms persist in IndexedDB; role credentials persist in sessionStorage across reloads. BroadcastChannel notifies other tabs in the same browser profile/origin. Without IndexedDB, a visible warning explains the in-memory fallback.
- Start opens the first question and navigates room members to the game screen. Answer submission, countdown progression, scoring and later-round controls remain future work.
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

## Current limits

This is local-browser authorization, not secure authentication. IndexedDB and credentials remain inspectable, and separate phones/profiles do not connect. Session credentials belong to the current tab and survive its reload; a new independent tab must join as a player. Tabs opened with an opener may inherit the browser's sessionStorage copy. Clearing site data removes rooms/identity. If session storage is blocked, identity lasts only for the current application instance.

Production builds intentionally hide simulator tools. They preserve and label any mock participants previously saved during development. No presence heartbeat claims remote connectivity. Mock players never send answers.

Only the first-round start transition is implemented. Timer progression, answer submission, scoring and later rounds remain future work. Real phones require Firebase and trusted game authority.

## Code boundaries

- `core/domain`: separate `Quiz`, `QuizQuestion`, `GameRoom`, `GamePlayer`, `PlayerAnswer`, and `GameResult` models; generic metadata only.
- `core/ports`: asynchronous quiz/result repository contracts and room command/observation contract.
- `core/infrastructure/mock`: injectable adapters. `provideMocks()` is the replacement point for future implementations.
- `content/quizzes`: quiz, question, solution and room/result fixtures. Components never import fixtures.
- `features`: lazy standalone pages grouped by feature.
- `shared`: presentation components and design tokens.

Correct options are separated from active question payloads. The local bundle is inspectable; this is a preparation for future protected data, not a security guarantee.

## Verification

The Vitest/Angular suite covers DI services, all routes, create/join/lobby forms, a complete host management/start UI flow, player/visitor permission rejection, forged credentials, capacity, names, minimums, mock reset, session recreation, monotonic join order, and Quran placeholder integrity. Service tests share an in-memory transactional store between independent client injectors and recreate session contexts from storage; they do not exercise real IndexedDB disk I/O. Build compiles strict TypeScript and strict Angular templates.

Dependencies are pinned and a lockfile is included in the source deliverable. In this environment installation succeeded offline using the available package cache because registry DNS was unavailable.

### Results in this environment

- `npm run typecheck`: passed.
- `npm test`: 61 tests passed across two test files, including RouterTestingHarness navigation and create/join interactions.
- `npm run build`: passed, including strict Angular template compilation; within configured bundle budgets.
- `npm start`: could not bind `127.0.0.1:4200` because this sandbox rejects local listening sockets (`EPERM`).
- A Chromium smoke attempt was also blocked by sandbox process/socket restrictions before page launch. Real-browser rendering and responsive layout are therefore not verified here.
