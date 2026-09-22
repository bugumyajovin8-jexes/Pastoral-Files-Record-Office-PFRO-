/**
 * The "Install" button, the dismissible banner that carries it, and the
 * step-by-step sheet for browsers that cannot install in one tap.
 *
 * KEEP IN STEP: identical copies live at
 *   Pastor/src/components/InstallPrompt.tsx
 *   Congregant/src/components/InstallPrompt.tsx
 * Each app passes its own `theme`; nothing in here is app-specific.
 *
 * What a tap does depends on the browser — see src/lib/install.ts for why:
 *   Android Chrome / Edge / Samsung, desktop Chrome / Edge
 *        -> the browser's own install dialog, straight away.
 *   iPhone and iPad, any browser
 *        -> Share -> Add to Home Screen, illustrated. Apple allows nothing else.
 *   WhatsApp / Facebook / Instagram built-in browsers
 *        -> open in a real browser first (one tap into Chrome on Android).
 *   Firefox and other Android browsers
 *        -> the browser menu's own Install entry.
 *
 * Nothing renders when the app is already running from the home screen, or in
 * the native Android build.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Share, EllipsisVertical, Ellipsis, SquarePlus, X, Copy, Check,
  ExternalLink, Download, Compass,
} from 'lucide-react';
import {
  InstallMode, getMode, subscribe, promptInstall, waitForPrompt,
  browserSupportsPrompt, wasInstalledHere, isBannerDismissed, dismissBanner,
  isAndroid, iosBrowser, iosBrowserCanInstall, androidBrowser,
  inAppBrowserName, chromeIntentUrl, isMacSafari, isDesktopFirefox,
} from '../lib/install';

export interface InstallTheme {
  /** Fill of the Install button. */
  accent: string;
  /** Label on that fill. */
  onAccent: string;
  /** Banner and sheet background. */
  surface: string;
  text: string;
  muted: string;
  border: string;
  /** Faint accent wash for the step numbers. */
  tint: string;
}

interface CommonProps {
  /** As it should appear on the home screen, e.g. "Neno & Zaka". */
  appName: string;
  theme: InstallTheme;
}

// ----------------------------------------------------------------------------
// State
// ----------------------------------------------------------------------------

function useInstallMode(): InstallMode {
  const [mode, setMode] = useState<InstallMode>(getMode);
  useEffect(() => {
    const update = () => setMode(getMode());
    const off = subscribe(update);
    // Catches the switch into standalone when a desktop install opens the app.
    const mq = window.matchMedia?.('(display-mode: standalone)');
    mq?.addEventListener?.('change', update);
    update();
    return () => { off(); mq?.removeEventListener?.('change', update); };
  }, []);
  return mode;
}

function useInstaller() {
  const mode = useInstallMode();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const install = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Where the browser can raise its own dialog, use it. A tap in the first
      // second after load may beat the browser's decision, so wait briefly —
      // but only on browsers that will ever decide.
      const ready = mode === 'prompt' ||
        (mode !== 'in-app' && browserSupportsPrompt() && await waitForPrompt(1500));
      if (ready) {
        const outcome = await promptInstall();
        if (outcome !== 'unavailable') return;
      }
      setSheetOpen(true);
    } finally {
      setBusy(false);
    }
  };

  return { mode, install, busy, sheetOpen, closeSheet: () => setSheetOpen(false) };
}

// ----------------------------------------------------------------------------
// The button
// ----------------------------------------------------------------------------

function InstallAction({ theme, onClick, busy, compact }: {
  theme: InstallTheme; onClick: () => void; busy: boolean; compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        minHeight: compact ? 36 : 48, padding: compact ? '0 14px' : '0 20px',
        borderRadius: 999, border: 'none', cursor: busy ? 'wait' : 'pointer',
        background: theme.accent, color: theme.onAccent,
        fontWeight: 800, fontSize: compact ? 13 : 15, letterSpacing: '0.01em',
        fontFamily: 'inherit', flexShrink: 0, opacity: busy ? 0.7 : 1,
        boxShadow: '0 2px 10px rgb(0 0 0 / 0.12)',
      }}
    >
      <Download size={compact ? 15 : 17} strokeWidth={2.6} />
      Install
    </button>
  );
}

