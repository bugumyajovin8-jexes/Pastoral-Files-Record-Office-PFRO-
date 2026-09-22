/**
 * Installing the web app: what this browser allows, and the one-tap path where
 * one exists.
 *
 * KEEP IN STEP: identical copies live at
 *   Pastor/src/lib/install.ts
 *   Congregant/src/lib/install.ts
 *
 * THE PLATFORM LIMIT
 * ------------------
 * A web page can raise the install dialog itself only where the browser fires
 * `beforeinstallprompt`: Chrome, Edge and Samsung Internet on Android, and
 * Chrome and Edge on desktop. There the Install button is genuinely one tap —
 * the browser's own confirmation follows, which no site can skip.
 *
 * iOS has no such event, in Safari or in any other iOS browser (they all run on
 * Apple's WebKit). Apple does not let a page add itself to the Home Screen; the
 * person has to do it from the Share menu. So on an iPhone the same button opens
 * three illustrated steps instead. That is the most any website can do there.
 *
 * Firefox on Android, and the browsers built into WhatsApp, Facebook and
 * Instagram, likewise have no event. Those get instructions — and on Android, a
 * one-tap "open in Chrome" — rather than a button that silently does nothing.
 */

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type InstallMode =
  | 'prompt'     // the browser will show its own install dialog: one tap
  | 'ios'        // any iOS browser: Share -> Add to Home Screen
  | 'in-app'     // a social app's built-in browser: open in a real one first
  | 'android'    // an Android browser that has not offered (or cannot offer) the dialog
  | 'desktop'    // a desktop browser without the dialog (Safari on Mac, Firefox)
  | 'installed'; // already running as an installed app, or the native Android build

const INSTALLED_KEY = 'pwa-installed';
const DISMISSED_KEY = 'pwa-install-dismissed-until';

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

