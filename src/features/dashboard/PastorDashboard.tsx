import { useState, useEffect } from 'react';
import { Church, Users, HeartHandshake, Heart, ChevronRight, UserPlus, CreditCard, PieChart, User } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function PastorDashboard() {
  const [churchId, setChurchId] = useState<string | null>(null);
  const [churches, setChurches] = useState<{id: string, name: string}[]>([]);
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState({ churchesCount: 0, congregantsCount: 0, zakaAllTime: 0, sadakaAllTime: 0 });
  const [recentContributions, setRecentContributions] = useState<any[]>([]);
  const [chartDataState, setChartDataState] = useState<any[]>([]);
  const [dashboardTimeRange, setDashboardTimeRange] = useState('month');
  const [chartDisplayMode, setChartDisplayMode] = useState<'both'|'zaka'|'sadaka'>('both');
  const [trendStats, setTrendStats] = useState({ zakaCurrent:0, zakaPrevious:0, sadakaCurrent:0, sadakaPrevious:0 });

  useEffect(() => {
    async function fetchChurches() {
      let query = supabase.from('churches').select('id, name');
      if (profile?.role === 'pastor') {
        query = profile.church_ids?.length ? query.in('id', profile.church_ids) : query.eq('id','00000000-0000-0000-0000-000000000000');
      } else if (profile?.role === 'mhazini') {
        query = profile.church_id ? query.eq('id', profile.church_id) : query.eq('id','00000000-0000-0000-0000-000000000000');
      } else {
        query = query.eq('id','00000000-0000-0000-0000-000000000000');
      }
      const { data } = await query;
      if (data) { setChurches(data); if (data.length > 0 && !churchId) setChurchId(data[0].id); }
    }
    if (profile) fetchChurches();
    const h = () => { if (profile) fetchChurches(); };
    window.addEventListener('supabase-sync-complete', h);
    return () => window.removeEventListener('supabase-sync-complete', h);
  }, [profile]);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        let chQ = supabase.from('churches').select('*',{count:'exact',head:true});
        let cQ = supabase.from('congregants').select('*',{count:'exact',head:true});
        const applyFilter = (q: any) => {
          if (profile?.role==='pastor') return profile.church_ids?.length ? q.in(q===chQ?'id':'church_id', profile.church_ids) : q.eq(q===chQ?'id':'church_id','00000000-0000-0000-0000-000000000000');
          if (profile?.role==='mhazini') return profile.church_id ? q.eq(q===chQ?'id':'church_id', profile.church_id) : q.eq(q===chQ?'id':'church_id','00000000-0000-0000-0000-000000000000');
          return q.eq(q===chQ?'id':'church_id','00000000-0000-0000-0000-000000000000');
        };
        chQ = applyFilter(chQ); cQ = applyFilter(cQ);

        const now = new Date();
        let startDate: Date, prevStartDate: Date;
        if (dashboardTimeRange==='month') { startDate=new Date(now.getFullYear(),now.getMonth(),1); prevStartDate=new Date(now.getFullYear(),now.getMonth()-1,1); }
        else if (dashboardTimeRange==='quarter') { const q=Math.floor(now.getMonth()/3)*3; startDate=new Date(now.getFullYear(),q,1); prevStartDate=new Date(now.getFullYear(),q-3,1); }
        else { startDate=new Date(now.getFullYear(),0,1); prevStartDate=new Date(now.getFullYear()-1,0,1); }
        startDate.setHours(0,0,0,0); prevStartDate.setHours(0,0,0,0);

        let contribQ = supabase.from('contributions').select('amount,type,payment_method,created_at,church_id,congregant_id,congregants(id,full_name)').gte('created_at',prevStartDate.toISOString());
        if (churchId) contribQ=contribQ.eq('church_id',churchId);
        else if (profile?.role==='pastor'&&profile.church_ids?.length) contribQ=contribQ.in('church_id',profile.church_ids);
        else if (profile?.role==='mhazini'&&profile.church_id) contribQ=contribQ.eq('church_id',profile.church_id);
        else contribQ=contribQ.eq('church_id','00000000-0000-0000-0000-000000000000');

        const [{count:churchesCount},{count:congregantsCount},{data:rawC}] = await Promise.all([chQ,cQ,contribQ]);
        const allC = (rawC||[]).map(c=>({...c,type:c.payment_method?c.payment_method:c.type}));

        let zakaF=0,sadakaF=0,zakaP=0,sadakaP=0;
        const currentC: any[]=[];
        allC.forEach(c=>{
          const d=new Date(c.created_at), amt=Number(c.amount)||0;
          if(d>=startDate){ currentC.push(c); if(c.type==='Zaka')zakaF+=amt; else if(c.type==='Sadaka')sadakaF+=amt; }
          else { if(c.type==='Zaka')zakaP+=amt; if(c.type==='Sadaka')sadakaP+=amt; }
        });
        setMetrics({churchesCount:churchesCount||0,congregantsCount:congregantsCount||0,zakaAllTime:zakaF,sadakaAllTime:sadakaF});
        setTrendStats({zakaCurrent:zakaF,zakaPrevious:zakaP,sadakaCurrent:sadakaF,sadakaPrevious:sadakaP});

        let recQ=supabase.from('contributions').select('id,amount,type,payment_method,created_at,congregants(full_name),churches(name)');
        if(churchId) recQ=recQ.eq('church_id',churchId);
        else if(profile?.role==='pastor'&&profile.church_ids?.length) recQ=recQ.in('church_id',profile.church_ids);
        else if(profile?.role==='mhazini'&&profile.church_id) recQ=recQ.eq('church_id',profile.church_id);
        else recQ=recQ.eq('church_id','00000000-0000-0000-0000-000000000000');
        recQ=recQ.order('created_at',{ascending:false}).limit(4);
        const {data:recent}=await recQ;
        if(recent) setRecentContributions(recent.map(c=>({...c,type:c.payment_method?c.payment_method:c.type})));

        const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        let chartData: any[]=[];
        if(dashboardTimeRange==='month'){
          const days=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
          for(let i=1;i<=days;i++) chartData.push({month:`${i}`,zaka:0,sadaka:0,dayIdx:i});
          currentC.forEach(c=>{const d=new Date(c.created_at);if(d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()){const idx=d.getDate()-1;if(chartData[idx]){const v=Number(c.amount)||0;if(c.type==='Zaka')chartData[idx].zaka+=v;if(c.type==='Sadaka')chartData[idx].sadaka+=v;}}});
        } else if(dashboardTimeRange==='quarter'){
          const q=Math.floor(now.getMonth()/3)*3;
          chartData=[{month:months[q],zaka:0,sadaka:0,monthIdx:q},{month:months[q+1],zaka:0,sadaka:0,monthIdx:q+1},{month:months[q+2],zaka:0,sadaka:0,monthIdx:q+2}];
          currentC.forEach(c=>{const d=new Date(c.created_at),m=d.getMonth(),v=Number(c.amount)||0,t=chartData.find(i=>i.monthIdx===m);if(t){if(c.type==='Zaka')t.zaka+=v;if(c.type==='Sadaka')t.sadaka+=v;}});
        } else {
          chartData=months.map((m,i)=>({month:m,zaka:0,sadaka:0,monthIdx:i}));
          currentC.forEach(c=>{const d=new Date(c.created_at),m=d.getMonth(),v=Number(c.amount)||0;if(chartData[m]){if(c.type==='Zaka')chartData[m].zaka+=v;if(c.type==='Sadaka')chartData[m].sadaka+=v;}});
        }
        setChartDataState(chartData);
      } catch(err){ console.error(err); }
    }
    if(user&&profile) fetchDashboardData();
  }, [user,churchId,dashboardTimeRange,profile]);

  const fmt=(n:number)=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':n.toString();
  const fmtY=(v:number)=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}K`:v.toString();
  const getInit=(name:string)=>{if(!name)return'UN';const p=name.split(' ');return p.length>=2?`${p[0][0]}${p[1][0]}`.toUpperCase():p[0].substring(0,2).toUpperCase();};
  const fmtDate=(s:string)=>new Date(s).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  const rangeLabel=dashboardTimeRange==='month'?'Mwezi Huu':dashboardTimeRange==='quarter'?'Robo Hii':'Mwaka Huu';

  const trend = (() => {
    let cur=0,prev=0,title='';
    if(chartDisplayMode==='zaka'){cur=trendStats.zakaCurrent;prev=trendStats.zakaPrevious;title='Zaka';}
    else if(chartDisplayMode==='sadaka'){cur=trendStats.sadakaCurrent;prev=trendStats.sadakaPrevious;title='Sadaka';}
    else{cur=trendStats.zakaCurrent+trendStats.sadakaCurrent;prev=trendStats.zakaPrevious+trendStats.sadakaPrevious;title='Michango Yote';}
    const diff=cur-prev;
    const pct=prev>0?(diff/prev)*100:cur>0?100:0;
    return{cur,prev,diff,pct,up:diff>=0,title};
  })();

  const CustomTooltip=({active,payload,label}:any)=>{
    if(!active||!payload?.length)return null;
    return(
      <div style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:10,padding:'10px 14px',fontFamily:'Sora, sans-serif',fontSize:11}}>
        <p style={{color:'var(--color-text-dim)',marginBottom:6}}>{label}</p>
        {payload.map((p:any)=>(
          <p key={p.dataKey} style={{color:p.color,margin:'2px 0'}}>
            {p.dataKey==='zaka'?'Zaka':'Sadaka'}: TZS {Number(p.value).toLocaleString()}
          </p>
        ))}
      </div>
    );
  };

  const isMhazini = profile?.role === 'mhazini';

  const topMetrics = [
    ...(!isMhazini ? [{label:'Makanisa',value:metrics.churchesCount,icon:<Church size={18}/>,color:'#A78BFA',bg:'#A78BFA15',action:()=>navigate('/churches'), fullWidth: false}] : []),
    {label:'Washiriki',value:metrics.congregantsCount,icon:<Users size={18}/>,color:'#38BDF8',bg:'#38BDF815',action:()=>navigate('/congregants'), fullWidth: isMhazini},
  ];

  return (
    <div style={{background:'var(--color-ink)',minHeight:'100%',paddingBottom:24,fontFamily:'Noto Sans, sans-serif'}}>

      {/* Header */}
      <div style={{padding:'24px 20px 20px',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',top:-40,right:-40,width:160,height:160,borderRadius:'50%',background:'#00C9A708',pointerEvents:'none'}}/>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}>
          <div>
            <p style={{color:'var(--color-text-muted)',fontSize:11,fontFamily:'Sora, sans-serif',fontWeight:500,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:4}}>
              Pastoral Files Record Office
            </p>
            <h1 style={{color:'var(--color-text)',fontSize:20,fontWeight:800,fontFamily:'Sora, sans-serif',letterSpacing:'-0.5px',lineHeight:1.2}}>
              Karibu, {(profile?.full_name || user?.user_metadata?.full_name || user?.email || 'Mchungaji').split(' ')[0].split('@')[0]} 👋
            </h1>
          </div>
          {isMhazini ? (
            <div style={{background:'var(--color-surface)',color:'var(--color-text)',fontSize:11,padding:'8px 12px',borderRadius:10,border:'1px solid var(--color-border)',fontFamily:'Sora, sans-serif',fontWeight:600,alignSelf:'flex-start'}}>
              ⛪ {churches.length > 0 ? churches[0].name : 'Inapakia Kanisa...'}
            </div>
          ) : (
            <select value={churchId||''} onChange={e=>setChurchId(e.target.value||null)}
              style={{background:'var(--color-surface)',color:'var(--color-text)',fontSize:11,padding:'8px 12px',borderRadius:10,border:'1px solid var(--color-border)',fontFamily:'Sora, sans-serif',cursor:'pointer',flexShrink:0}}>
              <option value="">Makanisa Yote</option>
              {churches.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div style={{padding:'0 16px',display:'flex',flexDirection:'column',gap:16}}>

        {/* Metrics Grid */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          {topMetrics.map(m=>(
            <button key={m.label} onClick={m.action} style={{
              background:'var(--color-surface)',
              border:'1px solid var(--color-border)',
              borderRadius:16,
              padding:'16px 14px',
              textAlign:'left',
              cursor:'pointer',
              transition:'border-color 0.15s',
              gridColumn: m.fullWidth ? 'span 2' : 'auto'
            }}
              onMouseEnter={e=>(e.currentTarget.style.borderColor='#2E3D62')}
              onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--color-border)')}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                <div style={{width:36,height:36,borderRadius:10,background:m.bg,display:'flex',alignItems:'center',justifyContent:'center',color:m.color}}>{m.icon}</div>
                <ChevronRight size={14} color='var(--color-text-muted)'/>
              </div>
              <p style={{fontFamily:'Sora, sans-serif',fontSize:26,fontWeight:800,color:'var(--color-text)',lineHeight:1,marginBottom:4}}>{m.value}</p>
              <p style={{fontSize:11,color:'var(--color-text-muted)',fontFamily:'Sora, sans-serif',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>{m.label}</p>
            </button>
          ))}
          {[
            {label:`Zaka · ${rangeLabel}`,value:metrics.zakaAllTime,icon:<HeartHandshake size={18}/>,color:'#00C9A7',bg:'#00C9A715'},
            {label:`Sadaka · ${rangeLabel}`,value:metrics.sadakaAllTime,icon:<Heart size={18}/>,color:'#F5A623',bg:'#F5A62315'},
          ].map(m=>(
            <div key={m.label} style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:16,padding:'16px 14px'}}>
              <div style={{width:36,height:36,borderRadius:10,background:m.bg,display:'flex',alignItems:'center',justifyContent:'center',color:m.color,marginBottom:12}}>{m.icon}</div>
              <p style={{fontFamily:'Sora, sans-serif',fontSize:10,color:'var(--color-text-muted)',marginBottom:3,letterSpacing:'0.05em',fontWeight:700}}>TZS</p>
              <p style={{fontFamily:'Sora, sans-serif',fontSize:20,fontWeight:800,color:m.color,lineHeight:1,marginBottom:4}}>{fmt(m.value)}</p>
              <p style={{fontSize:10,color:'var(--color-text-muted)',fontFamily:'Sora, sans-serif',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>{m.label}</p>
            </div>
          ))}
        </div>

        {/* Chart Card */}
        <div style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:16,padding:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <h3 style={{fontFamily:'Sora, sans-serif',fontWeight:700,fontSize:13,color:'var(--color-text)'}}>Mwenendo wa Michango</h3>
            <select value={dashboardTimeRange} onChange={e=>setDashboardTimeRange(e.target.value)}
              style={{background:'var(--color-ink)',color:'var(--color-text-dim)',fontSize:10,padding:'5px 8px',borderRadius:8,border:'1px solid var(--color-border)',fontFamily:'Sora, sans-serif',cursor:'pointer'}}>
              <option value="month">Mwezi Huu</option>
              <option value="quarter">Robo Hii</option>
              <option value="year">Mwaka Mzima</option>
            </select>
          </div>

          {/* Mode pills */}
          <div style={{display:'flex',gap:6,marginBottom:12}}>
            {[['both','Vyote','var(--color-text)'],['zaka','Zaka','#00C9A7'],['sadaka','Sadaka','#F5A623']].map(([id,lbl,clr])=>(
              <button key={id} type="button" onClick={()=>setChartDisplayMode(id as any)}
                style={{padding:'4px 12px',borderRadius:20,fontSize:10,fontWeight:700,fontFamily:'Sora, sans-serif',cursor:'pointer',transition:'all 0.15s',
                  background:chartDisplayMode===id?`${clr}20`:'transparent',
                  color:chartDisplayMode===id?clr:'var(--color-text-muted)',
                  border:chartDisplayMode===id?`1px solid ${clr}40`:'1px solid var(--color-border)'}}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Trend indicator */}
          <div style={{background:'var(--color-ink)',borderRadius:10,padding:'10px 12px',marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center',border:'1px solid var(--color-border)'}}>
            <div>
              <p style={{fontSize:10,color:'var(--color-text-muted)',fontFamily:'Sora, sans-serif',marginBottom:2,fontWeight:600}}>{trend.title}</p>
              <p style={{fontFamily:'Sora, sans-serif',fontSize:13,fontWeight:700,color:'var(--color-text)'}}>TZS {trend.cur.toLocaleString()}</p>
            </div>
            {trend.prev===0&&trend.cur===0?(
              <span style={{fontSize:10,color:'var(--color-text-muted)',fontFamily:'Sora, sans-serif'}}>— Hakuna Data</span>
            ):trend.up?(
              <div style={{textAlign:'right'}}>
                <span style={{display:'inline-block',background:'#00C9A715',color:'#00C9A7',borderRadius:6,padding:'3px 8px',fontSize:10,fontWeight:700,fontFamily:'Sora, sans-serif'}}>
                  ↑ +{trend.pct.toFixed(1)}%
                </span>
                <p style={{fontSize:9,color:'var(--color-text-muted)',fontFamily:'Sora, sans-serif',marginTop:2,fontWeight:500}}>+{fmt(trend.diff)}</p>
              </div>
            ):(
              <div style={{textAlign:'right'}}>
                <span style={{display:'inline-block',background:'#FF6B8A15',color:'#FF6B8A',borderRadius:6,padding:'3px 8px',fontSize:10,fontWeight:700,fontFamily:'Sora, sans-serif'}}>
                  ↓ {trend.pct.toFixed(1)}%
                </span>
                <p style={{fontSize:9,color:'var(--color-text-muted)',fontFamily:'Sora, sans-serif',marginTop:2,fontWeight:500}}>-{fmt(Math.abs(trend.diff))}</p>
              </div>
            )}
          </div>

          <div style={{height:150,marginLeft:-8}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartDataState} margin={{top:5,right:8,bottom:5,left:0}}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize:9,fill:'var(--color-text-muted)',fontFamily:'Sora, sans-serif'}} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize:9,fill:'var(--color-text-muted)',fontFamily:'Sora, sans-serif'}} tickFormatter={fmtY} dx={-4} />
                <Tooltip content={<CustomTooltip />} />
                {(chartDisplayMode==='both'||chartDisplayMode==='zaka')&&(
                  <Line type="monotone" dataKey="zaka" stroke="#00C9A7" strokeWidth={2} dot={{r:3,fill:'var(--color-ink)',stroke:'#00C9A7',strokeWidth:2}} activeDot={{r:4}} />
                )}
                {(chartDisplayMode==='both'||chartDisplayMode==='sadaka')&&(
                  <Line type="monotone" dataKey="sadaka" stroke="#F5A623" strokeWidth={2} dot={{r:3,fill:'var(--color-ink)',stroke:'#F5A623',strokeWidth:2}} activeDot={{r:4}} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h3 style={{fontFamily:'Sora, sans-serif',fontWeight:700,fontSize:12,color:'var(--color-text-dim)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:12}}>
            Vitendo vya Haraka
          </h3>
          <div style={{display:'grid',gridTemplateColumns:isMhazini?'repeat(3,1fr)':'repeat(5,1fr)',gap:8}}>
            {[
              {icon:<CreditCard size={20}/>,label:'Ripoti ya Fedha',color:'#A78BFA',bg:'#A78BFA15',action:()=>navigate('/financial-report')},
              {icon:<HeartHandshake size={20}/>,label:'Rekodi Mchango',color:'#00C9A7',bg:'#00C9A715',action:()=>navigate('/select-congregant')},
              {icon:<PieChart size={20}/>,label:'Angalia Ripoti',color:'#38BDF8',bg:'#38BDF815',action:()=>navigate('/reports')},
              ...(!isMhazini ? [
                {icon:<Church size={20}/>,label:'Simamia Makanisa',color:'#F5A623',bg:'#F5A62315',action:()=>navigate('/churches')},
                {icon:<User size={20}/>,label:'Simamia Mhazini',color:'#FF6B8A',bg:'#FF6B8A15',action:()=>navigate('/manage-mhazini')},
              ] : [])
            ].map((a,i)=>(
              <button key={i} onClick={a.action} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,cursor:'pointer',background:'none',border:'none',padding:0}}>
                <div style={{width:'100%',aspectRatio:'1',borderRadius:14,background:a.bg,border:`1px solid ${a.color}25`,display:'flex',alignItems:'center',justifyContent:'center',color:a.color,transition:'transform 0.1s'}}
                  onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.05)')}
                  onMouseLeave={e=>(e.currentTarget.style.transform='scale(1)')}>
                  {a.icon}
                </div>
                <span style={{fontSize:9,color:'var(--color-text-dim)',fontFamily:'Sora, sans-serif',fontWeight:600,textAlign:'center',lineHeight:1.3,wordBreak:'break-word'}}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent Contributions */}
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <h3 style={{fontFamily:'Sora, sans-serif',fontWeight:700,fontSize:13,color:'var(--color-text)'}}>Michango ya Hivi Karibuni</h3>
            <button onClick={()=>navigate('/finances')} style={{display:'flex',alignItems:'center',gap:4,color:'#00C9A7',fontSize:11,fontWeight:700,fontFamily:'Sora, sans-serif',background:'none',border:'none',cursor:'pointer'}}>
              Angalia yote <ChevronRight size={13}/>
            </button>
          </div>

          <div style={{background:'var(--color-surface)',border:'1px solid var(--color-border)',borderRadius:16,overflow:'hidden'}}>
            {recentContributions.length>0?recentContributions.map((c,i)=>(
              <div key={c.id} style={{padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:i<recentContributions.length-1?'1px solid var(--color-border)':'none'}}>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <div style={{
                    width:38,height:38,borderRadius:12,
                    background:c.type==='Zaka'?'#00C9A715':'#F5A62315',
                    color:c.type==='Zaka'?'#00C9A7':'#F5A623',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontFamily:'Sora, sans-serif',fontWeight:800,fontSize:13,flexShrink:0
                  }}>{getInit(c.congregants?.full_name)}</div>
                  <div>
                    <p style={{fontFamily:'Sora, sans-serif',fontWeight:600,fontSize:13,color:'var(--color-text)',marginBottom:2}}>{c.congregants?.full_name||'Bila Jina'}</p>
                    <p style={{fontFamily:'Sora, sans-serif',fontSize:10,color:'var(--color-text-muted)'}}>{fmtDate(c.created_at)}</p>
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  <p style={{fontFamily:'Sora, sans-serif',fontWeight:700,fontSize:13,color:c.type==='Zaka'?'#00C9A7':'#F5A623',marginBottom:2}}>
                    TZS {Number(c.amount).toLocaleString()}
                  </p>
                  <span style={{
                    display:'inline-block',padding:'2px 8px',borderRadius:6,fontSize:9,fontWeight:700,fontFamily:'Sora, sans-serif',textTransform:'uppercase',letterSpacing:'0.06em',
                    background:c.type==='Zaka'?'#00C9A715':'#F5A62315',
                    color:c.type==='Zaka'?'#00C9A7':'#F5A623',
                    border:`1px solid ${c.type==='Zaka'?'#00C9A730':'#F5A62330'}`
                  }}>{c.type}</span>
                </div>
              </div>
            )):(
              <div style={{padding:'32px 16px',textAlign:'center',color:'var(--color-text-muted)',fontSize:13,fontFamily:'Sora, sans-serif'}}>
                Hakuna michango ya hivi karibuni
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
