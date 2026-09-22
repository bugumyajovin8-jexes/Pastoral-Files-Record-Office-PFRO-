import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { UserPlus, Check } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { normalizePhone, isValidPhone, PHONE_INVALID_MESSAGE } from '../../lib/phone';
import { GENDERS, MARITAL_STATUSES } from '../../lib/memberFields';

export default function AddCongregant({ onAdded }: { onAdded: () => void }) {
  const { profile, user, isChurchWritable } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
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
        // A treasurer serves exactly one church. This was the only screen of
        // the fourteen that scoped them by `church_ids` (the full list) rather
        // than `church_id`, so a treasurer who ever ended up mapped to two
        // churches could file a new member under the wrong one.
        query = profile.church_id
          ? query.eq('id', profile.church_id)
          : query.eq('id', '00000000-0000-0000-0000-000000000000');
      } else {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
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
    if (!name || !churchId) { alert('Tafadhali jaza Jina na uchague Kanisa'); return; }
    if (!isValidPhone(phone)) { alert(PHONE_INVALID_MESSAGE); return; }
    if (!isChurchWritable(churchId)) {
      alert('Leseni ya kanisa hili imeisha. Huwezi kuongeza mshiriki mpya kwenye kanisa hili mpaka leseni ihuishwe.');
      return;
    }
    setLoading(true);
    // Stored normalised. This number IS the member's login: the Congregant app
    // finds them by it, and the token Supabase issues carries the canonical
    // form. Writing back whatever was typed would still match — every
    // comparison normalises both sides — but storing it this way keeps the
    // unique index meaningful and the value the same everywhere it is read.
    const { error } = await supabase.from('congregants').insert({
      full_name: name,
      phone: normalizePhone(phone),
      church_id: churchId,
      marital_status: maritalStatus === 'none' ? null : maritalStatus,
      age: age ? parseInt(age) : null,
      gender: gender === 'none' ? null : gender,
      residence
    });
    setLoading(false);
    if (error) {
      // 23505 is congregants_phone_unique_idx: this number is already on a
      // roll. Saying which constraint failed helps nobody; saying what to do
      // does. The member app resolves exactly one record per number, so a
      // duplicate would lock BOTH members out rather than just failing here.
      if ((error as any).code === '23505') {
        alert('Namba hii ya simu tayari imesajiliwa kwa mshiriki mwingine. Kila mshiriki anahitaji namba yake mwenyewe ili aweze kutumia programu ya washiriki.');
      } else {
        alert('Kuna tatizo kuongeza mshiriki: ' + error.message);
      }
    }
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
            <UserPlus size={20} color="var(--color-on-accent)" />
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
          {/* A pastor picks the church per record, so the licence must be
              checked against THIS choice — not against some app-wide "current"
              church. A frozen church stays listed and labelled rather than
              vanishing: a church that silently disappears reads as data loss. */}
          <div>
            <label style={labelStyle}>Kanisa <span style={{color:'var(--color-rose-on)'}}>*</span></label>
            <select required value={churchId} onChange={e=>setChurchId(e.target.value)} style={{...inputStyle,appearance:'none' as any}}>
              {fetchingChurches&&<option value="">Inapakia...</option>}
              {!fetchingChurches&&churches.length===0&&<option value="">Hakuna kanisa</option>}
              {churches.map(c=>(
                <option key={c.id} value={c.id} disabled={!isChurchWritable(c.id)}>
                  {c.name}{isChurchWritable(c.id)?'':' — leseni imeisha'}
                </option>
              ))}
            </select>
            {churchId && !isChurchWritable(churchId) && (
              <p role="alert" style={{fontSize:11.5,color:'var(--color-rose-on)',marginTop:6,lineHeight:1.45,fontFamily:'Sora, sans-serif'}}>
                Leseni ya kanisa hili imeisha, huwezi kuongeza mshiriki hapa. Chagua kanisa lenye leseni au wasiliana na Venics Software Company.
              </p>
            )}
          </div>

          {/* Name */}
          <div>
            <label style={labelStyle}>Jina Kamili <span style={{color:'var(--color-rose-on)'}}>*</span></label>
            <input type="text" required value={name} onChange={e=>setName(e.target.value)} placeholder="Mf. Yohana Petro" style={inputStyle}/>
          </div>

          {/* Phone */}
          {/* Required, and the only identifier a member has. This is what they
              will sign in to the member app with, so a missing or mistyped
              number is not a gap in a contact record — it is a member who
              cannot reach their own giving history or receipts. */}
          <div>
            <label style={labelStyle}>Namba ya Simu <span style={{color:'var(--color-rose-on)'}}>*</span></label>
            <input type="tel" inputMode="tel" autoComplete="tel" required value={phone}
              onChange={e=>setPhone(e.target.value)} placeholder="07XX XXX XXX" style={inputStyle}/>
            <p style={{fontSize:11.5,color:'var(--color-text-muted)',marginTop:6,lineHeight:1.45,fontFamily:'Sora, sans-serif'}}>
              Mshiriki atatumia namba hii kuingia kwenye programu yake. Kila mshiriki anahitaji namba yake mwenyewe.
            </p>
          </div>

          {/* Gender */}
          {/* Two buttons rather than a dropdown, matching Hali ya Ndoa below.
              Tapping the chosen one again clears it: with no "Haijulikani"
              button left, that is the only way back to unset, and jinsia is an
              optional field — submit() already stores 'none' as NULL. */}
          <div>
            <label style={labelStyle}>Jinsia</label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8}}>
              {GENDERS.map(v=>(
                <button key={v} type="button"
                  aria-pressed={gender===v}
                  onClick={()=>setGender(gender===v?'none':v)}
                  style={{padding:'10px 4px',borderRadius:10,fontSize:11,fontWeight:700,fontFamily:'Sora, sans-serif',cursor:'pointer',transition:'all 0.15s',
                    background:gender===v?'#00C9A715':'var(--color-surface)',
                    color:gender===v?'var(--color-teal-on)':'var(--color-text-muted)',
                    border:gender===v?'1px solid #00C9A740':'1px solid var(--color-border)'}}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Age */}
          <div>
            <label style={labelStyle}>Umri</label>
            <input type="number" value={age} onChange={e=>setAge(e.target.value)} placeholder="Miaka" min="0" max="120" style={inputStyle}/>
          </div>

          {/* Marital status */}
          <div>
            <label style={labelStyle}>Hali ya Ndoa</label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8}}>
              {/* Values come from the shared list so the member app writes the
                  same strings. They used to differ, which is how a member's own
                  entry could stop counting anywhere. */}
              {[['none','Haijulikani'],...MARITAL_STATUSES.map(m=>[m.value,m.label])].map(([v,l])=>(
                <button key={v} type="button" onClick={()=>setMaritalStatus(v)}
                  style={{padding:'10px 4px',borderRadius:10,fontSize:11,fontWeight:700,fontFamily:'Sora, sans-serif',cursor:'pointer',transition:'all 0.15s',
                    background:maritalStatus===v?'#00C9A715':'var(--color-surface)',
                    color:maritalStatus===v?'var(--color-teal-on)':'var(--color-text-muted)',
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

          <button type="submit" disabled={loading || !isChurchWritable(churchId)} className="btn-primary" style={{height:50,marginTop:4,fontSize:15}}>
            {loading ? (
              <span style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:18,height:18,border:'2px solid color-mix(in srgb, var(--color-on-accent) 25%, transparent)',borderTopColor:'var(--color-on-accent)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/> Inasajili...</span>
            ):(
              <span style={{display:'flex',alignItems:'center',gap:8}}><Check size={18}/>Sajili Mshiriki</span>
            )}
          </button>

        </form>
      </div>
    </div>
  );
}
