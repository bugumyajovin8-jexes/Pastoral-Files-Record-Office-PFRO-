import type { InstallTheme } from '../components/InstallPrompt';

/**
 * The shared install UI in this app's teal. `--color-on-accent` on
 * `--color-teal` is 8.55:1, and every value follows the light/dark switch.
 */
export const INSTALL_THEME: InstallTheme = {
  accent: 'var(--color-teal)',
  onAccent: 'var(--color-on-accent)',
  surface: 'var(--color-surface)',
  text: 'var(--color-text)',
  muted: 'var(--color-text-muted)',
  border: 'var(--color-border)',
  tint: 'color-mix(in srgb, var(--color-teal) 14%, transparent)',
};

export const APP_NAME = 'PFRO';