/**
 * False once the app is running installed, so a host can hide the card or row
 * it wraps InstallButton in, not just the button.
 */
export function useInstallAvailable(): boolean {
  return useInstallMode() !== 'installed';
}

/**
 * The permanent entry — for a profile or settings screen, so the app can still
 * be installed after the banner has been dismissed.
 */
export function InstallButton({ appName, theme }: CommonProps) {
  const { mode, install, busy, sheetOpen, closeSheet } = useInstaller();
  if (mode === 'installed') return null;
  return (
    <>
      <InstallAction theme={theme} onClick={install} busy={busy} />
      {sheetOpen && <InstallSheet mode={mode} appName={appName} theme={theme} onClose={closeSheet} />}
    </>
  );
}

/**
 * A slim bar for the top of the app. Shown in a browser tab only, until
 * installed or dismissed; dismissal lasts two weeks.
 */
export function InstallBanner({ appName, theme, iconSrc, subtitle }: CommonProps & {
  /** The app's own icon, so it is clear what is being installed. */
  iconSrc?: string;
  subtitle?: string;
}) {
  const { mode, install, busy, sheetOpen, closeSheet } = useInstaller();
  const [dismissed, setDismissed] = useState(() => isBannerDismissed() || wasInstalledHere());

  // Desktop browsers without a dialog (Safari on Mac, Firefox) would only get a
  // banner leading to "not supported here". The phone is what matters; the
  // permanent button still covers desktop.
  if (mode === 'installed' || mode === 'desktop' || dismissed) return null;

  return (
    <>
      <div
        role="region"
        aria-label={`Sakinisha ${appName}`}
        style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 8px 8px 12px', background: theme.surface,
          borderBottom: `1px solid ${theme.border}`, color: theme.text,
        }}
      >
        {iconSrc && (
          <img src={iconSrc} alt="" width={36} height={36}
            style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* The title wraps rather than truncating: on a 360px phone the cut
              fell on "kwenye simu", which is the whole message. Two lines at most. */}
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, lineHeight: 1.25,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {mode === 'in-app' ? `Pakua ${appName}` : `Weka ${appName} kwenye simu`}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12, lineHeight: 1.3, color: theme.muted,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {mode === 'in-app'
              ? `Fungua kwenye kivinjari kwanza`
              : subtitle || 'Ifungue kwa mguso mmoja kutoka skrini ya nyumbani'}
          </p>
        </div>
        <InstallAction theme={theme} onClick={install} busy={busy} compact />
        <button
          type="button"
          aria-label="Funga"
          onClick={() => { dismissBanner(); setDismissed(true); }}
          style={{
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', color: theme.muted, cursor: 'pointer',
            borderRadius: 999, flexShrink: 0,
          }}
        >
          <X size={18} />
        </button>
      </div>
      {sheetOpen && <InstallSheet mode={mode} appName={appName} theme={theme} onClose={closeSheet} />}
    </>
  );
}

// ----------------------------------------------------------------------------
// The instructions
// ----------------------------------------------------------------------------

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <strong style={{ fontWeight: 800 }}>{children}</strong>
);

const Glyph = ({ icon: Icon }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }> }) => (
  <Icon size={16} strokeWidth={2.4} style={{ display: 'inline-block', verticalAlign: '-3px', margin: '0 2px' }} />
);

interface StepItem { title: React.ReactNode; detail?: React.ReactNode }

function Steps({ steps, theme }: { steps: StepItem[]; theme: InstallTheme }) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {steps.map((s, i) => (
        <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{
            width: 28, height: 28, borderRadius: 999, flexShrink: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14,
            background: theme.tint, color: theme.text,
          }}>{i + 1}</span>
          <div style={{ paddingTop: 3, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.4, color: theme.text }}>{s.title}</p>
            {s.detail && (
              <p style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.45, color: theme.muted }}>{s.detail}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function CopyLinkButton({ theme }: { theme: InstallTheme }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older WebViews without the async clipboard.
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* nothing more to try */ }
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <button type="button" onClick={copy} style={secondaryButton(theme)}>
      {copied ? <Check size={16} /> : <Copy size={16} />}
      {copied ? 'Kiungo kimenakiliwa' : 'Nakili kiungo'}
    </button>
  );
}

