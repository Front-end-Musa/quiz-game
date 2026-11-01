import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { FirebaseConnection } from '../../core/infrastructure/firebase/firebase-connection';
import { OwnerAccess } from '../../core/infrastructure/firebase/owner-access';
import { OWNER_EMAIL } from '../../core/domain/admin-quiz';
import { Button } from '../../shared/ui/button';
import { adminError } from './admin-error';

@Component({
  selector: 'app-admin-login', imports: [ReactiveFormsModule, RouterLink, Button], styleUrl: './admin.scss',
  template: `<section class="admin-login panel stack"><p class="eyebrow">Личный кабинет владельца</p><h1>Вход в управление</h1>
    <p>Доступ разрешён только владельцу проекта. Ведущие и игроки не получают права редактора.</p>
    @if (connection) {
      <button appButton type="button" [disabled]="busy()" (click)="google()">Войти через Google</button>
      <form class="stack" [formGroup]="form" (ngSubmit)="password()">
        <label>Email<input type="email" formControlName="email" autocomplete="username" required /></label>
        <label>Пароль<input type="password" formControlName="password" autocomplete="current-password" required /></label>
        <button appButton [disabled]="busy() || form.invalid">Войти с паролем</button>
      </form>
      <p class="muted">При первом входе используйте Google. Свой пароль можно установить в разделе «Мой доступ».</p>
      <div class="admin-actions"><button class="text-button" [disabled]="busy()" (click)="reset()">Восстановить пароль</button>
        <button class="text-button" [disabled]="busy()" (click)="refresh()">Проверить доступ снова</button>
        @if (connection.user() && !connection.user()?.isAnonymous) {
          <button class="text-button" [disabled]="busy()" (click)="exit()">Выйти из текущего аккаунта</button>
        }
      </div>
    } @else { <p>Управление доступно в режиме Firebase. Запустите обычную версию приложения.</p> }
    @if (message()) { <p role="status">{{ message() }}</p> }
    @if (error()) { <p role="alert">{{ error() }}</p> }
    <a routerLink="/">← Вернуться к игре</a>
  </section>`,
})
export class AdminLogin {
  readonly connection = inject(FirebaseConnection, { optional: true });
  private readonly access = inject(OwnerAccess, { optional: true });
  private readonly router = inject(Router);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly form = new FormGroup({ email: new FormControl(OWNER_EMAIL, { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }) });
  private async run(action: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await action(); } catch (error) { this.error.set(adminError(error)); }
    finally { this.busy.set(false); this.form.controls.password.reset(''); }
  }
  private async enter() {
    if (await this.access?.check(true)) await this.router.navigate(['/admin']);
    else this.error.set('Доступ запрещён. Войдите в подтверждённый аккаунт владельца с настроенными правами администратора.');
  }
  google() { return this.run(async () => { if (await this.connection?.google(true)) await this.enter(); else this.error.set(this.connection?.error() ?? 'Вход не выполнен.'); }); }
  password() { return this.run(async () => {
    if (this.form.invalid || !this.connection) return;
    await this.connection.password(this.form.controls.email.value.trim(), this.form.controls.password.value);
    await this.enter();
  }); }
  refresh() { return this.run(() => this.enter()); }
  reset() { return this.run(async () => {
    if (this.form.controls.email.invalid) throw new Error('Введите корректный email.');
    await this.connection?.resetPassword(this.form.controls.email.value.trim());
    this.message.set('Если для этого адреса доступно восстановление, письмо отправлено.');
  }); }
  exit() { return this.run(async () => { await this.connection?.logout(); this.message.set('Вы вышли.'); }); }
}
