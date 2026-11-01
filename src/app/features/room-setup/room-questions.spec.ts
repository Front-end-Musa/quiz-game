import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { routes } from '../../app.routes';
import { provideMocks } from '../../core/infrastructure/mock/provide-mocks';
import { ROOM_GATEWAY } from '../../core/ports/room-gateway';
import { QUIZ_REPOSITORY } from '../../core/ports/quiz-repository';
import { MockPlayerSimulator } from '../../core/infrastructure/mock/mock-player-simulator';
import { RoomQuestionEditor } from '../../shared/ui/room-question-editor';

beforeEach(() => {
  sessionStorage.clear();
  TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding()), ...provideMocks()] });
});
function button(harness: RouterTestingHarness, label: string) {
  return [...harness.routeNativeElement!.querySelectorAll('button')].find((entry) => entry.textContent?.includes(label))!;
}
async function stable(harness: RouterTestingHarness) { await harness.fixture.whenStable(); harness.detectChanges(); }
function fill(harness: RouterTestingHarness, selector: string, value: string) {
  const element = harness.routeNativeElement!.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)!;
  element.value = value;
  element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  harness.detectChanges();
}
function reviewed(harness: RouterTestingHarness) {
  const checkbox = harness.routeNativeElement!.querySelector<HTMLInputElement>('#room-content-reviewed')!;
  checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true })); harness.detectChanges();
}
function submit(harness: RouterTestingHarness) {
  harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}
it('keeps Quran placeholders blocked but lets a creator prepare and play reviewed private questions', async () => {
  const harness = await RouterTestingHarness.create('/create-room/quran-three-surahs');
  await stable(harness);
  expect(harness.routeNativeElement!.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);
  button(harness, 'Добавить свои вопросы').click(); await stable(harness);
  expect(harness.routeNativeElement!.querySelectorAll('app-room-question-editor fieldset')).toHaveLength(0);
  button(harness, '+ Новый вопрос').click(); await stable(harness);
  fill(harness, 'app-room-question-editor textarea[formControlName=prompt]', 'Вопрос, подготовленный ведущим');
  for (let index = 0; index < 4; index++) fill(harness,
    `app-room-question-editor [formArrayName=options] label:nth-child(${index + 1}) input`, `Ответ ${index + 1}`);
  fill(harness, 'app-room-question-editor select[formControlName=correctOptionId]', '2');
  fill(harness, 'app-room-question-editor textarea[formControlName=explanation]', 'Объяснение, проверенное ведущим.');
  submit(harness); await stable(harness);
  expect(TestBed.inject(Router).url).toContain('/create-room/');
  expect(harness.routeNativeElement?.textContent).toContain('Подтвердите проверку');
  reviewed(harness); submit(harness); await stable(harness);
  const code = TestBed.inject(Router).url.split('/').at(-1)!;
  const gateway = TestBed.inject(ROOM_GATEWAY);
  expect((await firstValueFrom(gateway.observe(code)))?.room.hasCustomQuestions).toBe(true);
  expect((await TestBed.inject(QUIZ_REPOSITORY).get('quran-three-surahs'))?.status).toBe('placeholder');
  button(harness, 'Изменить вопросы и ответы').click(); await stable(harness);
  fill(harness, 'app-room-question-editor textarea[formControlName=prompt]', 'Обновлённый вопрос комнаты');
  expect(button(harness, 'Начать игру').disabled).toBe(true);
  reviewed(harness); button(harness, 'Сохранить вопросы комнаты').click(); await stable(harness);
  expect((await gateway.publicQuestions(code))[0].prompt).toBe('Обновлённый вопрос комнаты');
  const simulator = TestBed.inject(MockPlayerSimulator);
  await simulator.add(code, 'Первый'); await simulator.add(code, 'Второй'); await stable(harness);
  button(harness, 'Начать игру').click(); await stable(harness);
  expect(TestBed.inject(Router).url).toBe(`/game/${code}`);
  expect(harness.routeNativeElement?.textContent).toContain('Обновлённый вопрос комнаты');
  const state = await firstValueFrom(gateway.observe(code));
  await gateway.revealAnswer(code, state!.room.currentRound!.id); await stable(harness);
  expect(harness.routeNativeElement?.textContent).toContain('Ответ 2');
});

it('lets a creator remove, reorder and edit the chosen questions while preserving the published bank', async () => {
  const harness = await RouterTestingHarness.create('/create-room/general-knowledge');
  await stable(harness); button(harness, 'Выбрать и изменить вопросы').click(); await stable(harness);
  const editor = harness.fixture.debugElement.query((node) => node.componentInstance instanceof RoomQuestionEditor)!.componentInstance as RoomQuestionEditor;
  editor.remove(1); editor.move(1, -1); await stable(harness);
  fill(harness, '#questionCount', '1');
  fill(harness, 'app-room-question-editor textarea[formControlName=prompt]', 'Первый выбранный вопрос');
  fill(harness, 'app-room-question-editor select[formControlName=correctOptionId]', '4');
  fill(harness, 'app-room-question-editor textarea[formControlName=explanation]', 'Изменённый ключ ответа только для комнаты.');
  reviewed(harness); submit(harness); await stable(harness);
  const code = TestBed.inject(Router).url.split('/').at(-1)!;
  const gateway = TestBed.inject(ROOM_GATEWAY);
  const state = await firstValueFrom(gateway.observe(code));
  expect(state?.room.questionIds).toEqual(['general-3']);
  expect((await gateway.publicQuestions(code))[0].prompt).toBe('Первый выбранный вопрос');
  const keys = await gateway.editableRoomQuestions(code);
  expect(keys.ok && keys.value.solutions[0].correctOptionId).toBe('4');
  expect((await TestBed.inject(QUIZ_REPOSITORY).getQuestions('general-knowledge'))[2].prompt)
    .toBe('Какой газ растения поглощают при фотосинтезе?');
});
