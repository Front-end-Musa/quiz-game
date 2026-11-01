import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { FirebaseConnection } from '../../core/infrastructure/firebase/firebase-connection';
import { OwnerAccess } from '../../core/infrastructure/firebase/owner-access';
import { AdminRepository } from '../../core/infrastructure/firebase/admin.repository';
import { GameDefaultsRepository } from '../../core/infrastructure/firebase/game-defaults.repository';
import { newDraft, OWNER_EMAIL, QuizDraft } from '../../core/domain/admin-quiz';
import { AdminEditor } from './admin-editor';
import { AdminAccount } from './admin-account';

let allowed = signal(false);
let grantOnGoogle = true;
const drafts = new Map<string, QuizDraft>();
const repository = {
  page: vi.fn(async () => ({ rows: [], cursor: null })),
  getDraft: vi.fn(async (id: string) => drafts.get(id) ?? null),
  save: vi.fn(async (draft: QuizDraft) => { drafts.set(draft.id, { ...structuredClone(draft), revision: draft.revision + 1 }); return draft.revision + 1; }),
  publish: vi.fn(async () => {}), saveDefaults: vi.fn(async () => {}),
};
const connection = {
  user: signal<{ email: string; uid: string; isAnonymous: boolean } | null>({ email: OWNER_EMAIL, uid: 'owner', isAnonymous: false }),
  error: signal(''), google: vi.fn(async () => { if (grantOnGoogle) allowed.set(true); return true; }),
  password: vi.fn(async () => { allowed.set(true); }), resetPassword: vi.fn(async () => {}), adminSession: vi.fn(async () => {}),
  logout: vi.fn(async () => { allowed.set(false); connection.user.set(null); }),
  setOwnerPassword: vi.fn(async () => {}), reauthenticate: vi.fn(async () => {}),
};
beforeEach(() => {
  vi.clearAllMocks(); drafts.clear(); allowed = signal(false); grantOnGoogle = true;
  connection.user.set({ email: OWNER_EMAIL, uid: 'owner', isAnonymous: false });
  TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding()),
    { provide: FirebaseConnection, useValue: connection },
    { provide: OwnerAccess, useValue: { allowed, checking: signal(false), check: async () => allowed() } },
    { provide: AdminRepository, useValue: repository },
    { provide: GameDefaultsRepository, useValue: { get: async () => null } },
  ] });
});
afterEach(() => vi.restoreAllMocks());

