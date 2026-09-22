import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { InstallBanner } from './InstallPrompt';
import { INSTALL_THEME, APP_NAME } from '../lib/installTheme';
import { useAuth } from '../features/auth/AuthContext';
import { Home, Users, BarChart3, User, Plus, WifiOff, CloudLightning, Lock, RefreshCw, AlertTriangle, LogOut, Shield } from 'lucide-react';
import { supabase, getRejectedSyncItems, clearRejectedSyncItems, LICENCE_READ_ONLY_MESSAGE } from '../lib/supabase';

export default function Layout() {
  const { user, profile, selectedChurchId, setSelectedChurchId, licenses, refreshProfile, licenceState, isReadOnly, blockedChurchIds, profileError } = useAuth() as any;
  const location = useLocation();
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [userChurches, setUserChurches] = useState<any[]>([]);

  useEffect(() => {
    const handleConnectivity = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleConnectivity);
    window.addEventListener('offline', handleConnectivity);

    const updateQueueCount = () => {
      try {
        const q = JSON.parse(localStorage.getItem('supabase_offline_sync_queue') || '[]');
        setPendingCount(Array.isArray(q) ? q.length : 0);
      } catch { setPendingCount(0); }
      setRejectedCount(getRejectedSyncItems().length);
    };
    updateQueueCount();
    window.addEventListener('supabase-offline-activity', updateQueueCount);
    window.addEventListener('supabase-sync-complete', updateQueueCount);
    const id = setInterval(updateQueueCount, 4000);
    return () => {
      window.removeEventListener('online', handleConnectivity);
      window.removeEventListener('offline', handleConnectivity);
      window.removeEventListener('supabase-offline-activity', updateQueueCount);
      window.removeEventListener('supabase-sync-complete', updateQueueCount);
      clearInterval(id);
    };
  }, []);

  // Licence handling. `licenceState` and `isReadOnly` are computed once in
  // AuthContext so this banner, the disabled controls below and the write guard
  // in lib/supabase.ts can never disagree.
  //
  //   expired    READ-ONLY. Records stay on screen; every write is refused,
  //              here and in the database. Hiding a church's own history
  //              behind a paywall reads as data loss and costs support calls —
  //              withholding the ability to *add* is leverage enough.
  //   suspended  Full lockout, unchanged. That is a deliberate act by the
  //              provider rather than a lapsed payment, so it stays harsher.
  const isProfilePage = location.pathname === '/profile';

  const activeLicence = selectedChurchId
    ? licenses.find((l: any) => l.church_id === selectedChurchId)
    : null;
  const blockedChurchName = activeLicence?.church_name || 'Kanisa Lako';

  let expiryDateString = '';
  if (activeLicence?.expires_at) {
    try {
      expiryDateString = new Date(activeLicence.expires_at).toLocaleDateString('sw-TZ', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      expiryDateString = activeLicence.expires_at;
    }
  }

  // Both already account for superadmins, who are never restricted.
  const isBlocked = isReadOnly && licenceState === 'suspended';
  const showReadOnly = isReadOnly && licenceState === 'expired';

  // A pastor may lead several churches, and licences lapse one at a time. The
  // lock above is per-church — it follows `selectedChurchId`, and the database
  // agrees, because church_licence_active(church_id) is evaluated per row.
  //
  // So one dead licence must not strand the others. Without a way to change
  // church from inside the read-only state, a pastor whose *default* church had
  // lapsed was frozen out of the ones still paid for: the only switcher in the
  // app was on the suspended lockout screen, which this state never reaches.
  const licenceOk = (churchId: string) => {
    const l = licenses.find((x: any) => x.church_id === churchId);
    if (!l || l.status === 'suspended') return false;
    return typeof l.is_active === 'boolean'
      ? l.is_active
      : !(l.status === 'expired' || (l.expires_at && new Date(l.expires_at) < new Date()));
  };

  const workingChurches = userChurches.filter((c: any) => licenceOk(c.id));

  // Some churches frozen, others fine — the normal case for a pastor who leads
  // several. This is NOT a lockout: the app stays fully usable for the churches
  // that are paid up, so it is a notice, not a barrier.
  const frozenChurches = userChurches.filter((c: any) => !licenceOk(c.id));
  const showPartialNotice = !isReadOnly && !isBlocked && frozenChurches.length > 0;

  // Fetch church list for the switcher offered on the blocked/read-only screens
  useEffect(() => {
    if ((isBlocked || showReadOnly || blockedChurchIds?.length) && profile?.church_ids?.length) {
      const fetchUChurches = async () => {
        const { data } = await supabase.from('churches').select('id, name');
        if (data) {
          setUserChurches(data.filter((c: any) => profile.church_ids.includes(c.id)));
        }
      };
      fetchUChurches();
    }
  }, [isBlocked, profile, selectedChurchId]);

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    navigate('/login');
  };

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <div className="min-h-screen flex justify-center font-sans" style={{background: 'var(--color-ink)'}}>
      <div className="w-full max-w-[430px] relative flex flex-col h-[100dvh] overflow-hidden" style={{background: 'var(--color-ink)'}}>

        {/* One-tap install in a browser tab; nothing once installed or dismissed. */}
        <InstallBanner appName={APP_NAME} theme={INSTALL_THEME} iconSrc="/icons/icon-192.png"
          subtitle="Ifungue moja kwa moja kutoka skrini ya nyumbani" />

        {/* Connectivity banner */}
        {!isOnline ? (
          <div className="shrink-0 bg-[#F5A623]/10 border-b border-[#F5A623]/20 text-[var(--color-gold-on)] text-[11px] font-bold px-4 py-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5"><WifiOff size={13} /> Nje ya Mtandao</span>
            {pendingCount > 0 && (
              <span className="bg-[#F5A623]/20 px-2 py-0.5 rounded-full text-[12px]">{pendingCount} kusawazishwa</span>
            )}
          </div>
        ) : pendingCount > 0 ? (
          <div className="shrink-0 bg-[#00C9A7]/10 border-b border-[#00C9A7]/20 text-[var(--color-teal-on)] text-[11px] font-bold px-4 py-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5"><CloudLightning size={13} className="animate-pulse" /> Inasawazisha...</span>
            <span className="bg-[#00C9A7]/20 px-2 py-0.5 rounded-full text-[12px]">{pendingCount} imesalia</span>
          </div>
        ) : null}

        {/* Writes the server refused. Without this they would fail silently. */}
        {rejectedCount > 0 && (
          <div className="shrink-0 bg-[#FF6B8A]/10 border-b border-[#FF6B8A]/20 text-[var(--color-rose-on)] text-[11px] font-bold px-4 py-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <AlertTriangle size={13} /> {rejectedCount} kumbukumbu hazikupokelewa na seva
            </span>
            <button
              onClick={() => {
                if (window.confirm('Ondoa kumbukumbu hizi kwenye orodha ya makosa? Hazitatumwa tena.')) {
                  clearRejectedSyncItems();
                  setRejectedCount(0);
                }
              }}
              className="bg-[#FF6B8A]/20 px-2 py-0.5 rounded-full text-[12px] shrink-0 cursor-pointer"
            >
              Ondoa
            </button>
          </div>
        )}

        {/* The account has no saved profile row. Everything downstream — the
            role, church access, every write — depends on it, so this must not
            be a console-only failure the user discovers days later. */}
        {profileError && (
          <div
            role="alert"
            className="shrink-0 border-b px-4 py-2.5 flex items-start gap-2.5"
            style={{
              background: 'color-mix(in srgb, var(--color-rose) 14%, transparent)',
              borderColor: 'color-mix(in srgb, var(--color-rose) 30%, transparent)'
            }}
          >
            <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--color-rose)' }} />
            <div className="min-w-0">
              <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 13, fontWeight: 800, color: 'var(--color-rose-on)', margin: 0, lineHeight: 1.3 }}>
                Wasifu wako haujahifadhiwa
              </p>
              <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 11.5, fontWeight: 500, color: 'var(--color-text-dim)', margin: '3px 0 0', lineHeight: 1.45 }}>
                Akaunti imeundwa lakini taarifa zako hazikuhifadhiwa kwenye mfumo, hivyo huwezi kuongeza kanisa
                wala kumbukumbu. Wasiliana na msimamizi. ({profileError})
              </p>
            </div>
          </div>
        )}

        {/* Some churches frozen, the rest working normally. */}
        {showPartialNotice && (
          <div
            role="status"
            className="shrink-0 border-b px-4 py-2.5 flex items-start gap-2.5"
            style={{
              background: 'color-mix(in srgb, var(--color-gold) 12%, transparent)',
              borderColor: 'color-mix(in srgb, var(--color-gold) 25%, transparent)'
            }}
          >
            <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--color-gold)' }} />
            <div className="min-w-0">
              <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 13, fontWeight: 800, color: 'var(--color-gold-on)', margin: 0, lineHeight: 1.3 }}>
                {frozenChurches.length === 1 ? 'Kanisa moja halina leseni' : `Makanisa ${frozenChurches.length} hayana leseni`}
              </p>
              <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 11.5, fontWeight: 500, color: 'var(--color-text-dim)', margin: '3px 0 0', lineHeight: 1.45 }}>
                {frozenChurches.map((c: any) => c.name).join(', ')} — huwezi kuongeza wala kubadilisha taarifa
                za {frozenChurches.length === 1 ? 'kanisa hili' : 'makanisa haya'}. Makanisa yako mengine
                {' '}{workingChurches.length} yanaendelea kufanya kazi kama kawaida. Wasiliana na{' '}
                <strong style={{ fontWeight: 700, color: 'var(--color-text)' }}>Venics Software Company</strong> kuhuisha leseni.
              </p>
            </div>
          </div>
        )}

        {/* Licence lapsed — the app is readable but frozen. */}
        {showReadOnly && (
          <div
            role="status"
            className="shrink-0 border-b px-4 py-2.5 flex items-start gap-2.5"
            style={{
              background: 'color-mix(in srgb, var(--color-rose) 12%, transparent)',
              borderColor: 'color-mix(in srgb, var(--color-rose) 25%, transparent)'
            }}
          >
            <Lock size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--color-rose)' }} />
            <div className="min-w-0">
              <p style={{
                fontFamily: 'Sora, sans-serif',
                fontSize: 13,
                fontWeight: 800,
                color: 'var(--color-rose-on)',
                margin: 0,
                lineHeight: 1.3
              }}>
                Muda wa matumizi umeisha — {blockedChurchName}
              </p>
              <p style={{
                fontFamily: 'Sora, sans-serif',
                fontSize: 11.5,
                fontWeight: 500,
                color: 'var(--color-text-dim)',
                margin: '3px 0 0',
                lineHeight: 1.45
              }}>
                Unaweza kusoma taarifa zilizopo, lakini huwezi kuongeza wala kubadilisha chochote
                {expiryDateString ? ` (ilikoma tarehe ${expiryDateString})` : ''}. Wasiliana na{' '}
                <strong style={{ fontWeight: 700, color: 'var(--color-text)' }}>Venics Software Company</strong> kuhuisha leseni.
              </p>

              {/* Only the lapsed church is frozen. Say so, and let them move. */}
              {workingChurches.length > 0 && (
                <div className="mt-2">
                  <p style={{
                    fontFamily: 'Sora, sans-serif',
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: 'var(--color-text-dim)',
                    margin: '0 0 5px',
                    lineHeight: 1.45
                  }}>
                    Makanisa mengine {workingChurches.length} bado yana leseni. Badili hapa kuendelea kufanya kazi:
                  </p>
                  <select
                    value={selectedChurchId || ''}
                    onChange={(e) => setSelectedChurchId(e.target.value)}
                    aria-label="Badili kanisa"
                    style={{
                      width: '100%',
                      maxWidth: 320,
                      padding: '8px 11px',
                      borderRadius: 9,
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                      fontFamily: 'Sora, sans-serif',
                      fontSize: 12,
                      fontWeight: 600,
                      outline: 'none',
                    }}
                  >
                    {userChurches.map((ch: any) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.name}{licenceOk(ch.id) ? '' : ' — leseni imeisha'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main content - blocked vs active layout views */}
        {isBlocked && !isProfilePage ? (
          <div className="flex-1 flex flex-col justify-center items-center p-6 text-center overflow-y-auto" style={{background: 'var(--color-ink)'}}>
            <div style={{
              width: 84,
              height: 84,
              borderRadius: 28,
              background: 'color-mix(in srgb, var(--color-rose) 12%, transparent)',
              border: '2px solid color-mix(in srgb, var(--color-rose) 25%, transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-rose)',
              marginBottom: 24,
              boxShadow: '0 8px 30px color-mix(in srgb, var(--color-rose) 8%, transparent)',
              animation: 'pulse 2s infinite ease-in-out'
            }}>
              <Lock size={38} className="text-[var(--color-rose)]" />
            </div>

            <h1 style={{
              fontFamily: 'Sora, sans-serif',
              fontWeight: 800,
              fontSize: 22,
              color: 'var(--color-rose)',
              letterSpacing: '-0.5px',
              marginBottom: 8,
              lineHeight: 1.2
            }}>
              Muda wa Leseni Umeisha!
            </h1>

            <p style={{
              fontSize: 12,
              color: 'var(--color-text-muted)',
              fontFamily: 'Sora, sans-serif',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: 16
            }}>
              {blockedChurchName}
            </p>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 mb-6 text-left" style={{boxShadow: '0 4px 20px rgba(0,0,0,0.15)'}}>
              <p style={{
                fontFamily: 'Sora, sans-serif',
                fontSize: 13,
                color: 'var(--color-text)',
                lineHeight: 1.6,
                margin: 0
              }}>
                {/* Only reached when the licence is SUSPENDED. An expired
                    licence no longer lands here — it drops the app into
                    read-only instead, see showReadOnly above. */}
                Hujambo! Usajili wa programu kwa ajili ya kanisa la{' '}
                <strong style={{color: 'var(--color-rose)', fontWeight: 700}}>{blockedChurchName}</strong>{' '}
                <span>umesitishwa kwa sasa na mtoa huduma.</span>
              </p>
              
              <div className="mt-4 pt-3 border-t border-dashed border-[var(--color-border)] flex items-start gap-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--color-gold)]" />
                <p style={{ fontSize: 11, color: 'var(--color-text-dim)', margin: 0, fontFamily: 'Sora, sans-serif', lineHeight: 1.4 }}>
                  Tafadhali wasiliana na <strong>Venics Software Company</strong> au Usimamizi mkuu ili kulipia na kuamsha leseni yako.
                </p>
              </div>
            </div>

            {/* Church Switcher in Expired Module */}
            {userChurches.length > 1 && (
              <div className="w-full mb-6">
                <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 8 }}>
                  Gonga hapa chini kubadili tawi la kanisa lenye leseni:
                </p>
                <div style={{ position: 'relative', width: '100%' }}>
                  <select
                    value={selectedChurchId || ''}
                    onChange={(e) => setSelectedChurchId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                      fontFamily: 'Sora, sans-serif',
                      fontSize: 13,
                      fontWeight: 600,
                      outline: 'none',
                      appearance: 'none',
                    }}
                  >
                    {userChurches.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.name}{licenceOk(ch.id) ? '' : ' — haina leseni'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Actions for expired users */}
            <div className="flex flex-col gap-2.5 w-full">
              <Link to="/profile" className="flex items-center justify-center gap-2 w-full p-3.5 rounded-xl text-xs font-extrabold uppercase tracking-wider text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-ink-800)] transition-all">
                <User size={14} /> Swichi / Nenda Wasifu wa SaaS
              </Link>

              <button
                onClick={handleLogout}
                className="flex items-center justify-center gap-2 w-full p-3.5 rounded-xl text-xs font-extrabold uppercase tracking-wider text-[var(--color-rose)] bg-transparent border border-dashed border-rose-900/30 hover:bg-rose-950/20 transition-all cursor-pointer"
              >
                <LogOut size={14} /> Toka Kwenye Akaunti
              </button>
            </div>
          </div>
        ) : (
          <main className="flex-1 overflow-x-hidden overflow-y-auto w-full scrollbar-hide relative" style={{background: 'var(--color-ink)'}}>
            <Outlet />
          </main>
        )}

        {/* Bottom Nav */}
        <nav className="shrink-0 z-50 pb-1" style={{background: 'var(--color-ink-800)', borderTop: '1px solid var(--color-border)'}}>
          <div className="flex justify-around items-end pb-3 pt-2 px-2 min-h-[64px]">

            {[
              { to: '/', icon: Home, label: 'Dashibodi' },
              { to: '/congregants', icon: Users, label: 'Washiriki' },
            ].map(({ to, icon: Icon, label }) => (
              <Link key={to} to={to} className="flex flex-col items-center gap-1 w-[20%] relative pt-1">
                {isActive(to) && <div className="bottom-nav-indicator" />}
                <Icon size={22} color={isActive(to) ? '#00C9A7' : 'var(--color-text-muted)'} strokeWidth={isActive(to) ? 2.2 : 1.8} />
                <span style={{ color: isActive(to) ? 'var(--color-teal-on)' : 'var(--color-text-muted)', fontSize: 12, fontFamily: 'Sora, sans-serif', fontWeight: isActive(to) ? 700 : 500 }}>
                  {label}
                </span>
              </Link>
            ))}

            {/* FAB center — the app's primary write action, so it is the one
                control that must visibly change when the licence lapses. */}
            <div className="w-[20%] flex flex-col items-center justify-end relative h-full">
              {showReadOnly ? (
                <button
                  type="button"
                  onClick={() => window.alert(LICENCE_READ_ONLY_MESSAGE)}
                  aria-label="Kuongeza kumezuiwa: muda wa matumizi umeisha"
                  className="absolute -top-[26px] w-[52px] h-[52px] rounded-full flex items-center justify-center cursor-not-allowed"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px dashed color-mix(in srgb, var(--color-rose) 40%, transparent)'
                  }}
                >
                  <Lock size={22} style={{ color: 'var(--color-rose)' }} strokeWidth={2.4} />
                </button>
              ) : (
                <Link to="/add" className="absolute -top-[26px] w-[52px] h-[52px] rounded-full flex items-center justify-center shadow-lg anim-glow"
                  style={{ background: 'linear-gradient(135deg, #00C9A7, #00A88C)' }}>
                  <Plus size={26} color="var(--color-on-accent)" strokeWidth={2.8} />
                </Link>
              )}
              <span style={{ color: 'var(--color-text-muted)', fontSize: 12, fontFamily: 'Sora, sans-serif', fontWeight: 500, marginTop: 28 }}>
                {showReadOnly ? 'Imefungwa' : 'Ongeza'}
              </span>
            </div>

            {[
              { to: '/reports', icon: BarChart3, label: 'Ripoti' },
              { to: '/profile', icon: User, label: 'Wasifu' },
            ].map(({ to, icon: Icon, label }) => (
              <Link key={to} to={to} className="flex flex-col items-center gap-1 w-[20%] relative pt-1">
                {isActive(to) && <div className="bottom-nav-indicator" />}
                <Icon size={22} color={isActive(to) ? '#00C9A7' : 'var(--color-text-muted)'} strokeWidth={isActive(to) ? 2.2 : 1.8} />
                <span style={{ color: isActive(to) ? 'var(--color-teal-on)' : 'var(--color-text-muted)', fontSize: 12, fontFamily: 'Sora, sans-serif', fontWeight: isActive(to) ? 700 : 500 }}>
                  {label}
                </span>
              </Link>
            ))}

          </div>
        </nav>
      </div>
    </div>
  );
}
