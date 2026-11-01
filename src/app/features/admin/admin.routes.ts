import { Routes } from '@angular/router';
import { ownerGuard } from '../../core/infrastructure/firebase/owner-access';
export const adminRoutes: Routes = [
  { path: 'login', loadComponent: () => import('./admin-login').then((module) => module.AdminLogin) },
  { path: '', canActivate: [ownerGuard], canActivateChild: [ownerGuard],
    loadComponent: () => import('./admin-shell').then((module) => module.AdminShell), children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./admin-overview').then((module) => module.AdminOverview) },
      { path: 'quizzes', loadComponent: () => import('./admin-library').then((module) => module.AdminLibrary) },
      { path: 'edit/:draftId', loadComponent: () => import('./admin-editor').then((module) => module.AdminEditor),
        canDeactivate: [(component: import('./admin-editor').AdminEditor) => component.canLeave()] },
      { path: 'settings', loadComponent: () => import('./admin-settings').then((module) => module.AdminSettings),
        canDeactivate: [(component: import('./admin-settings').AdminSettings) => component.canLeave()] },
      { path: 'sessions', loadComponent: () => import('./admin-sessions').then((module) => module.AdminSessions) },
      { path: 'account', loadComponent: () => import('./admin-account').then((module) => module.AdminAccount) },
    ] },
];
