import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Lock, ArrowLeft } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';

/**
 * Wraps a route that exists only to write something.
 *
 * When the licence has lapsed the app is read-only, and every write is already
 * refused twice over — by the guard in lib/supabase.ts and by RLS in the
 * database. This stops the user reaching a form they cannot submit: filling one
 * in and being told at the last step is a worse experience than being told
 * before starting, and it is the difference between "the app is frozen" and
 * "the app is broken".
 *
 * Read-only routes are NOT wrapped. The dashboard, member list, finances and
 * reports all stay fully available — the church keeps its own records.
 */
export default function WriteRoute({ children }: { children: ReactNode }) {
  const { isReadOnly } = useAuth() as any;

  if (!isReadOnly) return <>{children}</>;

  return (
    <div className="p-6 flex flex-col items-center text-center" style={{ paddingTop: 48 }}>
      <div
        style={{
          width: 68,
          height: 68,
          borderRadius: 22,
          background: 'color-mix(in srgb, var(--color-rose) 12%, transparent)',
          border: '2px solid color-mix(in srgb, var(--color-rose) 25%, transparent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20
        }}
      >
        <Lock size={30} style={{ color: 'var(--color-rose)' }} />
      </div>

      <h1
        style={{
          fontFamily: 'Sora, sans-serif',
          fontWeight: 800,
          fontSize: 19,
          color: 'var(--color-text)',
          margin: '0 0 10px'
        }}
      >
        Muda wa matumizi umeisha
      </h1>

      <p
        style={{
          fontFamily: 'Sora, sans-serif',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--color-text-dim)',
          lineHeight: 1.6,
          margin: '0 0 24px',
          maxWidth: 320
        }}
      >
        Huwezi kuongeza wala kubadilisha taarifa kwa sasa. Taarifa zote zilizopo
        bado unaweza kuziona. Wasiliana na{' '}
        <strong style={{ fontWeight: 700, color: 'var(--color-text)' }}>Venics Software Company</strong>{' '}
        ili kuhuisha leseni ya kanisa lako.
      </p>

      <Link
        to="/"
        className="flex items-center justify-center gap-2 p-3.5 rounded-xl text-xs font-extrabold uppercase tracking-wider"
        style={{
          color: 'var(--color-text)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          minWidth: 200
        }}
      >
        <ArrowLeft size={14} /> Rudi Kwenye Dashibodi
      </Link>
    </div>
  );
}
