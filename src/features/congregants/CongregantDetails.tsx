import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  ArrowLeft,
  MoreVertical,
  FileText,
  CalendarDays,
  Heart,
  Users,
  Phone,
  Mail,
  MapPin,
  Home,
  Plus,
  PencilLine,
  ChartNoAxesCombined,
  Trash2,
  UserRound,
  BriefcaseBusiness,
  Gift,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

function formatTZS(value: number) {
  return `TZS ${value.toLocaleString("en-US")}`;
}

function SummaryCard({ title, value, icon, bgColor, iconColor, subtitle }: any) {
  return (
    <div className={`p-4 rounded-2xl ${bgColor} border border-[var(--color-border)] flex flex-col justify-between`}>
      <div className="flex justify-between items-start mb-3">
        <span className="text-[var(--color-text-dim)] text-sm">{title}</span>
        <div style={{ color: iconColor }}>{icon}</div>
      </div>
      <div>
        <div className="font-bold text-lg text-[var(--color-text)]">{value}</div>
        <div className="text-[var(--color-text-muted)] text-xs mt-1">{subtitle}</div>
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3 items-center py-2 border-b border-[var(--color-border)] last:border-0 last:pb-0">
      <div className="text-purple-600">{icon}</div>
      <div>
        <div className="text-[var(--color-text-muted)] text-xs">{label}</div>
        <div className="text-[var(--color-text)] font-medium text-sm">{value || "-"}</div>
      </div>
    </div>
  );
}

