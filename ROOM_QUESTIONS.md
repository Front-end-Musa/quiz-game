# Questions controlled by the room creator

Room creators can edit their own room's question text, four answer choices, correct answer, explanation and optional source. They can remove questions, restore unused questions from the source set, add new questions and change their order. These changes do not modify the shared catalogue or grant admin permissions.

## Using the editor

1. Sign in with an allowed host account and choose a quiz.
2. On room setup, select **Выбрать и изменить вопросы** (or **Добавить свои вопросы** for a placeholder quiz).
3. Edit the question set, choose the correct options, and confirm you have reviewed the content. The room uses the first configured number of questions in the displayed order. Counts and timing/scoring settings remain validated.
4. Create the room. In the lobby, **Изменить вопросы и ответы** lets its creator edit the full set again. Save or cancel edits before starting; unsaved question edits disable the host's start action.
5. After the game starts, Firestore denies question/key changes. The game displays and scores the committed room content. A host replay copies that question set into a fresh room.

The editor supports 1–15 complete questions. It clears the review confirmation when content changes. Question text/options/explanations are required; a selected correct option must be one of the four choices. References remain optional. Input size limits match the Rules schema.

## Why the shared Quran quiz is unavailable

The live `quran-three-surahs` version 1 was checked on 2026-11-01: it contains 15 placeholder slots and no solution document. A room using those slots as-is remains blocked. The editor starts with an empty set rather than treating placeholder text as real content.

A host can prepare a complete, reviewed private question set for their own Quran room. To make the shared Quran quiz itself available, the owner must prepare and publish a reviewed version in `/admin/quizzes`. No Quran questions, translations or answer keys were invented by this change, and the shared placeholder was not marked approved.

## Persistence and permissions

- `rooms/{code}` stores the selected question IDs, `hasCustomQuestions`, and `contentRevision` alongside existing settings and host/member information.
- `rooms/{code}/content/questions` stores bounded public question data without answer keys; only room members can read it.
- `rooms/{code}/private/solutions` stores the correct options, explanations and references; only that room's host can read it. The current solution is still revealed publicly only after closure through the existing scoring flow.
- Internal `contentChecks` documents validate pairs of questions and a final revision marker. They bind the entire public/private set to the same parent revision and atomic write. Pair-sized validation stays within Firestore's expression budget; the final marker keeps per-operation document lookups within the ten-document limit. Full 15-question creation and editing by a Google host are emulator-tested.

Only the creator can write this content, and only while both the current and resulting room state are `lobby`. Direct content-only writes, extra fields containing answer keys in public questions, invalid options, incomplete content and stale editor saves are rejected. Every edit atomically updates the room's IDs/count, public questions, private keys and validation markers. Roster membership and other game settings are preserved.

Published bank questions and solution documents retain their existing protections. Hosts may read published answer keys according to the existing trusted-host policy; owning a room does not allow editing the shared bank. Player and nonmember access to private keys remains denied. The local mock adapter mirrors the same game behaviour for development.

Validation on 2026-11-01: strict typecheck, 93 application/UI tests and 15 Firebase emulator tests pass. Tests exercise Quran room preparation, creator edits in the lobby, question selection/reordering, changed answer scoring, 15-question creation and editing through a Google host identity, private-key denial, direct malformed writes, stale edits, start-time locking and replay. The production build passes with the existing size-budget warning (about 932 kB raw initial assets). The room-content Rules were published to `quiz-game-19c55`; no shared Quran content or published quiz was altered. Actual Google-popup/mobile play remains a manual browser check.
