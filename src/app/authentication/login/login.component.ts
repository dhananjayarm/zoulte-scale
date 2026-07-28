import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { OfflineUnlockService, type UnlockError } from '../../services/auth/offline-unlock.service';
import { ConnectivityService } from '../../services/sync/connectivity.service';

const UNLOCK_MESSAGES: Record<UnlockError, string> = {
  NOT_AVAILABLE: 'No network connection. Please try again when the network is back.',
  UNKNOWN_USER: 'No network — and this user has never signed in on this station. An online sign-in is required first.',
  INVALID_CREDENTIALS: 'Invalid credentials.',
  LOCKED: 'Too many failed attempts. Restart the app or sign in online to try again.',
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly offlineUnlock = inject(OfflineUnlockService);
  private readonly connectivity = inject(ConnectivityService);

  readonly loginForm = this.fb.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  // Change-password fields live in their own group, only validated in change mode.
  readonly changeForm = this.fb.group({
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  });

  readonly isLoggingIn = signal(false);
  readonly errorMessage = signal('');
  // Shown when the interceptor bounced the user here after a 401.
  readonly sessionExpired = signal(this.route.snapshot.queryParamMap.get('expired') === '1');
  readonly offlineUnlocked = signal(false);

  /** Change-password mode: user-opened, or forced by the server's changepw flag. */
  readonly changeMode = signal(false);
  readonly changeForced = signal(false);
  readonly changeSuccess = signal(false);

  toggleChangeMode(): void {
    this.changeMode.update((on) => !on);
    this.changeForced.set(false);
    this.errorMessage.set('');
    this.changeSuccess.set(false);
  }

  async submit(): Promise<void> {
    if (this.changeMode()) {
      await this.changePassword();
    } else {
      await this.login();
    }
  }

  private async login(): Promise<void> {
    if (this.loginForm.invalid || this.isLoggingIn()) {
      return;
    }

    const { username, password } = this.loginForm.getRawValue();
    this.isLoggingIn.set(true);
    this.errorMessage.set('');
    this.sessionExpired.set(false);

    try {
      if (!this.connectivity.isOnline() && this.offlineUnlock.available) {
        await this.unlockOffline(username ?? '', password ?? '');
        return;
      }
      await this.loginOnline(username ?? '', password ?? '');
    } finally {
      this.isLoggingIn.set(false);
    }
  }

  private async loginOnline(username: string, password: string): Promise<void> {
    try {
      const res = await firstValueFrom(this.auth.login(username, password));
      if (res.status.message !== 'SUCCESS') {
        this.errorMessage.set('Not authorised.');
        return;
      }
      if (res.response.changepw) {
        // Server demands a new password before the session may proceed.
        this.changeMode.set(true);
        this.changeForced.set(true);
        return;
      }
      void this.router.navigateByUrl('/weightscale');
    } catch (err) {
      // Server unreachable (not a credentials problem) → fall back to offline
      // unlock on a station. status 0 = network-level failure.
      const status = (err as { status?: number })?.status ?? 0;
      if (status === 0 && this.offlineUnlock.available) {
        await this.unlockOffline(username, password);
        return;
      }
      const serverMessage = (err as { error?: { status?: { message?: string } } })?.error?.status?.message;
      this.errorMessage.set(serverMessage ?? 'Login failed. Please try again.');
    }
  }

  /**
   * chpw needs a Bearer token, so the flow is: authenticate with the CURRENT
   * password (unless the forced flow already did), then change, then proceed.
   */
  private async changePassword(): Promise<void> {
    if (this.loginForm.invalid || this.changeForm.invalid || this.isLoggingIn()) {
      this.loginForm.markAllAsTouched();
      this.changeForm.markAllAsTouched();
      return;
    }
    const { username, password } = this.loginForm.getRawValue();
    const { newPassword, confirmPassword } = this.changeForm.getRawValue();

    if (newPassword !== confirmPassword) {
      this.errorMessage.set('New password and confirmation do not match.');
      return;
    }
    if (newPassword === password) {
      this.errorMessage.set('New password must be different from the current one.');
      return;
    }
    if (!this.connectivity.isOnline()) {
      this.errorMessage.set('Changing the password needs a network connection.');
      return;
    }

    this.isLoggingIn.set(true);
    this.errorMessage.set('');
    try {
      if (!this.changeForced()) {
        const res = await firstValueFrom(this.auth.login(username ?? '', password ?? ''));
        if (res.status.message !== 'SUCCESS') {
          this.errorMessage.set('Current credentials are not valid.');
          return;
        }
      }
      await firstValueFrom(this.auth.changePassword(password ?? '', newPassword ?? ''));
      // The new password is now the offline-unlock credential too.
      await this.offlineUnlock.cacheCredentials(username ?? '', newPassword ?? '');
      this.changeSuccess.set(true);
      setTimeout(() => void this.router.navigateByUrl('/weightscale'), 900);
    } catch (err) {
      const serverMessage = (err as { error?: { status?: { userMessage?: string; message?: string } } })?.error?.status;
      this.errorMessage.set(serverMessage?.userMessage ?? serverMessage?.message ?? 'Could not change the password.');
    } finally {
      this.isLoggingIn.set(false);
    }
  }

  private async unlockOffline(username: string, password: string): Promise<void> {
    const result = await this.offlineUnlock.tryUnlock(username, password);
    if (result.ok) {
      // Brief confirmation so the operator knows they are in capture-only mode.
      this.offlineUnlocked.set(true);
      setTimeout(() => void this.router.navigateByUrl('/weightscale'), 900);
    } else {
      this.errorMessage.set(UNLOCK_MESSAGES[result.error ?? 'NOT_AVAILABLE']);
    }
  }
}
