import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Phone, Lock, Loader2, Eye, EyeOff, User } from 'lucide-react';
import { useAuth } from './AuthContext';
import { toE164, isValidPhone, PHONE_INVALID_MESSAGE } from '../../lib/phone';
import { InstallBanner } from '../../components/InstallPrompt';
import { INSTALL_THEME, APP_NAME } from '../../lib/installTheme';

// Supabase answers in English, and the sentences it uses for the two mistakes
// people actually make ("already registered", "invalid credentials") say
// "email" or "user" — words that mean nothing on a screen that only ever asked
// for a phone number. Anything unrecognised is passed through untouched rather
// than flattened into a generic apology: an unexpected error is worth reading.
function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'Namba hii tayari ina akaunti. Bonyeza "Ingia" badala ya "Jisajili".';
  }
  if (m.includes('invalid login credentials')) {
    return 'Namba ya simu au nenosiri si sahihi.';
  }
  if (m.includes('password should be at least')) {
    return 'Nenosiri ni fupi mno. Tumia herufi 6 au zaidi.';
  }
  // The exact sentence Supabase returns while the Phone provider is switched
  // off — confirmed against the live project. It is the FIRST thing anyone will
  // see after this change ships, and "Phone signups are disabled" tells a
  // pastor in Bagamoyo nothing about what to do.
  if (m.includes('phone signups are disabled') || m.includes('phone_provider_disabled')
      || m.includes('signups not allowed') || m.includes('unsupported phone provider')) {
    return 'Kuingia kwa namba ya simu bado hakujawashwa. Wasiliana na Venics Software Company.';
  }
  return message;
}

