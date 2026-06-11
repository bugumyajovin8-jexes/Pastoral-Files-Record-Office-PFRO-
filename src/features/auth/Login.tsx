import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Loader2, Eye, EyeOff, User } from 'lucide-react';
import { useAuth } from './AuthContext';

export default function Login() {
  const { session } = useAuth();
  const [email, setEmail] = useState('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) { setErrorMsg('Supabase haijasanidiwa. Angalia env variables.'); return; }
    setLoading(true); setErrorMsg('');
    if (isSignUp) {
      if (password !== confirmPassword) { setErrorMsg('Manenosiri hayalingani!'); setLoading(false); return; }
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
      if (error) { setErrorMsg(error.message); setLoading(false); return; }
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) { setErrorMsg('Usajili umefanikiwa! Tafadhali ingia.'); setIsSignUp(false); setLoading(false); return; }
      const userObj = signInData.user;
      if (userObj) {
        // Unda wasifu wa mwanzo wenye jukumu la 'pastor' ili kuruhusu uandishi kwenye user_churches (kupitia sera ya RLS).
        // Ikiwa kuna mwaliko unaosubiriwa, AuthContext utashughulikia uanzishaji huo salama bila mwingiliano wa "Race Condition".
        await supabase.from('profiles').upsert({ id: userObj.id, email, full_name: name, role: 'pastor' });
      }
      navigate('/'); setLoading(false);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setErrorMsg(error.message); setLoading(false); } else navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-5 font-sans relative overflow-hidden" style={{background: 'var(--color-ink)'}}>
      {/* Background mesh */}
      <div className="absolute top-[-20%] left-[-10%] w-80 h-80 rounded-full blur-[120px] pointer-events-none" style={{ background: '#00C9A710' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 rounded-full blur-[100px] pointer-events-none" style={{ background: '#A78BFA08' }} />

      <div className="w-full max-w-[380px] anim-fade-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 select-none">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #00C9A7, #00A88C)' }}>
            <span style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--color-ink)', letterSpacing: '-1px' }}>PF</span>
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
                style={{
                  padding: '8px 0', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  fontFamily: 'Sora, sans-serif', cursor: 'pointer', transition: 'all 0.15s',
                  background: (i === 1) === isSignUp ? 'linear-gradient(135deg,#00C9A7,#00A88C)' : 'transparent',
                  color: (i === 1) === isSignUp ? 'var(--color-ink)' : 'var(--color-text-muted)',
                  border: 'none',
                }}>
                {label}
              </button>
            ))}
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl text-center text-xs font-semibold"
              style={{ background: '#FF6B8A15', color: '#FF6B8A', border: '1px solid #FF6B8A30' }}>
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
                Barua Pepe
              </label>
              <div className="relative">
                <Mail size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="pastor@kanisa.com" className="input-dark" style={{ paddingLeft: 38 }} />
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
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
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
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2" style={{ height: 48 }}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : (isSignUp ? 'Jisajili Sasa' : 'Ingia Kwenye Akaunti')}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 12, marginTop: 20, fontFamily: 'Noto Sans, sans-serif' }}>
          {isSignUp ? 'Tayari una akaunti?' : 'Huna akaunti?'}{' '}
          <button onClick={() => { setIsSignUp(!isSignUp); setErrorMsg(''); }}
            style={{ color: '#00C9A7', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Sora, sans-serif' }}>
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
