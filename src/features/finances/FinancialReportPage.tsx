import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  ArrowLeft, Calendar, Church, TrendingUp, Heart, 
  HandCoins, HelpCircle, Users, Search, DollarSign, ListFilter, Percent
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../auth/AuthContext';

interface IndividualReportItem {
  id: string;
  name: string;
  zaka: number;
  sadaka: number;
  fieldFunds: number;
  churchFunds: number;
  otherTotal: number;
  absoluteTotal: number;
  breakdown: { [type: string]: number };
}

export default function FinancialReportPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [selectedChurch, setSelectedChurch] = useState<string | null>(null);
  const [churches, setChurches] = useState<{ id: string; name: string }[]>([]);
  const [timeRange, setTimeRange] = useState<string>('month'); // month, quarter, year, custom, all
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'muhtasari' | 'historia'>('muhtasari');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [historyPeriodType, setHistoryPeriodType] = useState<'monthly' | 'yearly'>('monthly');

  const swahiliMonths: { [key: string]: string } = {
    '01': 'Januari',
    '02': 'Februari',
    '03': 'Machi',
    '04': 'Aprili',
    '05': 'Mei',
    '06': 'Juni',
    '07': 'Julai',
    '08': 'Agosti',
    '09': 'Septemba',
    '10': 'Oktoba',
    '11': 'Novemba',
    '12': 'Desemba'
  };

  const [report, setReport] = useState<{
    zakaTotal: number;
    sadakaTotal: number;
    otherCategories: { [name: string]: number };
    individualReports: IndividualReportItem[];
  }>({
    zakaTotal: 0,
    sadakaTotal: 0,
    otherCategories: {},
    individualReports: [],
  });

  const { profile } = useAuth();

  useEffect(() => {
    async function fetchChurches() {
      let query = supabase.from('churches').select('id, name');
      if (profile?.role === 'pastor') {
        if (profile.church_ids && profile.church_ids.length > 0) {
          query = query.in('id', profile.church_ids);
        } else {
          query = query.eq('id', '00000000-0000-0000-0000-000000000000');
        }
      } else if (profile?.role === 'mhazini') {
        if (profile.church_id) {
          query = query.eq('id', profile.church_id);
        } else {
          query = query.eq('id', '00000000-0000-0000-0000-000000000000');
        }
      } else {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      }
      const { data } = await query;
      if (data) {
        setChurches(data);
        if (data.length > 0 && !selectedChurch) {
          setSelectedChurch(data[0].id);
        }
      }
    }
    if (profile) {
      fetchChurches();
    }
  }, [profile]);

  useEffect(() => {
    async function fetchFinancialReport() {
      setLoading(true);
      try {
        const now = new Date();
        let startDate: Date | null = null;
        let endDate: Date | null = null;

        if (timeRange === 'month') {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (timeRange === 'quarter') {
          const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
          startDate = new Date(now.getFullYear(), qStartMonth, 1);
        } else if (timeRange === 'year') {
          startDate = new Date(now.getFullYear(), 0, 1);
        } else if (timeRange === 'custom') {
          if (customStartDate) {
            startDate = new Date(customStartDate);
            startDate.setHours(0, 0, 0, 0);
          }
          if (customEndDate) {
            endDate = new Date(customEndDate);
            endDate.setHours(23, 59, 59, 999);
          }
        }

        if (startDate) {
          startDate.setHours(0, 0, 0, 0);
        }

        let query = supabase.from('contributions')
          .select(`
            amount,
            type,
            payment_method,
            created_at,
            church_id,
            congregant_id,
            congregants ( id, full_name, "Kanisa ushirika ulipo" )
          `);

        if (startDate) {
          query = query.gte('created_at', startDate.toISOString());
        }
        if (endDate) {
          query = query.lte('created_at', endDate.toISOString());
        }
        if (selectedChurch) {
          query = query.eq('church_id', selectedChurch);
        } else {
          if (profile?.role === 'pastor' && profile.church_ids && profile.church_ids.length > 0) {
            query = query.in('church_id', profile.church_ids);
          } else if (profile?.role === 'mhazini' && profile.church_id) {
            query = query.eq('church_id', profile.church_id);
          } else {
            query = query.eq('church_id', '00000000-0000-0000-0000-000000000000');
          }
        }

        const { data: rawContributions, error } = await query;
        if (error) {
          console.error("Error fetching report data:", error);
        }

        const contributions = (rawContributions || []).map(c => ({
          ...c,
          type: c.payment_method ? c.payment_method : c.type
        }));

        let zakaTotal = 0;
        let sadakaTotal = 0;
        const otherCategories: { [name: string]: number } = {};
        const individualMap: { [id: string]: IndividualReportItem } = {};

        if (contributions && contributions.length > 0) {
          contributions.forEach((c) => {
            const amount = Number(c.amount) || 0;
            const type = c.type || 'Zinginezo';

            if (type === 'Zaka') {
              zakaTotal += amount;
            } else if (type === 'Sadaka') {
              sadakaTotal += amount;
            } else {
              otherCategories[type] = (otherCategories[type] || 0) + amount;
            }

            // Track individual congregant contribution
            const cId = c.congregant_id || 'anonymous_' + (c.congregants?.full_name || 'Anonymous');
            const cName = c.congregants?.full_name || 'Mshiriki Asiyejulikana';

            if (!individualMap[cId]) {
              individualMap[cId] = {
                id: cId,
                name: cName,
                zaka: 0,
                sadaka: 0,
                fieldFunds: 0,
                churchFunds: 0,
                otherTotal: 0,
                absoluteTotal: 0,
                breakdown: {},
              };
            }

            if (type === 'Zaka') {
              individualMap[cId].zaka += amount;
            } else if (type === 'Sadaka') {
              individualMap[cId].sadaka += amount;
            } else {
              individualMap[cId].otherTotal += amount;
              individualMap[cId].breakdown[type] = (individualMap[cId].breakdown[type] || 0) + amount;
            }
          });
        }

        // Apply formula 58% field / 42% local church for each individual
        Object.keys(individualMap).forEach((cId) => {
          const item = individualMap[cId];
          const z = item.zaka;
          const s = item.sadaka;

          item.fieldFunds = z + (s * 0.58);
          item.churchFunds = s * 0.42;
          
          // Absolute total includes: fieldFunds + churchFunds + other categories
          item.absoluteTotal = item.fieldFunds + item.churchFunds + item.otherTotal;
        });

        setReport({
          zakaTotal,
          sadakaTotal,
          otherCategories,
          individualReports: Object.values(individualMap).sort((a, b) => b.absoluteTotal - a.absoluteTotal),
        });

      } catch (err) {
        console.error("Error setting financial report:", err);
      } finally {
        setLoading(false);
      }
    }

    if (profile) {
      fetchFinancialReport();
    }
  }, [selectedChurch, timeRange, customStartDate, customEndDate, profile]);

  useEffect(() => {
    async function fetchHistoryData() {
      if (!profile) return;
      setHistoryLoading(true);
      try {
        let query = supabase.from('contributions')
          .select(`
            amount,
            type,
            payment_method,
            created_at,
            church_id
          `);

        if (selectedChurch) {
          query = query.eq('church_id', selectedChurch);
        } else {
          if (profile?.role === 'pastor' && profile.church_ids && profile.church_ids.length > 0) {
            query = query.in('church_id', profile.church_ids);
          } else if (profile?.role === 'mhazini' && profile.church_id) {
            query = query.eq('church_id', profile.church_id);
          } else {
            query = query.eq('church_id', '00000000-0000-0000-0000-000000000000');
          }
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) {
          console.error("Error fetching history data:", error);
        } else {
          setHistoryData(data || []);
        }
      } catch (err) {
        console.error("Error in fetchHistoryData:", err);
      } finally {
        setHistoryLoading(false);
      }
    }

    if (profile) {
      fetchHistoryData();
    }
  }, [selectedChurch, profile]);

  const getHistoryAggregates = () => {
    const monthlyMap: { [key: string]: { monthKey: string; zaka: number; sadaka: number; other: number; count: number } } = {};
    const yearlyMap: { [key: string]: { yearKey: string; zaka: number; sadaka: number; other: number; count: number } } = {};

    historyData.forEach(c => {
      const amount = Number(c.amount) || 0;
      const type = c.payment_method ? c.payment_method : (c.type || 'Zinginezo');
      
      const date = new Date(c.created_at);
      if (isNaN(date.getTime())) return;
      
      const year = date.getFullYear();
      const monthNum = String(date.getMonth() + 1).padStart(2, '0');
      
      const monthKey = `${year}-${monthNum}`;
      const yearKey = `${year}`;

      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = { monthKey, zaka: 0, sadaka: 0, other: 0, count: 0 };
      }
      if (!yearlyMap[yearKey]) {
        yearlyMap[yearKey] = { yearKey, zaka: 0, sadaka: 0, other: 0, count: 0 };
      }

      if (type === 'Zaka') {
        monthlyMap[monthKey].zaka += amount;
        yearlyMap[yearKey].zaka += amount;
      } else if (type === 'Sadaka') {
        monthlyMap[monthKey].sadaka += amount;
        yearlyMap[yearKey].sadaka += amount;
      } else {
        monthlyMap[monthKey].other += amount;
        yearlyMap[yearKey].other += amount;
      }

      monthlyMap[monthKey].count += 1;
      yearlyMap[yearKey].count += 1;
    });

    const sortedMonthly = Object.values(monthlyMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    const sortedYearly = Object.values(yearlyMap).sort((a, b) => b.yearKey.localeCompare(a.yearKey));

    return { monthly: sortedMonthly, yearly: sortedYearly };
  };

  // Labels for Swahili representation of range
  const rangeLabelSwahili = () => {
    switch (timeRange) {
      case 'month': return 'Mwezi Huu';
      case 'quarter': return 'Robo Mwaka';
      case 'year': return 'Mwaka Huu';
      case 'all': return 'Muda Wote';
      case 'custom': return 'Maalumu';
      default: return 'Mwezi Huu';
    }
  };

  const getOtherTotal = () => {
    return (Object.values(report.otherCategories) as number[]).reduce((a, b) => a + b, 0);
  };

  const globalFieldFunds = report.zakaTotal + (report.sadakaTotal * 0.58);
  const globalChurchFunds = report.sadakaTotal * 0.42;
  const globalAbsoluteTotal = globalFieldFunds + globalChurchFunds + getOtherTotal();

  const filteredIndividuals = report.individualReports.filter(ind => 
    ind.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-[var(--color-ink)] font-sans flex flex-col h-full min-h-[100dvh]">
      
      {/* Header Container */}
      <div className="px-4 pt-8 pb-3 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/')} 
            className="w-10 h-10 rounded-full bg-[var(--color-surface)]/10 hover:bg-[var(--color-surface)]/20 flex items-center justify-center transition-colors text-[var(--color-text)] cursor-pointer"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-[var(--color-text)] text-[20px] font-black leading-tight tracking-wide">Ripoti ya Kifedha</h1>
            <p className="text-[#CEB4FD] text-[11px] font-medium leading-none mt-1">Uchambuzi wa Formla ya Mgawo wa 58%/42% kulingana na kanuni</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex bg-[var(--color-surface)]/10 p-1 rounded-xl mt-1.5 self-start overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveTab('muhtasari')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'muhtasari' 
                ? 'bg-[var(--color-surface)] text-[#00C9A7] shadow-sm' 
                : 'text-[var(--color-text)]/80 hover:text-[var(--color-text)]'
            }`}
          >
            Muhtasari wa Fedha
          </button>
          <button
            onClick={() => setActiveTab('historia')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'historia' 
                ? 'bg-[var(--color-surface)] text-[#00C9A7] shadow-sm' 
                : 'text-[var(--color-text)]/80 hover:text-[var(--color-text)]'
            }`}
          >
            Historia
          </button>
        </div>
      </div>

      {/* Main Formatted Screen Panel */}
      <div className="bg-[var(--color-ink)] rounded-t-[20px] flex-1 px-4 pt-4 pb-8 flex flex-col gap-4">
        
        {/* Filters Panel */}
        <div className="bg-[var(--color-surface)] rounded-2xl p-3 border border-[var(--color-border)] shadow-sm flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5">
              <Calendar size={13} className="text-[#00C9A7]" />
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="w-full text-[11px] font-bold text-[var(--color-text-dim)] bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="month">Mwezi Huu</option>
                <option value="quarter">Robo Mwaka Hii</option>
                <option value="year">Mwaka Huu</option>
                <option value="all">Siku Zote (All Time)</option>
                <option value="custom">Chagua Tarehe... 📅</option>
              </select>
            </div>

            <div className="flex items-center gap-1 flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5">
              <Church size={13} className="text-[#F37B1D]" />
              {profile?.role === 'mhazini' ? (
                <span className="w-full text-[11px] font-bold text-[var(--color-text-dim)] bg-transparent truncate">
                  {churches.length > 0 ? churches[0].name : 'Inapakia...'}
                </span>
              ) : (
                <select
                  value={selectedChurch || ''}
                  onChange={(e) => setSelectedChurch(e.target.value || null)}
                  className="w-full text-[11px] font-bold text-[var(--color-text-dim)] bg-transparent focus:outline-none cursor-pointer truncate"
                >
                  <option value="">Makanisa Yote</option>
                  {churches.map((ch) => (
                    <option key={ch.id} value={ch.id}>{ch.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Custom Date Inputs if 'custom' range selected */}
          {timeRange === 'custom' && (
            <div className="grid grid-cols-2 gap-2 mt-1 p-2 bg-[#F4EFFF] rounded-xl border border-[#DFCEFD] animate-fadeIn">
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-[#5A17D7] mb-1">Tarehe ya Kuanza:</span>
                <input 
                  type="date" 
                  value={customStartDate} 
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-1.5 text-[10px] font-bold focus:outline-none focus:border-[#00C9A7]"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-[#5A17D7] mb-1">Tarehe ya Mwisho:</span>
                <input 
                  type="date" 
                  value={customEndDate} 
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md p-1.5 text-[10px] font-bold focus:outline-none focus:border-[#00C9A7]"
                />
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
            <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-[#00C9A7]" />
            <p className="text-[12px] font-bold text-[var(--color-text-muted)]">Tunatayarisha hesabu...</p>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4"
          >
            {activeTab === 'muhtasari' && (
              <>
                {/* Global Indicator Cards */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-[#00C9A7]" />
                    <span className="text-[9px] text-[#00C9A7] font-extrabold block uppercase tracking-tight">Zaka</span>
                    <p className="text-[14px] font-black text-[var(--color-text)] mt-1">
                      {report.zakaTotal.toLocaleString()}
                    </p>
                    <span className="text-[8px] text-[var(--color-text-muted)] font-semibold block mt-0.5">TZS</span>
                  </div>

                  <div className="p-3 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-[#F37B1D]" />
                    <span className="text-[9px] text-[#F37B1D] font-extrabold block uppercase tracking-tight">Sadaka</span>
                    <p className="text-[14px] font-black text-[var(--color-text)] mt-1">
                      {report.sadakaTotal.toLocaleString()}
                    </p>
                    <span className="text-[8px] text-[var(--color-text-muted)] font-semibold block mt-0.5">TZS</span>
                  </div>

                  <div className="p-3 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-[#0074DB]" />
                    <span className="text-[9px] text-[#0074DB] font-extrabold block uppercase tracking-tight">Kategoria Nyingine</span>
                    <p className="text-[14px] font-black text-[var(--color-text)] mt-1">
                      {getOtherTotal().toLocaleString()}
                    </p>
                    <span className="text-[8px] text-[var(--color-text-muted)] font-semibold block mt-0.5">TZS</span>
                  </div>
                </div>

                {/* Mgawo Formula Display Banner */}
                <div className="bg-[var(--color-ink)] rounded-[24px] p-5 text-[var(--color-text)] border border-[#4314A8] shadow-md relative overflow-hidden">
                  <div className="absolute right-0 bottom-0 bg-[var(--color-surface)]/5 w-24 h-24 rounded-full translate-x-4 translate-y-4 flex items-center justify-center">
                    <Percent size={48} className="text-[var(--color-text)]/10" />
                  </div>

                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[10px] bg-[var(--color-surface)] text-[#00C9A7] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">
                      Uchambuzi wa Formula ya Mgawanyo
                    </span>
                    <span className="text-[10px] text-[var(--color-text-dim)] font-semibold">{rangeLabelSwahili()}</span>
                  </div>

                  <p className="text-[11px] text-[var(--color-text-dim)] leading-snug mb-4">
                    Kila sadaka ya mshiriki hugawanywa: <strong>58%</strong> hujumlishwa na Zaka yao kuwa mgawo wa <strong>Field (Jumla Kuu ya Field)</strong>, na <strong>42%</strong> iliyobaki inakuwa <strong>Jumla ya Kanisa (Mahali)</strong>.
                  </p>

                  <div className="grid grid-cols-1 gap-3.5 border-t border-white/10 pt-4">
                    {/* Field Split Calculation */}
                    <div className="flex justify-between items-center bg-[var(--color-surface)]/5 hover:bg-[var(--color-surface)]/10 p-3 rounded-xl transition-all border border-white/5">
                      <div>
                        <span className="text-[9px] text-[var(--color-text-dim)] font-medium block uppercase tracking-wider">Jumla ya Fedha ya Field</span>
                        <span className="text-[10px] text-emerald-300 font-bold">Zaka + (58% ya Sadaka)</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[17px] font-black text-emerald-400 font-mono block">
                          TZS {globalFieldFunds.toLocaleString()}
                        </span>
                        <span className="text-[8px] text-gray-300">({report.zakaTotal.toLocaleString()} + {(report.sadakaTotal * 0.58).toLocaleString()})</span>
                      </div>
                    </div>

                    {/* Church Split Calculation */}
                    <div className="flex justify-between items-center bg-[var(--color-surface)]/5 hover:bg-[var(--color-surface)]/10 p-3 rounded-xl transition-all border border-white/5">
                      <div>
                        <span className="text-[9px] text-[var(--color-text-dim)] font-medium block uppercase tracking-wider">Jumla ya Fedha ya Kanisa (Mahali)</span>
                        <span className="text-[10px] text-[#FFAC62] font-bold">42% ya Sadaka tu</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[17px] font-black text-[#FFAC62] font-mono block">
                          TZS {globalChurchFunds.toLocaleString()}
                        </span>
                        <span className="text-[8px] text-gray-300">({(report.sadakaTotal * 0.42).toLocaleString()})</span>
                      </div>
                    </div>

                    {/* Absolute Totals Check */}
                    <div className="flex justify-between items-center bg-[var(--color-surface)]/10 p-3.5 rounded-xl border border-white/20 mt-1">
                      <div>
                        <span className="text-[11px] text-[var(--color-text)] font-bold block uppercase tracking-wider">Absolute Total (Field + Kanisa)</span>
                        <span className="text-[9px] text-gray-300 italic">Mgawanyo huu halisi wa Zaka + Sadaka</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[19px] font-black text-[var(--color-text)] font-mono block">
                          TZS {(globalFieldFunds + globalChurchFunds).toLocaleString()}
                        </span>
                        <span className="text-[9px] text-gray-300">Sawa na Jumla kuu TZS {(report.zakaTotal + report.sadakaTotal).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Other Categories Detailed Card */}
                <div className="bg-[var(--color-surface)] rounded-2xl p-4 border border-[var(--color-border)] shadow-sm flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-[12px] font-black text-[var(--color-text)] uppercase tracking-tight flex items-center gap-1.5">
                      📂 Michango Nje ya Zaka & Sadaka
                    </h3>
                    <span className="text-[10px] font-bold text-[var(--color-text-muted)] font-mono">
                      Aina: {Object.keys(report.otherCategories).length}
                    </span>
                  </div>

                  <div className="grid gap-2.5">
                    {Object.keys(report.otherCategories).length > 0 ? (
                      Object.entries(report.otherCategories).map(([catName, catAmount]) => (
                        <div key={catName} className="flex justify-between items-center bg-[var(--color-surface)] px-3 py-2.5 rounded-xl border border-[var(--color-border)] hover:shadow-xs transition-shadow">
                          <div>
                            <span className="text-[11px] font-extrabold text-[var(--color-text)] block">{catName}</span>
                            <span className="text-[8px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">Kategoria Maalum</span>
                          </div>
                          <span className="text-[12px] font-mono font-bold text-gray-950">TZS {catAmount.toLocaleString()}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-[var(--color-text-muted)] text-center py-4">Hakuna michango ya ziada iliyopatikana mbali na kategoria kuu.</p>
                    )}
                  </div>
                </div>

                {/* Ultimate Income Total */}
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] text-emerald-800 font-bold uppercase tracking-wider block">Jumla Kuu ya Mapato Yote</span>
                    <span className="text-[9px] text-emerald-600 font-medium leading-none">Inajumuisha Formula zote + Mapato mengine yote</span>
                  </div>
                  <span className="text-[18px] font-black text-emerald-700 font-mono shrink-0">
                    TZS {globalAbsoluteTotal.toLocaleString()}
                  </span>
                </div>
              </>
            )}


            {activeTab === 'historia' && (
              <div className="flex flex-col gap-4">
                {/* Period Type Selection */}
                <div className="flex bg-[#F4EFFF] p-1.5 rounded-2xl border border-[#DFCEFD] self-start">
                  <button
                    onClick={() => setHistoryPeriodType('monthly')}
                    className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                      historyPeriodType === 'monthly'
                        ? 'bg-[#00C9A7] text-[var(--color-text)] shadow-sm'
                        : 'text-[#00C9A7] hover:bg-[var(--color-surface)]/50'
                    }`}
                  >
                    📅 Ripoti za Kila Mwezi
                  </button>
                  <button
                    onClick={() => setHistoryPeriodType('yearly')}
                    className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                      historyPeriodType === 'yearly'
                        ? 'bg-[#00C9A7] text-[var(--color-text)] shadow-sm'
                        : 'text-[#00C9A7] hover:bg-[var(--color-surface)]/50'
                    }`}
                  >
                    🏛️ Ripoti za Kila Mwaka
                  </button>
                </div>

                {historyLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00C9A7]" />
                    <p className="text-[11px] font-bold text-[var(--color-text-muted)]">Tunatayarisha historia...</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {(() => {
                      const { monthly, yearly } = getHistoryAggregates();
                      const currentList = historyPeriodType === 'monthly' ? monthly : yearly;

                      if (currentList.length === 0) {
                        return (
                          <div className="bg-[var(--color-surface)] rounded-2xl p-8 border border-[var(--color-border)] text-center text-[12px] text-[var(--color-text-muted)] shadow-sm">
                            Bado hakuna michango iliyorekodiwa katika historia ya {historyPeriodType === 'monthly' ? 'miezi' : 'miaka'}.
                          </div>
                        );
                      }

                      return currentList.map((item, index) => {
                        const totalZaka = item.zaka;
                        const totalSadaka = item.sadaka;
                        const totalOther = item.other;
                        
                        // Formula computation
                        const fieldPortion = totalZaka + (totalSadaka * 0.58);
                        const churchPortion = totalSadaka * 0.42;
                        const grandTotal = fieldPortion + churchPortion + totalOther;

                        let title = '';
                        if (historyPeriodType === 'monthly' && 'monthKey' in item) {
                          const [y, m] = item.monthKey.split('-');
                          title = `${swahiliMonths[m] || m} ${y}`;
                        } else if ('yearKey' in item) {
                          title = `Mwaka ${item.yearKey}`;
                        }

                        return (
                          <div 
                            key={index} 
                            className="bg-[var(--color-surface)] rounded-2xl p-4 border border-[var(--color-border)] shadow-sm flex flex-col gap-3 hover:border-[#DFCEFD] hover:shadow-md transition-all relative overflow-hidden"
                          >
                            <div className="absolute top-0 left-0 w-2 h-full bg-[#00C9A7]" />
                            
                            {/* Card Header */}
                            <div className="flex justify-between items-start pl-2">
                              <div>
                                <h4 className="text-[14px] font-black text-[var(--color-text)] leading-tight">{title}</h4>
                                <span className="text-[9px] font-bold text-purple-700 bg-purple-50 border border-purple-100 px-2.5 py-0.5 rounded-lg mt-1 inline-block uppercase tracking-wider">
                                  {item.count} {item.count === 1 ? 'Mchango' : 'Michango'}
                                </span>
                              </div>
                              <div className="text-right font-mono">
                                <span className="text-[14px] font-black text-[#00C9A7] block">
                                  TZS {grandTotal.toLocaleString()}
                                </span>
                                <span className="text-[8px] text-[var(--color-text-muted)] uppercase tracking-widest font-black leading-none block mt-0.5">Jumla Kuu</span>
                              </div>
                            </div>

                            {/* Contribution Sources */}
                            <div className="grid grid-cols-3 gap-2 pl-2 text-[10px] bg-[var(--color-surface)]/50 p-2.5 rounded-xl border border-[var(--color-border)]">
                              <div>
                                <span className="text-[var(--color-text-muted)] font-extrabold block uppercase tracking-tight text-[8px]">Zaka</span>
                                <strong className="text-[var(--color-text)] font-black font-mono">TZS {totalZaka.toLocaleString()}</strong>
                              </div>
                              <div>
                                <span className="text-[var(--color-text-muted)] font-extrabold block uppercase tracking-tight text-[8px]">Sadaka</span>
                                <strong className="text-[var(--color-text)] font-black font-mono">TZS {totalSadaka.toLocaleString()}</strong>
                              </div>
                              <div>
                                <span className="text-[var(--color-text-muted)] font-extrabold block uppercase tracking-tight text-[8px]">Zinginezo</span>
                                <strong className="text-[var(--color-text)] font-black font-mono">TZS {totalOther.toLocaleString()}</strong>
                              </div>
                            </div>

                            {/* Spit Share results according to 58%/42% rules */}
                            <div className="grid grid-cols-2 gap-2 pl-2">
                              <div className="bg-[#EFFFFA] p-2.5 rounded-xl border border-[#D5FAF0]">
                                <span className="text-[8px] text-teal-800 font-extrabold block uppercase tracking-tight">🏢 Mgawo wa Field (Zaka + 58% Sadaka)</span>
                                <span className="text-[11px] font-black text-teal-950 font-mono mt-0.5 block">
                                  TZS {fieldPortion.toLocaleString()}
                                </span>
                                <span className="text-[7.5px] text-teal-600 font-semibold block mt-1">Hadi 58% ya sadaka</span>
                              </div>

                              <div className="bg-[#FFF8F3] p-2.5 rounded-xl border border-[#FFE8DA]">
                                <span className="text-[8px] text-orange-850 font-extrabold block uppercase tracking-tight">⛪ Mgawo wa Kanisa (42% Sadaka)</span>
                                <span className="text-[11px] font-black text-orange-950 font-mono mt-0.5 block">
                                  TZS {churchPortion.toLocaleString()}
                                </span>
                                <span className="text-[7.5px] text-orange-600 font-semibold block mt-1">Mgawo wa mahali</span>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

      </div>
    </div>
  );
}