export default function CongregantDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [congregant, setCongregant] = useState<any>(null);
  const [contributions, setContributions] = useState<any[]>([]);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!id || !profile) return;
      
      const { data: congData } = await supabase
        .from('congregants')
        .select('*')
        .eq('id', id)
        .single();
        
      if (!congData) {
        setHasAccess(false);
        return;
      }

      // Check access permission
      let allowed = false;
      if (profile.role === 'pastor') {
        allowed = profile.church_ids?.includes(congData.church_id) ?? false;
      } else if (profile.role === 'mhazini') {
        allowed = profile.church_id === congData.church_id;
      }

      if (!allowed) {
        setHasAccess(false);
        return;
      }

      setHasAccess(true);
      setCongregant(congData);

      const { data: contribData } = await supabase
        .from('contributions')
        .select('*')
        .eq('congregant_id', id)
        .order('created_at', { ascending: true });
      
      const normalized = (contribData || []).map(c => ({
        ...c,
        type: c.payment_method ? c.payment_method : c.type
      }));
      setContributions(normalized);
    }
    loadData();
  }, [id, profile]);

  const summary = useMemo(() => {
    return contributions.reduce((acc, c) => {
        const type = (c.type || '').toLowerCase();
        if (type === 'zaka') { acc.zaka += Number(c.amount); acc.zakaCount++; }
        else if (type === 'sadaka') { acc.sadaka += Number(c.amount); acc.sadakaCount++; }
        else { acc.nyingine += Number(c.amount); acc.nyingineCount++; }
        return acc;
    }, { zaka: 0, sadaka: 0, nyingine: 0, zakaCount: 0, sadakaCount: 0, nyingineCount: 0 });
  }, [contributions]);

  const [timeFrame, setTimeFrame] = useState<'this_month' | 'this_year'>('this_month');
  const [activeCategory, setActiveCategory] = useState<'all' | 'zaka' | 'sadaka'>('all');

  const chartData = useMemo(() => {
    const grouped: { [key: string]: { sortKey: string; month: string; zaka: number; sadaka: number; nyingine: number } } = {};
    
    const sortedContributions = [...contributions].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    sortedContributions.forEach(c => {
      const d = new Date(c.created_at);
      if (isNaN(d.getTime())) return;
      
      let sortKey = '';
      let displayLabel = '';

      if (timeFrame === 'this_month') {
        if (d.getFullYear() !== currentYear || d.getMonth() !== currentMonth) {
          return;
        }
        sortKey = `${String(d.getDate()).padStart(2, '0')}`;
        displayLabel = d.toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short' });
      } else {
        if (d.getFullYear() !== currentYear) {
          return;
        }
        sortKey = `${String(d.getMonth() + 1).padStart(2, '0')}`;
        displayLabel = d.toLocaleString('sw-TZ', { month: 'short' });
      }

      if (!grouped[sortKey]) {
        grouped[sortKey] = {
          sortKey,
          month: displayLabel,
          zaka: 0,
          sadaka: 0,
          nyingine: 0
        };
      }
      
      const type = (c.type || '').toLowerCase();
      if (type === 'zaka') {
        grouped[sortKey].zaka += Number(c.amount);
      } else if (type === 'sadaka') {
        grouped[sortKey].sadaka += Number(c.amount);
      } else {
        grouped[sortKey].nyingine += Number(c.amount);
      }
    });

    return Object.values(grouped).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [contributions, timeFrame]);

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this congregant?")) return;
    await supabase.from('congregants').delete().eq('id', id);
    navigate('/congregants');
  };

  if (hasAccess === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-[var(--color-surface)] rounded-3xl m-6 p-8 border border-[var(--color-border)] shadow-sm text-center font-sans">
        <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-lg">!</div>
        <h2 className="text-lg font-bold text-[var(--color-text)] mb-2">Ufikiaji Umekataliwa</h2>
        <p className="text-[var(--color-text-muted)] text-sm mb-6">Huna ruhusa ya kuona maelezo ya mshiriki huyu kwani hayupo kwenye ushirika wako.</p>
        <button onClick={() => navigate('/congregants')} className="bg-[#00C9A7] text-[var(--color-text)] font-semibold py-2.5 px-6 rounded-xl text-sm w-full max-w-[200px]">Rudi Washiriki</button>
      </div>
    );
  }

  if (!congregant) return <div className="p-4">Loading...</div>;

  return (
    <div className="min-h-screen bg-[var(--color-surface)] pb-20">
      {/* HEADER */}
      <div className="bg-[var(--color-ink)] text-[var(--color-text)] p-6 rounded-b-3xl shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <button onClick={() => navigate(-1)} className="text-[var(--color-text)]"><ArrowLeft size={24} /></button>
          <MoreVertical size={24} />
        </div>
        <div className="flex items-center gap-4">
            {congregant.photo_url ? (
                <img src={congregant.photo_url} alt={congregant.full_name} className="w-20 h-20 rounded-full border-2 border-white/20" />
            ) : (
                <div className="w-20 h-20 rounded-full bg-purple-400 flex items-center justify-center text-[var(--color-text)] font-bold text-2xl border-2 border-white/20">{getInitials(congregant.full_name)}</div>
            )}
          <div>
            <h1 className="text-2xl font-bold">{congregant.full_name}</h1>
            <p className="text-purple-200 text-sm flex items-center gap-1"><Phone size={14} /> Mshiriki</p>
            <div className="flex gap-2 mt-2">
              <span className="bg-purple-600 px-3 py-1 text-xs rounded-full">{congregant.gender || "N/A"}</span>
              <span className="bg-green-600 px-3 py-1 text-xs rounded-full">Active</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-6 pt-6">
        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-3 gap-3">
            <SummaryCard title="Zaka" value={formatTZS(summary.zaka)} icon={<ChartNoAxesCombined size={18} />} bgColor="bg-green-50" iconColor="#31A24C" subtitle={`Michango: ${summary.zakaCount}`} />
            <SummaryCard title="Sadaka" value={formatTZS(summary.sadaka)} icon={<Heart size={18} />} bgColor="bg-orange-50" iconColor="#FF9900" subtitle={`Michango: ${summary.sadakaCount}`} />
            <SummaryCard title="Nyingine" value={formatTZS(summary.nyingine)} icon={<Gift size={18} />} bgColor="bg-blue-50" iconColor="#3B82F6" subtitle={`Michango: ${summary.nyingineCount}`} />
        </div>

        {/* TOTAL */}
        <div className="bg-[var(--color-surface)] p-5 rounded-2xl shadow-sm border border-[var(--color-border)] flex justify-between items-center">
            <span className="text-[var(--color-text-dim)] font-medium">Jumla ya Michango: <span className="font-bold text-lg text-[var(--color-text)]">{formatTZS(summary.zaka + summary.sadaka + summary.nyingine)}</span></span>
        </div>

        {/* GRAPH & TRANSACTIONS */}
        <div className="bg-[var(--color-surface)] p-5 rounded-2xl shadow-sm border border-[var(--color-border)]">
            <div className="flex items-center justify-end gap-4 mb-5">
                {/* Visual selectors for Timeframe */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Choose timeframe (Mwezi Huu vs Mwaka Huu) */}
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                            type="button"
                            onClick={() => setTimeFrame('this_month')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${timeFrame === 'this_month' ? 'bg-[#00C9A7] text-[var(--color-text)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
                        >
                            Mwezi Huu
                        </button>
                        <button
                            type="button"
                            onClick={() => setTimeFrame('this_year')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${timeFrame === 'this_year' ? 'bg-[#00C9A7] text-[var(--color-text)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
                        >
                            Mwaka Huu
                        </button>
                    </div>
                </div>
            </div>

            {/* Category Filter Pills (To display one graph/line at a time or all) */}
            <div className="flex flex-wrap items-center gap-2 mb-6 pb-3 border-b border-[var(--color-border)]">
                <span className="text-[11px] text-[var(--color-text-muted)] font-extrabold uppercase tracking-widest mr-1">Michango:</span>
                <button
                    type="button"
                    onClick={() => setActiveCategory('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                        activeCategory === 'all'
                            ? 'bg-slate-950 text-[var(--color-text)] border-slate-950 shadow-sm'
                            : 'bg-[var(--color-surface)] text-[var(--color-text-dim)] border-[var(--color-border)] hover:bg-slate-50'
                    }`}
                >
                    <span className="w-2 h-2 rounded-full bg-gradient-to-r from-emerald-500 to-amber-500"></span>
                    Zote Mbili
                </button>
                <button
                    type="button"
                    onClick={() => setActiveCategory('zaka')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                        activeCategory === 'zaka'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-sm'
                            : 'bg-[var(--color-surface)] text-[var(--color-text-dim)] border-[var(--color-border)] hover:bg-slate-50'
                    }`}
                >
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Zaka Pekee
                </button>
                <button
                    type="button"
                    onClick={() => setActiveCategory('sadaka')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                        activeCategory === 'sadaka'
                            ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-sm'
                            : 'bg-[var(--color-surface)] text-[var(--color-text-dim)] border-[var(--color-border)] hover:bg-slate-50'
                    }`}
                >
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    Sadaka Pekee
                </button>
            </div>
            
            {chartData.length > 0 ? (
                <div className="w-full">
                    <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                            <XAxis 
                              dataKey="month" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 10, fill: '#64748B', fontWeight: 600 }}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 10, fill: '#64748B', fontWeight: 600 }}
                              tickFormatter={(val) => val >= 1000 ? `${val/1000}k` : val}
                            />
                            <Tooltip 
                              contentStyle={{ background: '#0F172A', borderRadius: '12px', border: 'none', color: '#FFF' }}
                              labelStyle={{ fontWeight: 'bold', color: '#A5B4FC' }}
                            />
                            {(activeCategory === 'all' || activeCategory === 'zaka') && (
                                <Line type="monotone" dataKey="zaka" stroke="#31A24C" strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 7 }} name="Zaka" />
                            )}
                            {(activeCategory === 'all' || activeCategory === 'sadaka') && (
                                <Line type="monotone" dataKey="sadaka" stroke="#FF9900" strokeWidth={3} dot={{ r: 5 }} activeDot={{ r: 7 }} name="Sadaka" />
                            )}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="py-12 text-center bg-[var(--color-surface)] rounded-xl border border-dashed border-[var(--color-border)]">
                    <p className="text-[12px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">Bado Hakuna Michango</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Bofya "Ongeza Mchango" hapo chini kurekodi mchango wa kwanza.</p>
                </div>
            )}
        </div>

        {/* INFO */}
        <div className="bg-[var(--color-surface)] p-5 rounded-2xl shadow-sm border border-[var(--color-border)]">
            <h2 className="font-bold text-lg mb-4 text-[var(--color-text)]">Taarifa ya Msingi</h2>
            <div className="grid grid-cols-2 gap-4">
                <InfoItem icon={<UserRound />} label="Jina Kamili" value={congregant.full_name} />
                <InfoItem icon={<Heart />} label="Hali ya Ndoa" value={
                  congregant.marital_status === 'single' ? 'Mseja' :
                  congregant.marital_status === 'married' ? 'Mwenzi' :
                  congregant.marital_status === 'widowed' ? 'Mjane' :
                  congregant.marital_status || 'Haijulikani'
                } />
                <InfoItem icon={<UserRound />} label="Jinsia" value={congregant.gender || 'Haijulikani'} />
                <InfoItem icon={<CalendarDays />} label="Umri" value={congregant.age ? `${congregant.age} Miaka` : 'Haijulikani'} />
                <InfoItem icon={<Users />} label="Jina la Mke/Mume" value={congregant.spouse_name} />
                <InfoItem icon={<Phone />} label="Namba ya Simu" value={congregant.phone} />
                <InfoItem icon={<Users />} label="Watoto" value={congregant.children_count} />
                <InfoItem icon={<Mail />} label="Barua pepe" value={congregant.email} />
                <InfoItem icon={<BriefcaseBusiness />} label="Kikundi/Idara" value={congregant.ministry} />
                <InfoItem icon={<Home />} label="Anuani ya Makazi" value={congregant.residence} />
                <InfoItem icon={<MapPin />} label="Tarehe ya Kujunga" value={congregant.joined_at} />
            </div>
        </div>

        {/* CONTRIBUTION RECORD LIST */}
        <div className="bg-[var(--color-surface)] p-5 rounded-2xl shadow-sm border border-[var(--color-border)]">
            <h2 className="font-bold text-lg mb-1 text-[var(--color-text)]">Kumbukumbu ya Michango</h2>
            <p className="text-[11px] text-[var(--color-text-muted)] mb-4 uppercase tracking-wider font-semibold">Historia ya malipo yaliyothibitishwa</p>

            {contributions.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-[var(--color-border)] text-[10px] text-[var(--color-text-muted)] uppercase font-black">
                                <th className="pb-2.5">Tarehe</th>
                                <th className="pb-2.5">Aina</th>
                                <th className="pb-2.5 text-right">Kiasi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {[...contributions].reverse().map((c) => (
                                <tr key={c.id} className="text-xs hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 font-semibold text-[var(--color-text-muted)]">
                                        {new Date(c.created_at).toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </td>
                                    <td className="py-3 font-bold">
                                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[9px] font-bold uppercase ${
                                            c.type?.toLowerCase() === 'zaka' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                            c.type?.toLowerCase() === 'sadaka' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                            'bg-blue-50 text-blue-700 border border-blue-100'
                                        }`}>
                                            {c.type || 'Nyingine'}
                                        </span>
                                    </td>
                                    <td className="py-3 text-right font-black text-[var(--color-text)]">
                                        {formatTZS(Number(c.amount))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-center py-6 text-[11px] text-[var(--color-text-muted)] font-bold uppercase tracking-wide">
                    Hakuna historia ya michango inayorandana kwa sasa.
                </div>
            )}
        </div>
      </div>

      {/* ACTIONS */}
      <div className="px-4 mt-8 pb-10">
          <div className="bg-[var(--color-surface)] rounded-2xl shadow-sm border border-[var(--color-border)] p-4 flex justify-around">
              <button onClick={() => navigate(`/record-contribution?congregantId=${id}`)} className="flex flex-col items-center gap-1 text-green-600"><Plus size={20} /> <span className="text-[10px]">Ongeza Mchango</span></button>
              <button className="flex flex-col items-center gap-1 text-purple-900"><PencilLine size={20} /> <span className="text-[10px]">Hariri</span></button>
              <button className="flex flex-col items-center gap-1 text-blue-600"><FileText size={20} /> <span className="text-[10px]">Ripoti</span></button>
              <button onClick={handleDelete} className="flex flex-col items-center gap-1 text-red-600"><Trash2 size={20} /> <span className="text-[10px]">Futa</span></button>
          </div>
      </div>

    </div>
  );
}