it('redirects nonowners from protected editor routes to login', async () => {
  const harness = await RouterTestingHarness.create('/admin/edit/new');
  await harness.fixture.whenStable(); harness.detectChanges();
  expect(TestBed.inject(Router).url).toBe('/admin/login');
  expect(harness.routeNativeElement?.textContent).toContain('Вход в управление');
  expect(repository.getDraft).not.toHaveBeenCalled();
});
it('enters the owner dashboard through Google login and signs out', async () => {
  const harness = await RouterTestingHarness.create('/admin/login');
  await harness.fixture.whenStable(); harness.detectChanges();
  [...harness.routeNativeElement!.querySelectorAll('button')].find((button) => button.textContent?.includes('Войти через Google'))!.click();
  await harness.fixture.whenStable(); harness.detectChanges();
  expect(connection.google).toHaveBeenCalledWith(true);
  expect(TestBed.inject(Router).url).toBe('/admin');
  expect(harness.routeNativeElement?.textContent).toContain('Мастерская квизов');
  [...harness.routeNativeElement!.querySelectorAll('button')].find((button) => button.textContent === 'Выйти')!.click();
  await harness.fixture.whenStable();
  expect(connection.logout).toHaveBeenCalled();
  expect(TestBed.inject(Router).url).toBe('/admin/login');
});
it('shows access denied after a successful nonowner authentication', async () => {
  grantOnGoogle = false;
  const harness = await RouterTestingHarness.create('/admin/login');
  await harness.fixture.whenStable(); harness.detectChanges();
  harness.routeNativeElement!.querySelector<HTMLButtonElement>('button')!.click();
  await harness.fixture.whenStable(); harness.detectChanges();
  expect(harness.routeNativeElement?.querySelector('[role=alert]')?.textContent).toContain('Доступ запрещён');
  expect(TestBed.inject(Router).url).toBe('/admin/login');
});
it('validates publication and saves a complete owner draft before publishing', async () => {
  allowed.set(true);
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/admin/edit/new');
  await harness.fixture.whenStable(); harness.detectChanges();
  // Get the editor from its nested owner shell outlet.
  const element = harness.fixture.debugElement.query((node) => node.componentInstance instanceof AdminEditor);
  const component = element!.componentInstance as AdminEditor;
  await component.save(true);
  expect(repository.publish).not.toHaveBeenCalled();
  expect(component.error()).toContain('проверку');
  component.form.controls.title.setValue('Наука'); component.form.controls.topic.setValue('Мир'); component.add();
  const question = component.questions.at(0);
  question.controls.prompt.setValue('Сколько сторон у квадрата?');
  for (const [index, value] of ['3', '4', '5', '6'].entries()) question.controls.options.at(index).setValue(value);
  question.controls.correctOptionId.setValue('2'); question.controls.explanation.setValue('У квадрата четыре стороны.');
  component.form.controls.reviewed.setValue(true);
  await component.save(true);
  await harness.fixture.whenStable();
  expect(repository.save).toHaveBeenCalledOnce(); expect(repository.publish).toHaveBeenCalledOnce();
  const saved = repository.publish.mock.calls[0] as unknown as [QuizDraft];
  expect(saved[0].questions[0].options[1].text).toBe('4');
  expect(saved[0].solutions[0].correctOptionId).toBe('2');
  expect(component.form.pristine).toBe(true);
});
it('uses Firebase password login and clears the password after authentication', async () => {
  const harness = await RouterTestingHarness.create('/admin/login');
  await harness.fixture.whenStable(); harness.detectChanges();
  const input = harness.routeNativeElement!.querySelector<HTMLInputElement>('input[type=password]')!;
  input.value = 'Temporary-test-value-123'; input.dispatchEvent(new Event('input'));
  harness.detectChanges();
  harness.routeNativeElement!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await harness.fixture.whenStable();
  expect(connection.password).toHaveBeenCalledWith(OWNER_EMAIL, 'Temporary-test-value-123');
  expect(TestBed.inject(Router).url).toBe('/admin');
});
it('protects unsaved editor changes when navigating away', async () => {
  allowed.set(true);
  const harness = await RouterTestingHarness.create('/admin/edit/new');
  await harness.fixture.whenStable();
  const component = harness.fixture.debugElement.query((node) => node.componentInstance instanceof AdminEditor)!.componentInstance as AdminEditor;
  component.form.markAsDirty();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  await harness.navigateByUrl('/admin/quizzes');
  expect(confirm).toHaveBeenCalled(); expect(TestBed.inject(Router).url).toBe('/admin/edit/new');
});
it('sets a private password only when confirmation matches and clears form secrets', async () => {
  allowed.set(true);
  const harness = await RouterTestingHarness.create('/admin/account');
  await harness.fixture.whenStable();
  const component = harness.fixture.debugElement.query((node) => node.componentInstance instanceof AdminAccount)!.componentInstance as AdminAccount;
  component.form.setValue({ password: 'Temporary-test-value-123', confirm: 'different' });
  expect(component.form.invalid).toBe(true);
  await component.save(); expect(connection.setOwnerPassword).not.toHaveBeenCalled();
  component.form.setValue({ password: 'Temporary-test-value-123', confirm: 'Temporary-test-value-123' });
  await component.save(); expect(connection.setOwnerPassword).toHaveBeenCalledWith('Temporary-test-value-123');
  expect(component.form.controls.password.value).toBe(''); expect(component.form.controls.confirm.value).toBe('');
});