const secondaryButton = (theme: InstallTheme): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  width: '100%', minHeight: 48, borderRadius: 14, cursor: 'pointer',
  background: 'transparent', color: theme.text, border: `1px solid ${theme.border}`,
  fontWeight: 700, fontSize: 14, fontFamily: 'inherit', textDecoration: 'none',
});

const primaryLink = (theme: InstallTheme): React.CSSProperties => ({
  ...secondaryButton(theme),
  background: theme.accent, color: theme.onAccent, border: 'none', fontWeight: 800,
});

function sheetContent(mode: InstallMode, appName: string, theme: InstallTheme): {
  title: string; intro?: React.ReactNode; steps?: StepItem[]; note?: React.ReactNode; actions?: React.ReactNode;
} {
  // --- Social apps' built-in browsers -------------------------------------
  if (mode === 'in-app') {
    const name = inAppBrowserName() || 'programu hii';
    if (isAndroid()) {
      return {
        title: 'Fungua kwenye Chrome',
        intro: <>Ndani ya {name}, {appName} haiwezi kusakinishwa. Ifungue kwenye Chrome, kisha bonyeza <Kbd>Install</Kbd> tena.</>,
        actions: (
          <>
            <a href={chromeIntentUrl()} style={primaryLink(theme)}>
              <ExternalLink size={16} /> Fungua kwenye Chrome
            </a>
            <CopyLinkButton theme={theme} />
          </>
        ),
        note: <>Au bonyeza <Glyph icon={EllipsisVertical} /> juu kulia, kisha <Kbd>Open in browser</Kbd>.</>,
      };
    }
    return {
      title: 'Fungua kwenye Safari',
      intro: <>Ndani ya {name}, {appName} haiwezi kuwekwa kwenye skrini ya nyumbani.</>,
      steps: [
        { title: <>Bonyeza <Glyph icon={Ellipsis} /> au <Glyph icon={Share} /> kwenye kona ya skrini</> },
        { title: <>Chagua <Kbd>Open in Safari</Kbd></>, detail: <>Au <Kbd>Open in Browser</Kbd>.</> },
        { title: <>Kwenye Safari, bonyeza <Kbd>Install</Kbd> tena</> },
      ],
      actions: <CopyLinkButton theme={theme} />,
    };
  }

  // --- iPhone and iPad ---------------------------------------------------
  if (mode === 'ios') {
    if (!iosBrowserCanInstall()) {
      return {
        title: 'Fungua kwenye Safari',
        intro: <>Kivinjari hiki hakiwezi kuweka programu kwenye skrini ya nyumbani kwa toleo hili la iOS. Fungua ukurasa huu kwenye <Kbd>Safari</Kbd>, kisha bonyeza <Kbd>Install</Kbd> tena.</>,
        actions: <CopyLinkButton theme={theme} />,
      };
    }
    const browser = iosBrowser();
    const shareWhere =
      browser === 'safari' ? <>Kiko chini ya skrini. Kwenye iPhone mpya, bonyeza <Glyph icon={Ellipsis} /> kwanza.</> :
      browser === 'chrome' ? <>Kiko juu kulia, kwenye upau wa anwani.</> :
      <>Kiko kwenye upau wa anwani au kwenye menyu <Glyph icon={Ellipsis} />.</>;
    return {
      title: `Sakinisha ${appName}`,
      intro: 'iPhone inahitaji hatua tatu fupi:',
      steps: [
        { title: <>Bonyeza <Kbd>Share</Kbd> <Glyph icon={Share} /></>, detail: shareWhere },
        { title: <>Chagua <Kbd>Add to Home Screen</Kbd> <Glyph icon={SquarePlus} /></>,
          detail: <>Shuka chini kwenye orodha. Kama hukioni, bonyeza <Kbd>View More</Kbd>.</> },
        { title: <>Bonyeza <Kbd>Add</Kbd> juu kulia</>,
          detail: <>{appName} itaonekana kwenye skrini ya nyumbani kama programu nyingine.</> },
      ],
      note: browser === 'safari'
        ? <>Umefungua kiungo kutoka WhatsApp? Bonyeza alama ya Safari <Glyph icon={Compass} /> kwanza.</>
        : undefined,
    };
  }

  // --- Android without the dialog -----------------------------------------
  if (mode === 'android' || (mode === 'prompt' && isAndroid())) {
    const browser = androidBrowser();
    const menuWhere =
      browser === 'samsung' ? 'Chini kulia (mistari mitatu).' :
      browser === 'edge' ? <>Chini katikati <Glyph icon={Ellipsis} />.</> :
      browser === 'firefox' ? 'Juu kulia au chini kulia.' :
      'Juu kulia.';
    const canOfferChrome = browser === 'firefox' || browser === 'opera' || browser === 'other';
    return {
      title: `Sakinisha ${appName}`,
      steps: [
        { title: <>Bonyeza menyu <Glyph icon={EllipsisVertical} /></>, detail: menuWhere },
        { title: <>Chagua <Kbd>Install app</Kbd> au <Kbd>Add to Home screen</Kbd></>,
          detail: <>Kwa Kiswahili: <Kbd>Sakinisha programu</Kbd> au <Kbd>Ongeza kwenye skrini ya kwanza</Kbd>.</> },
        { title: <>Thibitisha kwa kubonyeza <Kbd>Install</Kbd></> },
      ],
      actions: canOfferChrome ? (
        <a href={chromeIntentUrl()} style={secondaryButton(theme)}>
          <ExternalLink size={16} /> Au fungua kwenye Chrome
        </a>
      ) : undefined,
      note: <>Kama tayari umeisakinisha, ifungue kutoka skrini ya nyumbani.</>,
    };
  }

  // --- Desktop without the dialog -----------------------------------------
  if (isMacSafari()) {
    return {
      title: `Sakinisha ${appName}`,
      steps: [
        { title: <>Fungua menyu ya <Kbd>File</Kbd> juu ya skrini</> },
        { title: <>Chagua <Kbd>Add to Dock</Kbd></> },
        { title: <>Bonyeza <Kbd>Add</Kbd></> },
      ],
    };
  }
  if (isDesktopFirefox()) {
    return {
      title: 'Tumia Chrome au Edge',
      intro: <>Firefox kwenye kompyuta haiwezi kusakinisha programu za wavuti. Fungua ukurasa huu kwenye <Kbd>Chrome</Kbd> au <Kbd>Edge</Kbd>.</>,
      actions: <CopyLinkButton theme={theme} />,
    };
  }
  return {
    title: `Sakinisha ${appName}`,
    steps: [
      { title: <>Bonyeza alama ya kusakinisha <Glyph icon={Download} /> upande wa kulia wa upau wa anwani</>,
        detail: <>Au menyu <Glyph icon={EllipsisVertical} /> kisha <Kbd>Install</Kbd>.</> },
      { title: <>Thibitisha kwa kubonyeza <Kbd>Install</Kbd></> },
    ],
  };
}

