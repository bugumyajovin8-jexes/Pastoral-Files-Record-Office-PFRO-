import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { UserPlus, Check } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export default function AddCongregant({ onAdded }: { onAdded: () => void }) {
  const { profile, user } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('none');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('none');
  const [residence, setResidence] = useState('');
  const [churches, setChurches] = useState<any[]>([]);
  const [churchId, setChurchId] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingChurches, setFetchingChurches] = useState(true);

  useEffect(() => {
    async function fetchChurches() {
      if (!profile) return;
      setFetchingChurches(true);
      
      let query = supabase.from('churches').select('id, name');
      
      if (profile.role === 'pastor') {
        query = query.eq('pastor_id', user?.id);
      } else if (profile.role === 'mhazini') {
        if (profile.church_ids && profile.church_ids.length > 0) {
          query = query.in('id', profile.church_ids);
        } else if (profile.church_id) {
          query = query.eq('id', profile.church_id);
        } else {
          query = query.eq('id', '00000000-0000-0000-0000-000000000000');
        }
      }
      
      const { data } = await query.order('name');
      if (data?.length) { 
        setChurches(data); 
        setChurchId(data[0].id); 
      } else {
        setChurches([]);
        setChurchId('');
      }
      setFetchingChurches(false);
    }
    fetchChurches();
  }, [profile, user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !churchId) { alert('Tafadhali jaza Jina na Barua pepe'); return; }
    setLoading(true);
    const { error } = await supabase.from('congregants').insert({ 
      full_name: name, 
      phone: phone || null, 
      email, 
      church_id: churchId, 
      marital_status: maritalStatus === 'none' ? null : maritalStatus, 
      age: age ? parseInt(age) : null, 
      gender: gender === 'none' ? null : gender, 
      residence 
    });
    setLoading(false);
    if (error) alert('Kuna tatizo kuongeza mshiriki: ' + error.message);
    else onAdded();
  };

  const inputStyle: React.CSSProperties = {
    width:'100%', background:'var(--color-ink)', border:'1px solid var(--color-border)', borderRadius:10,
    color:'var(--color-text)', fontFamily:'Noto Sans, sans-serif', fontSize:14, padding:'12px 14px',
    outline:'none', boxSizing:'border-box' as any,
  };
  const labelStyle: React.CSSProperties = {
    fontSize:11, fontWeight:700, color:'var(--color-text-dim)', textTransform:'uppercase' as any,
    letterSpacing:'0.08em', fontFamily:'Sora, sans-serif', display:'block', marginBottom:6,
  };

  return (
    <div style={{background:'var(--color-ink)',minHeight:'100%',fontFamily:'Noto Sans, sans-serif'}}>
      {/* Header */}
      <div style={{padding:'24px 16px 20px',background:'linear-gradient(180deg,var(--color-ink-800) 0%,var(--color-ink) 100%)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:4}}>
          <div style={{width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,#00C9A7,#00A88C)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <UserPlus size={20} color="var(--color-ink)" />
          </div>
          <div>
            <h1 style={{fontFamily:'Sora, sans-serif',fontWeight:800,fontSize:20,color:'var(--color-text)',letterSpacing:'-0.5px'}}>Mshiriki Mpya</h1>
            <p style={{fontSize:12,color:'var(--color-text-muted)',marginTop:1}}>Sajili mshiriki wa kanisa</p>
          </div>
        </div>
      </div>

      <div style={{padding:'0 16px 96px'}}>
        <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:16}}>

          {/* Kanisa */}
          <div>
            <label style={labelStyle}>Kanisa <span style={{color:'#FF6B8A'}}>*</span></label>
            <select required value={churchId} onChange={e=>setChurchId(e.target.value)} style={{...inputStyle,appearance:'none' as any}}>
              {fetchingChurches&&<option value="">Inapakia...</option>}
              {!fetchingChurches&&churches.length===0&&<option value="">Hakuna kanisa</option>}
              {churches.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Name */}
          <div>
            <label style={labelStyle}>Jina Kamili <span style={{color:'#FF6B8A'}}>*</span></label>
            <input type="text" required value={name} onChange={e=>setName(e.target.value)} placeholder="Mf. Yohana Petro" style={inputStyle}/>
          </div>

          {/* Email */}
          <div>
            <label style={labelStyle}>Barua Pepe <span style={{color:'#FF6B8A'}}>*</span></label>
            <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="mfano@barua.com" style={inputStyle}/>
          </div>

          {/* Phone */}
          <div>
            <label style={labelStyle}>Namba ya Simu</label>
            <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="07XX XXX XXX" style={inputStyle}/>
          </div>

          {/* Gender + Age */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <label style={labelStyle}>Jinsia</label>
              <select value={gender} onChange={e=>setGender(e.target.value)} style={{...inputStyle,appearance:'none' as any}}>
                <option value="none">Haijulikani</option>
                <option value="Mwanaume">Mwanaume</option>
                <option value="Mwanamke">Mwanamke</option>
                <option value="Mtoto">Mtoto</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Umri</label>
              <input type="number" value={age} onChange={e=>setAge(e.target.value)} placeholder="Miaka" min="0" max="120" style={inputStyle}/>
            </div>
          </div>

          {/* Marital status */}
          <div>
            <label style={labelStyle}>Hali ya Ndoa</label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8}}>
              {[['none','Haijulikani'],['single','Single'],['married','Ndoa'],['widowed','Mjane/Mgane']].map(([v,l])=>(
                <button key={v} type="button" onClick={()=>setMaritalStatus(v)}
                  style={{padding:'10px 4px',borderRadius:10,fontSize:11,fontWeight:700,fontFamily:'Sora, sans-serif',cursor:'pointer',transition:'all 0.15s',
                    background:maritalStatus===v?'#00C9A715':'var(--color-surface)',
                    color:maritalStatus===v?'#00C9A7':'var(--color-text-muted)',
                    border:maritalStatus===v?'1px solid #00C9A740':'1px solid var(--color-border)'}}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Residence */}
          <div>
            <label style={labelStyle}>Makazi</label>
            <input type="text" value={residence} onChange={e=>setResidence(e.target.value)} placeholder="Mji / Kijiji" style={inputStyle}/>
          </div>

          <button type="submit" disabled={loading} className="btn-primary" style={{height:50,marginTop:4,fontSize:15}}>
            {loading ? (
              <span style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:18,height:18,border:'2px solid var(--color-ink)40',borderTopColor:'var(--color-ink)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/> Inasajili...</span>
            ):(
              <span style={{display:'flex',alignItems:'center',gap:8}}><Check size={18}/>Sajili Mshiriki</span>
            )}
          </button>

        </form>
      </div>
    </div>
  );
}
