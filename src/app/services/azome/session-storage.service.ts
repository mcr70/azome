import { Injectable } from '@angular/core';

/**
 * Simple wrapper around the browser's `sessionStorage`.
 * It stores only plain strings and never holds sensitive data.
 */
@Injectable({
  providedIn: 'root',
})
export class SessionStorageService {
  /**
   * Returns the stored string for the given key, or `null` if missing.
   *
   * @param key Storage key.
   * @returns Stored value, or `null` when missing or storage is unavailable.
   */
  getItem(key: string): string | null {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      // Session storage may be disabled – fall back to `null`.
      return null;
    }
  }

  /**
   * Stores the string value for the given key.
   *
   * @param key Storage key.
   * @param value Value to store.
   */
  setItem(key: string, value: string): void {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      // Silently ignore write failures (e.g., private-browsing mode).
    }
  }

  /**
   * Removes a key from session storage.
   *
   * @param key Storage key.
   */
  removeItem(key: string): void {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}