// Registered when this module is first imported — main.tsx imports it before
// React renders — because Chrome can fire `beforeinstallprompt` within moments
// of load. A listener added later from a component would miss it, and the
// Install button would fall back to instructions on a phone that could have
// installed in one tap.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Stops Chrome's own mini-infobar. Our button raises the same dialog.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    try { localStorage.setItem(INSTALLED_KEY, '1'); } catch { /* private mode */ }
    notify();
  });
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const ua = (): string => (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');

/** The Capacitor Android build. It is already an installed app. */
export function isNative(): boolean {
  const cap = (window as any).Capacitor;
  return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

/** Launched from the home screen rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if ((navigator as any).standalone === true) return true; // iOS
  return ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']
    .some((m) => window.matchMedia?.(`(display-mode: ${m})`).matches);
}

export function isIOS(): boolean {
  const u = ua();
  // iPadOS 13+ identifies as a Mac; only the touch screen gives it away.
  return /iPad|iPhone|iPod/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1);
}

export function isAndroid(): boolean {
  return /Android/i.test(ua());
}

/** [major, minor], or null when the version cannot be read. */
export function iosVersion(): [number, number] | null {
  const u = ua();
  const m = u.match(/OS (\d+)_(\d+)/) || u.match(/Version\/(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export type IOSBrowser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'other';

export function iosBrowser(): IOSBrowser {
  const u = ua();
  if (/CriOS/.test(u)) return 'chrome';
  if (/EdgiOS/.test(u)) return 'edge';
  if (/FxiOS/.test(u)) return 'firefox';
  if (/OPiOS|OPT\/|YaBrowser|DuckDuckGo/.test(u)) return 'other';
  return 'safari';
}

/** Other iOS browsers gained "Add to Home Screen" in iOS 16.4. */
export function iosBrowserCanInstall(): boolean {
  if (iosBrowser() === 'safari') return true;
  const v = iosVersion();
  return !v || v[0] > 16 || (v[0] === 16 && v[1] >= 4);
}

export type AndroidBrowser = 'chrome' | 'samsung' | 'edge' | 'firefox' | 'opera' | 'other';

export function androidBrowser(): AndroidBrowser {
  const u = ua();
  if (/SamsungBrowser/.test(u)) return 'samsung';
  if (/EdgA/.test(u)) return 'edge';
  if (/Firefox/.test(u)) return 'firefox';
  if (/OPR\/|Opera/.test(u)) return 'opera';
  if (/Chrome\//.test(u)) return 'chrome';
  return 'other';
}

/**
 * The social app whose built-in browser this is, or null. Links are mostly
 * shared over WhatsApp, and none of these browsers can install a web app —
 * worth naming, so the person knows why and what to do.
 */
export function inAppBrowserName(): string | null {
  const u = ua();
  if (/WhatsApp/i.test(u)) return 'WhatsApp';
  if (/FBAN|FBAV|FB_IAB|FBIOS/.test(u)) return 'Facebook';
  if (/Instagram/i.test(u)) return 'Instagram';
  if (/Line\//.test(u)) return 'LINE';
  if (/TikTok|musical_ly|BytedanceWebview/i.test(u)) return 'TikTok';
  if (/Snapchat/i.test(u)) return 'Snapchat';
  if (/Twitter/i.test(u)) return 'X';
  // A bare Android WebView inside some other app. Checked after isNative(),
  // since the Capacitor build is also a WebView.
  if (isAndroid() && /; wv\)/.test(u)) return 'programu hii';
  return null;
}

/**
 * Whether this browser ever fires `beforeinstallprompt`. Only these are worth
 * waiting on after a tap; for the rest the instructions open at once.
 */
export function browserSupportsPrompt(): boolean {
  if (isIOS()) return false;
  if (isAndroid()) return ['chrome', 'samsung', 'edge'].includes(androidBrowser());
  return /Chrome\/|Edg\//.test(ua()) && !/OPR\//.test(ua());
}

/** Safari on a Mac, which installs from File > Add to Dock (Safari 17+). */
export function isMacSafari(): boolean {
  const u = ua();
  return !isIOS() && /Macintosh/.test(u) && /Safari\//.test(u) && !/Chrome\/|Chromium|Edg\//.test(u);
}

export function isDesktopFirefox(): boolean {
  return !isAndroid() && !isIOS() && /Firefox\//.test(ua());
}

export function getMode(): InstallMode {
  if (typeof window === 'undefined') return 'installed';
  if (isNative() || isStandalone()) return 'installed';
  if (inAppBrowserName()) return 'in-app';
  if (deferred) return 'prompt';
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  return 'desktop';
}

/**
 * Raises the browser's own install dialog. Each captured event can be used
 * exactly once; if it is declined, the browser offers a fresh one on a later
 * visit, and until then the button falls back to instructions.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferred;
  if (!e) return 'unavailable';
  deferred = null;
  notify();
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === 'accepted') {
    try { localStorage.setItem(INSTALLED_KEY, '1'); } catch { /* private mode */ }
  }
  return outcome;
}

/**
 * Chrome decides a page is installable a moment after load. A tap that lands
 * in that gap waits briefly rather than dropping straight to instructions.
 * Short enough to stay inside the tap's user-activation window, which the
 * dialog requires.
 */
export function waitForPrompt(ms: number): Promise<boolean> {
  if (deferred) return Promise.resolve(true);
  return new Promise((resolve) => {
    const off = subscribe(() => {
      if (deferred) { clearTimeout(timer); off(); resolve(true); }
    });
    const timer = setTimeout(() => { off(); resolve(false); }, ms);
  });
}

/** Installed from this browser before — the banner should not nag. */
export function wasInstalledHere(): boolean {
  try { return localStorage.getItem(INSTALLED_KEY) === '1'; } catch { return false; }
}

export function isBannerDismissed(): boolean {
  try {
    const until = Number(localStorage.getItem(DISMISSED_KEY) || 0);
    return until > Date.now();
  } catch { return false; }
}

/** Hides the banner for a while. The permanent Install button still works. */
export function dismissBanner(days = 14): void {
  try { localStorage.setItem(DISMISSED_KEY, String(Date.now() + days * 86_400_000)); } catch { /* private mode */ }
}

/**
 * An Android link that reopens this page in Chrome, where it can install.
 * Falls back to the same URL in whatever browser handles it if Chrome is absent.
 */
export function chromeIntentUrl(): string {
  const { host, pathname, search, protocol, href } = window.location;
  const scheme = protocol.replace(':', '');
  return `intent://${host}${pathname}${search}#Intent;scheme=${scheme};package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(href)};end`;
}
