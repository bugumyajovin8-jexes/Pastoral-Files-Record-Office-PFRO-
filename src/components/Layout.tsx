import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { Home, Users, BarChart3, User, Plus, WifiOff, CloudLightning, Lock, RefreshCw, AlertTriangle, LogOut, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Layout() {
  const { user, profile, selectedChurchId, setSelectedChurchId, licenses, refreshProfile } = useAuth() as any;
  const location = useLocation();
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
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

  // Determine license block
  const isProfilePage = location.pathname === '/profile';
  let isBlocked = false;
  let blockedChurchName = '';
  let blockReason: 'expired' | 'suspended' | null = null;
  let expiryDateString = '';

  if (profile && selectedChurchId) {
    const lic = licenses.find((l: any) => l.church_id === selectedChurchId);
    if (lic) {
      const isSuspended = lic.status === 'suspended';
      const isExpired = lic.status === 'expired' || (lic.expires_at && new Date(lic.expires_at) < new Date());
      if (isSuspended) {
        isBlocked = true;
        blockReason = 'suspended';
        blockedChurchName = lic.church_name || 'Kanisa Lako';
      } else if (isExpired) {
        isBlocked = true;
        blockReason = 'expired';
        blockedChurchName = lic.church_name || 'Kanisa Lako';
        if (lic.expires_at) {
          try {
            expiryDateString = new Date(lic.expires_at).toLocaleDateString('sw-TZ', { day: 'numeric', month: 'long', year: 'numeric' });
          } catch {
            expiryDateString = lic.expires_at;
          }
        }
      }
    }
  }

  // Fetch church list for switcher if blocked
  useEffect(() => {
    if (isBlocked && profile?.church_ids?.length) {
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

        {/* Connectivity banner */}
        {!isOnline ? (
          <div className="shrink-0 bg-[#F5A623]/10 border-b border-[#F5A623]/20 text-[#F5A623] text-[11px] font-bold px-4 py-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5"><WifiOff size={13} /> Nje ya Mtandao</span>
            {pendingCount > 0 && (
              <span className="bg-[#F5A623]/20 px-2 py-0.5 rounded-full text-[10px]">{pendingCount} kusawazishwa</span>
            )}
          </div>
        ) : pendingCount > 0 ? (
          <div className="shrink-0 bg-[#00C9A7]/10 border-b border-[#00C9A7]/20 text-[#00C9A7] text-[11px] font-bold px-4 py-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5"><CloudLightning size={13} className="animate-pulse" /> Inasawazisha...</span>
            <span className="bg-[#00C9A7]/20 px-2 py-0.5 rounded-full text-[10px]">{pendingCount} imesalia</span>
          </div>
        ) : null}

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
              fontSize: 10,
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
                Hujambo! Muda wa matumizi au usajili wa programu kwa ajili ya kanisa la{' '}
                <strong style={{color: 'var(--color-rose)', fontWeight: 700}}>{blockedChurchName}</strong>{' '}
                {blockReason === 'suspended' ? (
                  <span>umesitishwa kwa sasa na mtoa huduma.</span>
                ) : (
                  <span>ulifikia ukomo {expiryDateString ? `tarehe ${expiryDateString}` : 'yake'}.</span>
                )}
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
                        {ch.name}
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
                <span style={{ color: isActive(to) ? '#00C9A7' : 'var(--color-text-muted)', fontSize: 10, fontFamily: 'Sora, sans-serif', fontWeight: isActive(to) ? 700 : 500 }}>
                  {label}
                </span>
              </Link>
            ))}

            {/* FAB center */}
            <div className="w-[20%] flex flex-col items-center justify-end relative h-full">
              <Link to="/add" className="absolute -top-[26px] w-[52px] h-[52px] rounded-full flex items-center justify-center shadow-lg anim-glow"
                style={{ background: 'linear-gradient(135deg, #00C9A7, #00A88C)' }}>
                <Plus size={26} color="var(--color-ink)" strokeWidth={2.8} />
              </Link>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 10, fontFamily: 'Sora, sans-serif', fontWeight: 500, marginTop: 28 }}>Ongeza</span>
            </div>

            {[
              { to: '/reports', icon: BarChart3, label: 'Ripoti' },
              { to: '/profile', icon: User, label: 'Wasifu' },
            ].map(({ to, icon: Icon, label }) => (
              <Link key={to} to={to} className="flex flex-col items-center gap-1 w-[20%] relative pt-1">
                {isActive(to) && <div className="bottom-nav-indicator" />}
                <Icon size={22} color={isActive(to) ? '#00C9A7' : 'var(--color-text-muted)'} strokeWidth={isActive(to) ? 2.2 : 1.8} />
                <span style={{ color: isActive(to) ? '#00C9A7' : 'var(--color-text-muted)', fontSize: 10, fontFamily: 'Sora, sans-serif', fontWeight: isActive(to) ? 700 : 500 }}>
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
