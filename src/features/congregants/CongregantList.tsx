import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, Search, ChevronRight, User as UserIcon, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { formatPhoneDisplay, normalizePhone } from '../../lib/phone';

interface ProcessedCongregant {
  id:string; full_name:string; phone:string;
  gender:'Mwanaume'|'Mwanamke'|null; churchName:string;
  total:number; zaka:number; sadaka:number; nyingine:number;
}

export default function CongregantList() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [congregants, setCongregants] = useState<ProcessedCongregant[]>([]);
  const [metrics, setMetrics] = useState({jumla:0,wanaume:0,wanawake:0});
  const [searchQuery, setSearchQuery] = useState('');
  // Which church the list is showing. null means every church this account may
  // see — for a pastor leading several, that is the combined roll.
  const [churches, setChurches] = useState<{id:string; name:string}[]>([]);
  const [selectedChurch, setSelectedChurch] = useState<string|null>(null);

  const getInit=(n:string)=>{if(!n)return'UN';const p=n.split(' ');return p.length>=2?`${p[0][0]}${p[1][0]}`.toUpperCase():p[0].substring(0,2).toUpperCase();};
  const shortName=(n:string)=>{if(!n)return'Haijulikani';let s=n;[/\bsda\s+church\b/i,/\bchurch\s+sda\b/i,/\bkanisa\s+la\s+wasabato\b/i,/\bkanisa\s+la\b/i,/\bkanisa\b/i,/\bwasabato\b/i,/\bchurch\b/i].forEach(r=>s=s.replace(r,''));return s.trim();};

  // The pastor's own churches, for the filter. Read from `churches` rather than
  // collected from the members already loaded: a church with no members yet
  // still has to be selectable, otherwise it silently vanishes from the filter.
  async function fetchChurches() {
    if (profile?.role !== 'pastor') { setChurches([]); return; }
    if (!profile.church_ids?.length) { setChurches([]); return; }
    const {data,error} = await supabase.from('churches').select('id,name').in('id',profile.church_ids).order('name');
    if (error) { console.error(error); return; }
    setChurches(data || []);
  }

  async function fetchCongregants() {
    try {
      let q = supabase.from('congregants').select('*,contributions(amount,type,payment_method),churches(name)');
      // The permission filter still applies underneath the chosen church, so a
      // stale or hand-edited selection cannot widen what this account can read.
      if(profile?.role==='pastor') q=profile.church_ids?.length?q.in('church_id',profile.church_ids):q.eq('church_id','00000000-0000-0000-0000-000000000000');
      else if(profile?.role==='mhazini'&&profile.church_id) q=q.eq('church_id',profile.church_id);
      else q=q.eq('church_id','00000000-0000-0000-0000-000000000000');
      if(selectedChurch) q=q.eq('church_id',selectedChurch);
      const {data:congs,error}=await q;
      if(error)throw error;
      if(congs){
        let wanaume=0,wanawake=0;
        const processed=congs.map(c=>{
          let zaka=0,sadaka=0,nyingine=0;
          if(c.contributions)c.contributions.forEach((x:any)=>{
            const a=Number(x.amount)||0;
            // `payment_method` carries the real category for anything outside
            // Zaka/Sadaka, and stored values are capitalised ('Zaka', not 'zaka')
            // — comparing against lowercase literals left every total at zero.
            const t=String(x.payment_method||x.type||'').trim().toLowerCase();
            if(t==='zaka')zaka+=a;else if(t==='sadaka')sadaka+=a;else nyingine+=a;
          });
          // Unset stays unset. This used to default to 'Mwanaume', which both
          // counted the member as a man and printed a gender chip nobody had
          // entered — invented data, and jinsia is an optional field.
          const gender=(c.gender==='Mwanaume'||c.gender==='Mwanamke')?c.gender:null;
          if(gender==='Mwanamke')wanawake++;else if(gender==='Mwanaume')wanaume++;
          return{id:c.id,full_name:c.full_name,phone:c.phone||'N/A',gender,churchName:shortName(c.churches?.name||''),total:zaka+sadaka+nyingine,zaka,sadaka,nyingine};
        });
        processed.sort((a,b)=>(a.full_name||'').localeCompare(b.full_name||''));
        setCongregants(processed);
        setMetrics({jumla:processed.length,wanaume,wanawake});
      }
    }catch(e){console.error(e);}
  }

  useEffect(()=>{fetchChurches();},[profile]);
  useEffect(()=>{fetchCongregants();},[profile,selectedChurch]);

  // A pastor who leads one church has nothing to choose between, and a mhazini
  // never had a choice to make.
  const showChurchFilter = profile?.role === 'pastor' && churches.length > 1;

  // Phone search compares NORMALISED digits on both sides. Numbers are stored
  // as 255754112233 but shown as 0754 112 233, so a treasurer reading the list
  // and typing what they see ("0754") would otherwise match nothing at all.
  // Normalising both makes every way of writing the number find the same row.
  const digits=searchQuery.replace(/[^0-9]/g,'');
  const filtered=congregants.filter(c=>{
    if(c.full_name.toLowerCase().includes(searchQuery.toLowerCase()))return true;
    if(!digits)return false;
    const stored=normalizePhone(c.phone);
    // Both forms: the raw digits typed ("754", "112233") and the same digits
    // read as a local number ("0754" -> "255754").
    return stored.includes(digits)||stored.includes(normalizePhone(searchQuery));
  });

  // The third arm is now "no jinsia recorded", so it is deliberately neutral
  // rather than another accent colour — nothing to signal, nothing to read into.
  const genderColor=(g:string|null)=>g==='Mwanamke'?{color:'var(--color-rose-on)',bg:'#FF6B8A15',border:'#FF6B8A30'}:g==='Mwanaume'?{color:'var(--color-violet-on)',bg:'#A78BFA15',border:'#A78BFA30'}:{color:'var(--color-text-muted)',bg:'var(--color-ink-800)',border:'var(--color-border)'};

  return (
    <div style={{background:'var(--color-ink)',minHeight:'100%',fontFamily:'Noto Sans, sans-serif'}}>

      {/* Header */}
      <div style={{padding:'24px 16px 16px',background:'linear-gradient(180deg,var(--color-ink-800) 0%,var(--color-ink) 100%)'}}>
        <p style={{color:'var(--color-text-muted)',fontSize:12,fontFamily:'Sora, sans-serif',letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:4}}>Usimamizi</p>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h1 style={{fontFamily:'Sora, sans-serif',fontWeight:800,fontSize:22,color:'var(--color-text)',letterSpacing:'-0.5px'}}>Washiriki</h1>
          <div style={{display:'flex',alignItems:'center',gap:6,background:'#00C9A715',borderRadius:10,padding:'6px 12px',border:'1px solid #00C9A730'}}>
            <Users size={14} color="var(--color-teal-on)"/>
            <span style={{fontFamily:'Sora, sans-serif',fontWeight:600,fontSize:13,color:'var(--color-teal-on)'}}>{metrics.jumla}</span>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8,marginBottom:16}}>
          {[
            {label:'Wanaume',value:metrics.wanaume,color:'var(--color-violet-on)',bg:'#A78BFA15'},
            {label:'Wanawake',value:metrics.wanawake,color:'var(--color-rose-on)',bg:'#FF6B8A15'},
          ].map(s=>(
            <div key={s.label} style={{background:s.bg,borderRadius:12,padding:'10px 8px',textAlign:'center',border:`1px solid ${s.color}25`}}>
              <p style={{fontFamily:'Sora, sans-serif',fontSize:18,fontWeight:700,color:s.color}}>{s.value}</p>
              <p style={{fontFamily:'Sora, sans-serif',fontSize:12,color:'var(--color-text-dim)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em'}}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Church filter — pastors leading more than one church */}
        {showChurchFilter && (
          <div style={{position:'relative',marginBottom:10}}>
            <Filter size={14} style={{position:'absolute',left:13,top:'50%',transform:'translateY(-50%)',color:'var(--color-text-muted)',pointerEvents:'none'}}/>
            <select
              value={selectedChurch || ''}
              onChange={e=>setSelectedChurch(e.target.value || null)}
              style={{width:'100%',background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:12,padding:'11px 14px 11px 38px',color:'var(--color-text)',fontSize:13,fontFamily:'Sora, sans-serif',fontWeight:600,outline:'none',boxSizing:'border-box',appearance:'none',cursor:'pointer'}}>
              <option value="">Makanisa Yote ({churches.length})</option>
              {churches.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronRight size={14} style={{position:'absolute',right:13,top:'50%',transform:'translateY(-50%) rotate(90deg)',color:'var(--color-text-muted)',pointerEvents:'none'}}/>
          </div>
        )}

        {/* Search */}
        <div style={{position:'relative'}}>
          <Search size={15} style={{position:'absolute',left:13,top:'50%',transform:'translateY(-50%)',color:'var(--color-text-muted)',pointerEvents:'none'}}/>
          <input type="text" placeholder="Tafuta kwa jina au namba ya simu..." value={searchQuery}
            onChange={e=>setSearchQuery(e.target.value)}
            style={{width:'100%',background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:12,padding:'11px 14px 11px 38px',color:'var(--color-text)',fontSize:13,fontFamily:'Noto Sans, sans-serif',outline:'none',boxSizing:'border-box'}} />
        </div>
      </div>

      {/* List */}
      <div style={{padding:'8px 16px 96px'}}>
        <p style={{fontFamily:'Sora, sans-serif',fontSize:11,color:'var(--color-text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>
          {filtered.length} washiriki
        </p>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {filtered.length>0?filtered.map(c=>{
            const gc=genderColor(c.gender);
            return(
              <button key={c.id} onClick={()=>navigate(`/congregants/${c.id}`)}
                style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:16,padding:'14px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,cursor:'pointer',textAlign:'left',width:'100%',transition:'border-color 0.15s'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='#2E3D62'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='var(--color-border)'}>
                <div style={{display:'flex',alignItems:'center',gap:12,overflow:'hidden',flex:1}}>
                  <div style={{width:44,height:44,borderRadius:14,background:`${gc.color}20`,color:gc.color,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Sora, sans-serif',fontWeight:800,fontSize:14,flexShrink:0,border:`1px solid ${gc.border}`}}>
                    {getInit(c.full_name)}
                  </div>
                  <div style={{overflow:'hidden',flex:1}}>
                    <p style={{fontFamily:'Sora, sans-serif',fontWeight:700,fontSize:14,color:'var(--color-text)',marginBottom:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.full_name}</p>
                    <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                      {c.gender&&(
                        <span style={{background:gc.bg,color:gc.color,border:`1px solid ${gc.border}`,borderRadius:5,padding:'1px 7px',fontSize:11,fontWeight:700,fontFamily:'Sora, sans-serif',textTransform:'uppercase',letterSpacing:'0.04em'}}>
                          {c.gender}
                        </span>
                      )}
                      {c.churchName&&(
                        <span style={{background:'#00C9A710',color:'var(--color-teal-on)',border:'1px solid #00C9A725',borderRadius:5,padding:'1px 7px',fontSize:11,fontWeight:700,fontFamily:'Sora, sans-serif',textTransform:'uppercase',letterSpacing:'0.04em'}}>
                          {c.churchName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{textAlign:'right',flexShrink:0,display:'flex',alignItems:'center',gap:8}}>
                  <div>
                    <p style={{fontFamily:'Sora, sans-serif',fontSize:13,fontWeight:700,color:'var(--color-teal-on)'}}>TZS {c.total.toLocaleString()}</p>
                    <p style={{fontFamily:'Sora, sans-serif',fontSize:12,color:'var(--color-text-muted)',marginTop:2}}>{formatPhoneDisplay(c.phone)||c.phone}</p>
                  </div>
                  <ChevronRight size={16} color="var(--color-text-muted)"/>
                </div>
              </button>
            );
          }):(
            <div style={{padding:'48px 16px',textAlign:'center',background:'var(--color-surface)',borderRadius:16,border:'1px solid var(--color-border)'}}>
              <Users size={32} color="var(--color-border)" style={{margin:'0 auto 8px'}}/>
              <p style={{color:'var(--color-text-muted)',fontSize:13,fontFamily:'Sora, sans-serif'}}>Hakuna mshiriki aliyepatikana</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
