import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { TrendingUp, HeartHandshake, ChevronRight } from 'lucide-react';

export default function FinancesPage() {
  const [contributions, setContributions] = useState<any[]>([]);
  const { profile } = useAuth();
  const navigate = useNavigate();

  async function fetchContributions() {
    let q = supabase.from('contributions').select('*,congregants(full_name)');
    if (profile?.role==='pastor') q=profile.church_ids?.length?q.in('church_id',profile.church_ids):q.eq('church_id','00000000-0000-0000-0000-000000000000');
    else if (profile?.role==='mhazini') q=profile.church_id?q.eq('church_id',profile.church_id):q.eq('church_id','00000000-0000-0000-0000-000000000000');
    else q=q.eq('church_id','00000000-0000-0000-0000-000000000000');
    const { data } = await q;
    if (data) setContributions(data.map(c=>({...c,type:c.payment_method?c.payment_method:c.type})));
  }

  useEffect(()=>{ if(profile) fetchContributions(); },[profile]);

  const typeStyle=(t:string)=>({
    background:t?.toLowerCase()==='zaka'?'#00C9A715':t?.toLowerCase()==='sadaka'?'#F5A62315':'#38BDF815',
    color:t?.toLowerCase()==='zaka'?'var(--color-teal-on)':t?.toLowerCase()==='sadaka'?'var(--color-gold-on)':'var(--color-sky-on)',
    border:`1px solid ${t?.toLowerCase()==='zaka'?'#00C9A730':t?.toLowerCase()==='sadaka'?'#F5A62330':'#38BDF830'}`,
  });

  return (
    <div style={{background:'var(--color-ink)',minHeight:'100%',fontFamily:'Noto Sans, sans-serif'}}>
      <div style={{padding:'24px 16px 16px',background:'linear-gradient(180deg,var(--color-ink-800) 0%,var(--color-ink) 100%)'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
          <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#00C9A7,#00A88C)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <TrendingUp size={18} color="var(--color-on-accent)"/>
          </div>
          <div>
            <h1 style={{fontFamily:'Sora, sans-serif',fontWeight:800,fontSize:20,color:'var(--color-text)',letterSpacing:'-0.5px'}}>Michango na Fedha</h1>
            <p style={{fontSize:11,color:'var(--color-text-muted)',marginTop:1}}>Simamia zaka na sadaka za ushirika</p>
          </div>
        </div>
      </div>

      <div style={{padding:'0 16px 96px',display:'flex',flexDirection:'column',gap:16}}>
        {/* A contribution needs a member. This page used to embed the recording
            form with no member selected, so the fields were live but saving
            always failed with "Mshiriki hajulikani". Send the user to pick one. */}
        <button
          onClick={()=>navigate('/select-congregant')}
          style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:16,padding:'16px',display:'flex',alignItems:'center',gap:12,cursor:'pointer',textAlign:'left',width:'100%'}}
        >
          <div style={{width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,#00C9A7,#00A88C)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <HeartHandshake size={20} color="var(--color-on-accent)"/>
          </div>
          <div style={{flex:1}}>
            <p style={{fontFamily:'Sora, sans-serif',fontWeight:700,fontSize:14,color:'var(--color-text)'}}>Rekodi Mchango Mpya</p>
            <p style={{fontFamily:'Sora, sans-serif',fontSize:11,color:'var(--color-text-muted)',marginTop:2}}>Chagua mshiriki kwanza</p>
          </div>
          <ChevronRight size={18} color="var(--color-text-muted)"/>
        </button>

        <div style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:16,overflow:'hidden'}}>
          <div style={{padding:'14px 16px',borderBottom:'1px solid var(--color-border)'}}>
            <h3 style={{fontFamily:'Sora, sans-serif',fontWeight:700,fontSize:13,color:'var(--color-text)'}}>Michango ya Hivi Karibuni</h3>
          </div>
          {contributions.length===0?(
            <div style={{padding:'32px',textAlign:'center',color:'var(--color-text-muted)',fontSize:13,fontFamily:'Sora, sans-serif'}}>Hakuna michango yoyote.</div>
          ):contributions.map((c,i)=>(
            <div key={c.id} style={{padding:'12px 16px',borderBottom:i<contributions.length-1?'1px solid var(--color-border)':'none',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
              <div style={{overflow:'hidden',flex:1}}>
                <p style={{fontFamily:'Sora, sans-serif',fontWeight:600,fontSize:13,color:'var(--color-text)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.congregants?.full_name||'Bila Jina'}</p>
                <p style={{fontFamily:'Sora, sans-serif',fontSize:12,color:'var(--color-text-muted)',marginTop:2}}>{new Date(c.created_at||new Date()).toLocaleDateString('sw-TZ')}</p>
              </div>
              <span style={{borderRadius:6,padding:'3px 10px',fontSize:12,fontWeight:700,fontFamily:'Sora, sans-serif',textTransform:'uppercase',letterSpacing:'0.04em',flexShrink:0,...typeStyle(c.type)}}>{c.type}</span>
              <p style={{fontFamily:'Sora, sans-serif',fontWeight:500,fontSize:13,color:'var(--color-text)',flexShrink:0}}>{Number(c.amount).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