export default function Login() {
  const { session } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { if (session) navigate('/'); }, [session]);

  // Supabase speaks E.164; a pastor types 07XX XXX XXX. Converting here — once,
  // at the only place a number enters the auth system — is what keeps the token
  // Supabase issues comparable with the numbers stored in `congregants` and
  // `invitations`. See src/lib/phone.ts.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) { setErrorMsg('Supabase haijasanidiwa. Angalia env variables.'); return; }

    if (!isValidPhone(phone)) { setErrorMsg(PHONE_INVALID_MESSAGE); return; }
    const phoneE164 = toE164(phone);

    setLoading(true); setErrorMsg('');
    if (isSignUp) {
      if (password !== confirmPassword) { setErrorMsg('Manenosiri hayalingani!'); setLoading(false); return; }
      // full_name rides on the auth metadata; AuthContext reads it from there
      // when it creates the profile row.
      // Only the name is sent. The role is decided by the database in
      // handle_new_user() from data it already holds — a pending invitation
      // makes a treasurer, a number already on a church's roll makes a
      // member, anything else makes a pastor. An earlier version passed a
      // requested role here, which meant a pastor signing up from any build
      // that omitted it was created as a member and then refused when they
      // tried to add a church. Nothing the client sends can get that wrong now
      // because the client no longer has a say.
      const { data: signUpData, error } = await supabase.auth.signUp({
        phone: phoneE164,
        password,
        options: { data: { full_name: name } }
      });
      if (error) { setErrorMsg(translateAuthError(error.message)); setLoading(false); return; }

      // With "Confirm phone" switched off in Supabase — which is how this is
      // deployed, because there is no SMS provider yet — signUp already returns
      // a session and there is nothing further to do. Signing in a second time
      // would be a wasted round trip and, on a slow connection, a visible one.
      if (!signUpData.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ phone: phoneE164, password });
        if (signInError) { setErrorMsg('Usajili umefanikiwa! Tafadhali ingia.'); setIsSignUp(false); setLoading(false); return; }
      }

      // Deliberately no profile write here.
      //
      // This used to upsert role:'pastor' for EVERY signup, invited treasurers
      // included, and raced AuthContext: signInWithPassword fires
      // onAuthStateChange, which starts refreshProfile at the same moment. If
      // this write landed after refreshProfile had set 'mhazini', the treasurer
      // stayed a pastor — holding a user_churches row in the inviting pastor's
      // church.
      //
      // AuthContext is now the single writer of the profile row. It creates a
      // 'pastor' profile for a genuine new signup, or resolves a pending
      // invitation to 'mhazini' — one code path, no ordering to get wrong.
      // `full_name` is carried on the signUp metadata above and read from there.
      navigate('/'); setLoading(false);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ phone: phoneE164, password });
      if (error) { setErrorMsg(translateAuthError(error.message)); setLoading(false); } else navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-5 font-sans relative overflow-hidden" style={{background: 'var(--color-ink)'}}>
      {/* Background mesh */}
      <div className="absolute top-[-20%] left-[-10%] w-80 h-80 rounded-full blur-[120px] pointer-events-none" style={{ background: '#00C9A710' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 rounded-full blur-[100px] pointer-events-none" style={{ background: '#A78BFA08' }} />

      {/* The sign-in screen is the first thing a new pastor or mhazini sees,
          so the install offer is here as well as inside the app. Pinned to
          the top so it never pushes the form off-centre. */}
      <div className="absolute top-0 left-0 right-0 z-20 flex justify-center">
        <div className="w-full max-w-[430px]">
          <InstallBanner appName={APP_NAME} theme={INSTALL_THEME} iconSrc="/icons/icon-192.png"
            subtitle="Ifungue moja kwa moja kutoka skrini ya nyumbani" />
        </div>
      </div>

      <div className="w-full max-w-[380px] anim-fade-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 select-none">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #00C9A7, #00A88C)' }}>
            <span style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--color-on-accent)', letterSpacing: '-1px' }}>PF</span>
          </div>
          <h1 style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 22, color: 'var(--color-text)', letterSpacing: '-0.5px' }}>
            PFRO
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 4, fontFamily: 'Sora, sans-serif', fontWeight: 500 }}>
            Pastoral Files Record Office
          </p>
        </div>

        {/* Card */}
        <div className="card p-6">
          {/* Tab switcher */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl mb-5 select-none"
            style={{ background: 'var(--color-ink)', border: '1px solid var(--color-border)' }}>
            {['Ingia', 'Jisajili'].map((label, i) => (
              <button key={label} type="button"
                onClick={() => { setIsSignUp(i === 1); setErrorMsg(''); }}
                aria-pressed={(i === 1) === isSignUp}
                style={{
                  minHeight: 44, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  fontFamily: 'Sora, sans-serif', cursor: 'pointer', transition: 'all 0.15s',
                  background: (i === 1) === isSignUp ? 'linear-gradient(135deg,#00C9A7,#00A88C)' : 'transparent',
                  // Was var(--color-ink): near-white in light mode, 2.0:1 on teal.
                  color: (i === 1) === isSignUp ? 'var(--color-on-accent)' : 'var(--color-text-muted)',
                  border: 'none',
                }}>
                {label}
              </button>
            ))}
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl text-center text-xs font-semibold"
              style={{ background: '#FF6B8A15', color: 'var(--color-rose-on)', border: '1px solid #FF6B8A30' }}>
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Sora, sans-serif', display: 'block', marginBottom: 6 }}>
                  Jina Kamili
                </label>
                <div className="relative">
                  <User size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                  <input type="text" required value={name} onChange={e => setName(e.target.value)}
                    placeholder="Jina lako kamili" className="input-dark" style={{ paddingLeft: 38 }} />
                </div>
              </div>
            )}

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Sora, sans-serif', display: 'block', marginBottom: 6 }}>
                Namba ya Simu
              </label>
              <div className="relative">
                <Phone size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                {/* inputMode="tel" brings up the phone keypad rather than the
                    full keyboard — this is used on a handset far more often
                    than on a desktop. autoComplete lets the browser and Android
                    offer the number already on the device. */}
                <input type="tel" inputMode="tel" autoComplete="tel" required
                  value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="0754 112 233" className="input-dark" style={{ paddingLeft: 38 }} />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Sora, sans-serif', display: 'block', marginBottom: 6 }}>
                Nenosiri
              </label>
              <div className="relative">
                <Lock size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                <input type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" className="input-dark" style={{ paddingLeft: 38, paddingRight: 42 }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  aria-label="Onyesha au ficha nenosiri"
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {isSignUp && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Sora, sans-serif', display: 'block', marginBottom: 6 }}>
                  Thibitisha Nenosiri
                </label>
                <div className="relative">
                  <Lock size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                  <input type={showConfirm ? 'text' : 'password'} required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••" className="input-dark" style={{ paddingLeft: 38, paddingRight: 42 }} />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    aria-label="Onyesha au ficha nenosiri"
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2" style={{ height: 48 }}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : (isSignUp ? 'Jisajili Sasa' : 'Ingia Kwenye Akaunti')}
            </button>
          </form>

          {/* There is no self-service password reset. resetPasswordForEmail has
              no phone equivalent, and with SMS confirmations switched off there
              is no second channel to prove the account is yours. Saying so here
              is the difference between a user who asks for help and one who
              hunts for a "forgot password" link that does not exist. Remove
              this line if an SMS provider is ever wired up. */}
          {!isSignUp && (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 11.5, marginTop: 14, lineHeight: 1.5, fontFamily: 'Noto Sans, sans-serif' }}>
              Umesahau nenosiri? Wasiliana na Venics Software Company — nenosiri
              haliwezi kubadilishwa na wewe mwenyewe kwa sasa.
            </p>
          )}
        </div>

        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13, marginTop: 16, fontFamily: 'Noto Sans, sans-serif' }}>
          {isSignUp ? 'Tayari una akaunti?' : 'Huna akaunti?'}{' '}
          <button onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(''); }}
            style={{ color: 'var(--color-teal-on)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Sora, sans-serif', fontSize: 13, minHeight: 44, padding: '0 10px' }}>
            {isSignUp ? 'Ingia' : 'Jisajili'}
          </button>
        </p>

        {/* Company Credits */}
        <div style={{textAlign:'center',marginTop:48,opacity:0.7}}>
          <p style={{fontSize:11,fontFamily:'Sora, sans-serif',color:'var(--color-text-muted)',fontWeight:500,margin:0,letterSpacing:'0.02em'}}>
            Made by <span style={{fontWeight:700,color:'var(--color-text)'}}>Venics Software Company</span>
          </p>
        </div>
      </div>
    </div>
  );
}
