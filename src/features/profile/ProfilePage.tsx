import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, Mail, Shield, ChevronRight, Settings, Moon, Sun, Edit2, Check, X, Calendar } from 'lucide-react';
import { useTheme } from '../../ThemeContext';

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth() as any;
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [loadingLicenses, setLoadingLicenses] = useState(true);
  const [userLicenses, setUserLicenses] = useState<any[]>([]);
  const [churchesMap, setChurchesMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    async function fetchLicenseData() {
      if (!user?.id || !profile) return;
      setLoadingLicenses(true);
      try {
        const userRole = profile.role || 'pastor';
        const userChurchIds = profile.church_ids || (profile.church_id ? [profile.church_id] : []);

        if (userChurchIds.length === 0) {
          if (active) {
            setUserLicenses([]);
            setLoadingLicenses(false);
          }
          return;
        }

        // Fetch churches to match names safely
        const { data: churchesData, error: chErr } = await supabase
          .from('churches')
          .select('id, name')
          .in('id', userChurchIds);

        if (chErr) throw chErr;

        const map: Record<string, string> = {};
        if (churchesData) {
          churchesData.forEach((ch: any) => {
            map[ch.id] = ch.name;
          });
        }

        // Fetch licenses for these churches
        const { data: licData, error: licErr } = await supabase
          .from('licenses')
          .select('*')
          .in('church_id', userRole === 'pastor' ? userChurchIds : [profile.church_id].filter(Boolean));

        if (licErr) throw licErr;

        if (active) {
          setChurchesMap(map);
          setUserLicenses(licData || []);
        }
      } catch (err) {
        console.error('Error fetching license info in ProfilePage:', err);
      } finally {
        if (active) setLoadingLicenses(false);
      }
    }

    fetchLicenseData();
    return () => {
      active = false;
    };
  }, [user?.id, profile]);

  const getDaysRemainingInfo = (expiresAt: string) => {
    if (!expiresAt) return { days: 0, text: 'Haijulikani', color: 'var(--color-text-dim)', bg: 'var(--color-ink-800)' };
    const expiry = new Date(expiresAt);
    const now = new Date();
    // Use reset hours to compare date difference exactly
    const expiryDateOnly = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
    const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = expiryDateOnly.getTime() - nowDateOnly.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { 
        days: diffDays, 
        text: `Muda Umeisha (Siku ${Math.abs(diffDays)} zilizopita)`, 
        color: 'var(--color-rose)', 
        bg: 'color-mix(in srgb, var(--color-rose) 15%, transparent)' 
      };
    } else if (diffDays === 0) {
      return { 
        days: 0, 
        text: 'Inaisha Leo', 
        color: 'var(--color-rose)', 
        bg: 'color-mix(in srgb, var(--color-rose) 20%, transparent)' 
      };
    } else if (diffDays <= 30) {
      return { 
        days: diffDays, 
        text: `Inakaribia kuisha (Siku ${diffDays} zilizobaki)`, 
        color: 'var(--color-gold)', 
        bg: 'color-mix(in srgb, var(--color-gold) 15%, transparent)' 
      };
    } else {
      return { 
        days: diffDays, 
        text: `Siku ${diffDays} zimebaki`, 
        color: 'var(--color-teal)', 
        bg: 'var(--color-teal-glow)' 
      };
    }
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    navigate('/login');
  };

  const handleSaveName = async () => {
    if (!newName.trim()) {
      setSaveError('Jina haliwezi kuwa tupu');
      return;
    }
    setIsSavingName(true);
    setSaveError('');
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          full_name: newName.trim(),
          role: profile?.role || 'pastor'
        });
      
      if (error) throw error;
      
      if (refreshProfile) {
        await refreshProfile();
      }
      setIsEditingName(false);
    } catch (err: any) {
      console.error(err);
      setSaveError('Imeshindwa kuhifadhi jina: ' + err.message);
    } finally {
      setIsSavingName(false);
    }
  };

  const roleColor = profile?.role==='pastor'?'var(--color-violet)':profile?.role==='mhazini'?'var(--color-teal)':'var(--color-sky)';
  const roleLabel = profile?.role==='pastor'?'Mchungaji':profile?.role==='mhazini'?'Mhazini':'Mtumiaji';

  return (
    <div style={{background:'var(--color-ink)',minHeight:'100%',fontFamily:'Noto Sans, sans-serif', transition: 'background 0.3s ease'}}>
      {/* Header */}
      <div style={{padding:'32px 16px 24px',background:'linear-gradient(180deg, var(--color-ink-800) 0%, var(--color-ink) 100%)',display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center', transition: 'background 0.3s ease'}}>
        <div style={{width:72,height:72,borderRadius:22,background:`color-mix(in srgb, ${roleColor} 20%, transparent)`,border:`2px solid color-mix(in srgb, ${roleColor} 40%, transparent)`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:14,position:'relative'}}>
          <User size={32} color={roleColor}/>
          <div style={{position:'absolute',bottom:-4,right:-4,width:20,height:20,borderRadius:6,background:`${roleColor}`,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Shield size={11} color="var(--color-ink)"/>
          </div>
        </div>
        
        <div style={{marginBottom: 8}}>
          <h2 style={{fontFamily:'Sora, sans-serif',fontWeight:800,fontSize:18,color:'var(--color-text)',letterSpacing:'-0.5px',margin:0}}>
            {profile?.full_name || 'Bila Jina'}
          </h2>
        </div>

        <span style={{display:'inline-block',background:`color-mix(in srgb, ${roleColor} 20%, transparent)`,color:roleColor,border:`1px solid color-mix(in srgb, ${roleColor} 40%, transparent)`,borderRadius:8,padding:'4px 12px',fontSize:11,fontWeight:700,fontFamily:'Sora, sans-serif',textTransform:'uppercase',letterSpacing:'0.08em'}}>
           {roleLabel}
        </span>
      </div>

      <div style={{padding:'0 16px 96px',display:'flex',flexDirection:'column',gap:12}}>
        {/* Info card */}
        <div style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:16,overflow:'hidden'}}>
          <div style={{padding:'14px 16px',borderBottom:'1px solid var(--color-border)',display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:34,height:34,borderRadius:10,background:'color-mix(in srgb, var(--color-sky) 15%, transparent)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <Mail size={16} color="var(--color-sky)"/>
            </div>
            <div>
              <p style={{fontSize:10,color:'var(--color-text-muted)',fontFamily:'Sora, sans-serif',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>Barua Pepe</p>
              <p style={{fontSize:13,color:'var(--color-text)',fontFamily:'Sora, sans-serif',fontWeight:500}}>{user?.email}</p>
            </div>
          </div>
          <div style={{padding:'14px 16px',display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:34,height:34,borderRadius:10,background:`color-mix(in srgb, ${roleColor} 15%, transparent)`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <Shield size={16} color={roleColor}/>
            </div>
            <div>
              <p style={{fontSize:10,color:'var(--color-text-muted)',fontFamily:'Sora, sans-serif',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>Jukumu</p>
              <p style={{fontSize:13,color:roleColor,fontFamily:'Sora, sans-serif',fontWeight:700}}>{roleLabel}</p>
            </div>
          </div>
        </div>


        {/* Theme Setting */}
        <div style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:16,overflow:'hidden'}}>
          <button onClick={toggleTheme}
            style={{width:'100%',padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',background:'none',border:'none',textAlign:'left',transition:'background 0.1s'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--color-ink-800)'}
            onMouseLeave={e=>e.currentTarget.style.background='none'}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:34,height:34,borderRadius:10,background:'var(--color-teal-glow)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--color-teal)',flexShrink:0}}>
                {theme === 'dark' ? <Moon size={16}/> : <Sun size={16}/>}
              </div>
              <span style={{fontFamily:'Sora, sans-serif',fontWeight:600,fontSize:13,color:'var(--color-text)'}}>
                {theme === 'dark' ? 'Hali ya Giza (Dark Mode)' : 'Hali ya Nuru (Light Mode)'}
              </span>
            </div>
            <div style={{width:40,height:22,borderRadius:11,background:theme==='dark'?'var(--color-teal)':'var(--color-border)',position:'relative',transition:'all 0.3s'}}>
              <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:theme==='dark'?20:2,transition:'all 0.3s'}}/>
            </div>
          </button>
        </div>

        {/* Actions */}
        {profile?.role === 'pastor' && (
          <div style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:16,overflow:'hidden', marginBottom: 12}}>
            {[
              {label:'Simamia Makanisa',color:'var(--color-gold)',bg:'color-mix(in srgb, var(--color-gold) 15%, transparent)',icon:<Settings size={16}/>,action:()=>navigate('/churches')},
              {label:'Simamia Mhazini',color:'var(--color-violet)',bg:'color-mix(in srgb, var(--color-violet) 15%, transparent)',icon:<User size={16}/>,action:()=>navigate('/manage-mhazini')},
            ].map((item,i,arr)=>(
              <button key={item.label} onClick={item.action}
                style={{width:'100%',padding:'14px 16px',borderBottom:i<arr.length-1?'1px solid var(--color-border)':'none',display:'flex',alignItems:'center',gap:12,cursor:'pointer',background:'none',border:'none',textAlign:'left',transition:'background 0.1s'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--color-ink-800)'}
                onMouseLeave={e=>e.currentTarget.style.background='none'}>
                <div style={{width:34,height:34,borderRadius:10,background:item.bg,display:'flex',alignItems:'center',justifyContent:'center',color:item.color,flexShrink:0}}>
                  {item.icon}
                </div>
                <span style={{flex:1,fontFamily:'Sora, sans-serif',fontWeight:600,fontSize:13,color:'var(--color-text)'}}>{item.label}</span>
                <ChevronRight size={16} color="var(--color-text-muted)"/>
              </button>
            ))}
          </div>
        )}

        <button onClick={handleLogout}
          style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,background:'color-mix(in srgb, var(--color-rose) 15%, transparent)',border:'1px solid color-mix(in srgb, var(--color-rose) 30%, transparent)',borderRadius:14,padding:'14px',color:'var(--color-rose)',fontFamily:'Sora, sans-serif',fontWeight:700,fontSize:14,cursor:'pointer',transition:'all 0.15s',marginTop:4}}
          onMouseEnter={e=>e.currentTarget.style.background='color-mix(in srgb, var(--color-rose) 20%, transparent)'}
          onMouseLeave={e=>e.currentTarget.style.background='color-mix(in srgb, var(--color-rose) 15%, transparent)'}>
          <LogOut size={18}/>
          Toka Kwenye Akaunti
        </button>

        {/* Company Credits */}
        <div style={{textAlign:'center',marginTop:24,marginBottom:12,opacity:0.7}}>
          <p style={{fontSize:11,fontFamily:'Sora, sans-serif',color:'var(--color-text-dim)',fontWeight:500,margin:0,letterSpacing:'0.02em'}}>
            Made by <span style={{fontWeight:700,color:'var(--color-text)'}}>Venics Software Company</span>
          </p>
        </div>
      </div>
    </div>
  );
}
