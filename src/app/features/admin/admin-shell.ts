import { Component, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FirebaseConnection } from '../../core/infrastructure/firebase/firebase-connection';
import { OwnerAccess } from '../../core/infrastructure/firebase/owner-access';

@Component({
  selector: 'app-admin-shell', imports: [RouterLink, RouterLinkActive, RouterOutlet],
  styleUrl: './admin.scss',
  template: `<div class="admin-shell">
    <header class="admin-heading"><div><p class="eyebrow">Только владелец</p><h1>Мастерская квизов</h1>
      <p>{{ connection.user()?.email }}</p></div><button class="text-button" (click)="logout()">Выйти</button></header>
    <nav class="admin-nav" aria-label="Управление проектом">
      <a routerLink="/admin" [routerLinkActiveOptions]="{exact: true}" routerLinkActive="selected">Обзор</a>
      <a routerLink="/admin/quizzes" routerLinkActive="selected">Викторины</a>
      <a routerLink="/admin/settings" routerLinkActive="selected">Настройки игры</a>
      <a routerLink="/admin/sessions" routerLinkActive="selected">Комнаты и результаты</a>
      <a routerLink="/admin/account" routerLinkActive="selected">Мой доступ</a>
    </nav>
    @if (access.allowed()) { <router-outlet /> } @else { <p role="status">Проверяем доступ…</p> }
  </div>`,
})
export class AdminShell {
  readonly connection = inject(FirebaseConnection);
  readonly access = inject(OwnerAccess);
  private readonly router = inject(Router);
  constructor() {
    effect(() => { if (!this.access.checking() && !this.access.allowed()) void this.router.navigate(['/admin/login']); });
  }
  async logout() { await this.connection.logout(); await this.router.navigate(['/admin/login']); }
}
