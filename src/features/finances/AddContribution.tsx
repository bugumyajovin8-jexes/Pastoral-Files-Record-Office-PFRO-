import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Check, Trash2, HeartHandshake } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export default function AddContribution() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const congregantId = searchParams.get('congregantId');
  const [congregantName, setCongregantName] = useState('');
  const [churchId, setChurchId] = useState('');
  const [zaka, setZaka] = useState('');
  const [sadaka, setSadaka] = useState('');
  const [majengo, setMajengo] = useState('');
  const [makambi, setMakambi] = useState('');
  const [otherContributions, setOtherContributions] = useState<{name:string,amount:string}[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchCongregant() {
      if (!congregantId || !profile) return;
      const { data } = await supabase.from('congregants').select('full_name,church_id').eq('id', congregantId).single();
      if (data) {
        let allowed = false;
        if (profile.role==='pastor') allowed = profile.church_ids?.includes(data.church_id)??false;
        else if (profile.role==='mhazini') allowed = profile.church_id===data.church_id;
        if (!allowed) { alert('Huna ruhusa ya kurekodi mchango kwa mshiriki huyu.'); navigate('/'); return; }
        setCongregantName(data.full_name); setChurchId(data.church_id);
      }
    }
    fetchCongregant();
  }, [congregantId, profile]);

  const addContribution = async () => {
    if (!congregantId) return alert('Mshiriki hajulikani');
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const toInsert = [
      { amount: zaka, type: 'Zaka' },
      { amount: sadaka, type: 'Sadaka' },
      { amount: majengo, type: 'Majengo' },
      { amount: makambi, type: 'Makambi' },
      ...otherContributions.map(oc => ({ amount: oc.amount, type: oc.name }))
    ].filter(c => c.amount && Number(c.amount) > 0);
    if (toInsert.length === 0) { setLoading(false); return alert('Tafadhali weka kiasi cha mchango wowote'); }
    const { error } = await supabase.from('contributions').insert(toInsert.map(c => {
      const isStd = c.type==='Zaka'||c.type==='Sadaka';
      return { congregant_id:congregantId, church_id:churchId, amount:Number(c.amount), type:isStd?c.type:'Sadaka', payment_method:isStd?null:c.type, recorded_by:user?.id };
    }));
    setLoading(false);
    if (error) alert(error.message);
    else { alert('Michango imeongezwa kikamilifu!'); setZaka(''); setSadaka(''); setMajengo(''); setMakambi(''); setOtherContributions([]); }
  };

  const inputStyle: React.CSSProperties = {
    width:'100%', background:'var(--color-ink)', border:'1px solid var(--color-border)', borderRadius:10,
    color:'var(--color-text)', fontFamily:'Sora, sans-serif', fontSize:15, padding:'12px 14px',
    outline:'none', boxSizing:'border-box' as any, letterSpacing:'0.02em',
  };

  return (
    <div style={{background:'var(--color-ink)',minHeight:'100%',fontFamily:'Noto Sans, sans-serif'}}>
      {/* Header */}
      <div style={{padding:'24px 16px 20px',background:'linear-gradient(180deg,var(--color-ink-800) 0%,var(--color-ink) 100%)'}}>
        <button onClick={()=>navigate(-1)} style={{background:'none',border:'none',color:'var(--color-text-dim)',cursor:'pointer',padding:'0 0 12px',display:'flex',alignItems:'center',gap:6}}>
          <ArrowLeft size={18}/> <span style={{fontFamily:'Sora, sans-serif',fontSize:12,fontWeight:600}}>Rudi</span>
        </button>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,#00C9A7,#00A88C)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <HeartHandshake size={20} color="var(--color-ink)"/>
          </div>
          <div>
            <h1 style={{fontFamily:'Sora, sans-serif',fontWeight:800,fontSize:20,color:'var(--color-text)',letterSpacing:'-0.5px'}}>Rekodi Mchango</h1>
            {congregantName&&<p style={{fontSize:12,color:'#00C9A7',marginTop:2,fontWeight:600}}>kwa {congregantName}</p>}
          </div>
        </div>
      </div>

      <div style={{padding:'0 16px 96px',display:'flex',flexDirection:'column',gap:12}}>

        {/* Contribution fields */}
        {[
          {label:'Zaka',value:zaka,setter:setZaka,color:'#00C9A7'},
          {label:'Sadaka',value:sadaka,setter:setSadaka,color:'#F5A623'},
          {label:'Majengo',value:majengo,setter:setMajengo,color:'#38BDF8'},
          {label:'Makambi',value:makambi,setter:setMakambi,color:'#A78BFA'},
        ].map(f=>(
          <div key={f.label} style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:14,padding:'14px 16px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <span style={{fontFamily:'Sora, sans-serif',fontWeight:700,fontSize:11,color:f.color,textTransform:'uppercase',letterSpacing:'0.08em'}}>{f.label}</span>
              <span style={{fontFamily:'Sora, sans-serif',fontSize:10,color:'var(--color-text-muted)'}}>TZS</span>
            </div>
            <input type="number" value={f.value} onChange={e=>f.setter(e.target.value)} placeholder="0"
              style={{...inputStyle,color:f.value?f.color:'var(--color-text-muted)'}}
              onFocus={e=>{e.currentTarget.style.borderColor=f.color;e.currentTarget.style.boxShadow=`0 0 0 3px ${f.color}18`;}}
              onBlur={e=>{e.currentTarget.style.borderColor='var(--color-border)';e.currentTarget.style.boxShadow='none';}}
            />
          </div>
        ))}

        {/* Other contributions */}
        {otherContributions.map((oc,i)=>(
          <div key={i} style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:14,padding:'14px 16px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <span style={{fontFamily:'Sora, sans-serif',fontWeight:700,fontSize:11,color:'var(--color-text-dim)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Mchango #{i+5}</span>
              <button onClick={()=>setOtherContributions(otherContributions.filter((_,j)=>j!==i))} style={{background:'#FF6B8A15',border:'none',borderRadius:6,padding:'4px 8px',color:'#FF6B8A',cursor:'pointer',display:'flex',alignItems:'center',gap:4,fontSize:10,fontWeight:700}}>
                <Trash2 size={12}/> Futa
              </button>
            </div>
            <input type="text" value={oc.name} onChange={e=>{const n=[...otherContributions];n[i].name=e.target.value;setOtherContributions(n);}}
              placeholder="Jina la mchango" style={{...inputStyle,marginBottom:8,fontFamily:'Noto Sans, sans-serif',fontSize:13}}/>
            <input type="number" value={oc.amount} onChange={e=>{const n=[...otherContributions];n[i].amount=e.target.value;setOtherContributions(n);}}
              placeholder="0" style={inputStyle}/>
          </div>
        ))}

        <button onClick={()=>setOtherContributions([...otherContributions,{name:'',amount:''}])}
          style={{display:'flex',alignItems:'center',gap:8,color:'#00C9A7',fontFamily:'Sora, sans-serif',fontSize:13,fontWeight:700,background:'#00C9A710',border:'1px dashed #00C9A740',borderRadius:12,padding:'12px 16px',cursor:'pointer',width:'100%',justifyContent:'center'}}>
          <Plus size={16}/> Ongeza Mchango Mwingine
        </button>

        <button disabled={loading} onClick={addContribution} className="btn-primary" style={{height:52,fontSize:15,marginTop:4}}>
          {loading?<><div style={{width:18,height:18,border:'2px solid var(--color-ink)40',borderTopColor:'var(--color-ink)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/> Inahifadhi...</>:<><Check size={18}/>Hifadhi Michango</>}
        </button>
      </div>
    </div>
  );
}