function InstallSheet({ mode, appName, theme, onClose }: {
  mode: InstallMode; appName: string; theme: InstallTheme; onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { title, intro, steps, note, actions } = sheetContent(mode, appName, theme);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-end',
        justifyContent: 'center', background: 'rgb(0 0 0 / 0.5)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-sheet-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, maxHeight: '88%', overflowY: 'auto',
          background: theme.surface, color: theme.text,
          borderRadius: '22px 22px 0 0', boxShadow: '0 -8px 30px rgb(0 0 0 / 0.25)',
          padding: '18px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 id="install-sheet-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, lineHeight: 1.3 }}>
            {title}
          </h2>
          <button ref={closeRef} type="button" aria-label="Funga" onClick={onClose}
            style={{
              width: 40, height: 40, borderRadius: 999, border: 'none', cursor: 'pointer',
              background: theme.tint, color: theme.text, display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
            <X size={18} />
          </button>
        </div>

        {intro && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: theme.muted }}>{intro}</p>}
        {steps && <Steps steps={steps} theme={theme} />}
        {actions && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{actions}</div>}
        {note && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: theme.muted }}>{note}</p>}

        <button type="button" onClick={onClose} style={secondaryButton(theme)}>Nimeelewa</button>
      </div>
    </div>
  );
}
