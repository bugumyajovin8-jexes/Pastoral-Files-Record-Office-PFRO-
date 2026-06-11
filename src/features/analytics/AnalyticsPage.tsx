import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { 
  Calendar, ChevronDown, Filter, Church, 
  HandCoins, Heart, Users, ArrowUp, ArrowDown,
  FileText, CalendarDays, BarChart2, Download
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Label
} from 'recharts';

export default function AnalyticsPage() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState('Muhtasari');
  const [loading, setLoading] = useState(true);
  const [selectedChurch, setSelectedChurch] = useState<string | null>(null);
  const [churches, setChurches] = useState<{id: string, name: string}[]>([]);
  const [metrics, setMetrics] = useState({ jumla: 0, zaka: 0, sadaka: 0, washiriki: 0, others: 0, kikundiData: {} });
  const [trendData, setTrendData] = useState<any[]>([]);
  const [donutData, setDonutData] = useState<any[]>([]);
  const [memberRecords, setMemberRecords] = useState<any[]>([]);
  const [churchRecords, setChurchRecords] = useState<any[]>([]);
  const [treasurerRecords, setTreasurerRecords] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Date/Time filter states
  const [timeRange, setTimeRange] = useState<string>('month'); // defaults to 'month'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Other contributions states
  const [otherContributionsList, setOtherContributionsList] = useState<{ type: string; total: number; count: number }[]>([]);
  const [showOthersDetail, setShowOthersDetail] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!profile) return;
      setLoading(true);
      try {
        // Fetch churches first to map names and prepare placeholders with permission check
        let chQuery = supabase.from('churches').select('id, name');
        if (profile.role === 'pastor') {
          if (profile.church_ids && profile.church_ids.length > 0) {
            chQuery = chQuery.in('id', profile.church_ids);
          } else {
            chQuery = chQuery.eq('id', '00000000-0000-0000-0000-000000000000');
          }
        } else if (profile.role === 'mhazini') {
          if (profile.church_id) {
            chQuery = chQuery.eq('id', profile.church_id);
          } else {
            chQuery = chQuery.eq('id', '00000000-0000-0000-0000-000000000000');
          }
        } else {
          chQuery = chQuery.eq('id', '00000000-0000-0000-0000-000000000000');
        }

        const { data: churchesData } = await chQuery;
        const activeChurches = churchesData || [];
        setChurches(activeChurches);
        if (activeChurches.length > 0 && !selectedChurch) {
          setSelectedChurch(activeChurches[0].id);
        }

        let query = supabase
          .from('contributions')
          .select(`
            amount, 
            type, 
            payment_method, 
            created_at, 
            congregant_id, 
            church_id,
            recorded_by,
            congregants (
              id,
              full_name,
              "Kanisa ushirika ulipo",
              church_id
            ),
            profiles (
              full_name,
              email
            )
          `);
          
        if (selectedChurch) {
            query = query.eq('church_id', selectedChurch); 
        } else {
          if (profile.role === 'pastor' && profile.church_ids && profile.church_ids.length > 0) {
            query = query.in('church_id', profile.church_ids);
          } else if (profile.role === 'mhazini' && profile.church_id) {
            query = query.eq('church_id', profile.church_id);
          } else {
            query = query.eq('church_id', '00000000-0000-0000-0000-000000000000');
          }
        }

        // Apply Date/Time filter
        if (timeRange === 'today') {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          query = query.gte('created_at', d.toISOString());
        } else if (timeRange === 'yesterday') {
          const dStart = new Date();
          dStart.setDate(dStart.getDate() - 1);
          dStart.setHours(0, 0, 0, 0);
          const dEnd = new Date();
          dEnd.setDate(dEnd.getDate() - 1);
          dEnd.setHours(23, 59, 59, 999);
          query = query.gte('created_at', dStart.toISOString()).lte('created_at', dEnd.toISOString());
        } else if (timeRange === '7days') {
          const d = new Date();
          d.setDate(d.getDate() - 7);
          query = query.gte('created_at', d.toISOString());
        } else if (timeRange === '30days') {
          const d = new Date();
          d.setDate(d.getDate() - 30);
          query = query.gte('created_at', d.toISOString());
        } else if (timeRange === 'month') {
          const d = new Date();
          const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
          query = query.gte('created_at', firstDay.toISOString());
        } else if (timeRange === 'year') {
          const d = new Date();
          const firstDay = new Date(d.getFullYear(), 0, 1);
          query = query.gte('created_at', firstDay.toISOString());
        } else if (timeRange === 'custom') {
          if (customStartDate) {
            const start = new Date(customStartDate);
            start.setHours(0, 0, 0, 0);
            query = query.gte('created_at', start.toISOString());
          }
          if (customEndDate) {
            const end = new Date(customEndDate);
            end.setHours(23, 59, 59, 999);
            query = query.lte('created_at', end.toISOString());
          }
        }

        const { data: rawContributions, error } = await query;
        if (error) {
          console.error('Database query error:', error);
        }
        
        const contributions = (rawContributions || []).map(c => ({
          ...c,
          type: c.payment_method ? c.payment_method : c.type
        }));
        
        if (contributions && contributions.length > 0) {
          let totalZaka = 0;
          let totalSadaka = 0;
          let otherTotal = 0;
          const otherTypesMap: Record<string, { total: number; count: number }> = {};
          const uniqueContributors = new Set();
          const monthlyData: Record<string, { zaka: number; sadaka: number }> = {};
          const kikundiData: Record<string, number> = {};

          // Aggregations helpers
          const congregantAgg: Record<string, {
            id: string;
            name: string;
            churchName: string;
            kikundiName: string;
            zaka: number;
            sadaka: number;
            total: number;
            lastDate: string;
          }> = {};

          const churchAgg: Record<string, {
            id: string;
            name: string;
            zaka: number;
            sadaka: number;
            total: number;
            contributorsCount: Set<string>;
          }> = {};

          const treasurerAgg: Record<string, {
            id: string;
            name: string;
            email: string;
            recordsCount: number;
            totalAmount: number;
          }> = {};

          // Initialize aggregations for all churches
          const churchMap: Record<string, string> = {};
          activeChurches.forEach(ch => {
            churchMap[ch.id] = ch.name;
            churchAgg[ch.id] = {
              id: ch.id,
              name: ch.name,
              zaka: 0,
              sadaka: 0,
              total: 0,
              contributorsCount: new Set(),
            };
          });

          contributions.forEach(c => {
            const amount = Number(c.amount) || 0;
            const type = c.type;
            if (type === 'Zaka') {
              totalZaka += amount;
            } else if (type === 'Sadaka') {
              totalSadaka += amount;
            } else {
              otherTotal += amount;
              if (!otherTypesMap[type]) {
                otherTypesMap[type] = { total: 0, count: 0 };
              }
              otherTypesMap[type].total += amount;
              otherTypesMap[type].count += 1;
            }
            if (c.congregant_id) uniqueContributors.add(c.congregant_id);

            const date = new Date(c.created_at);
            const month = date.toLocaleString('default', { month: 'short' });
            if (!monthlyData[month]) {
              monthlyData[month] = { zaka: 0, sadaka: 0 };
            }
            if (type === 'Zaka') monthlyData[month].zaka += amount;
            if (type === 'Sadaka') monthlyData[month].sadaka += amount;

            // Group by kikundi / Kanisa ushirika ulipo
            const kikundiName = (c.congregants as any)?.["Kanisa ushirika ulipo"] || 'Wengine';
            kikundiData[kikundiName] = (kikundiData[kikundiName] || 0) + amount;

            // Group by Member
            const congregantId = c.congregant_id || 'unknown';
            const congregantName = (c.congregants as any)?.full_name || 'Mshiriki asiyejulikana';
            const churchName = churchMap[c.church_id] || 'Nje ya Ushirika';

            if (!congregantAgg[congregantId]) {
              congregantAgg[congregantId] = {
                id: congregantId,
                name: congregantName,
                churchName,
                kikundiName,
                zaka: 0,
                sadaka: 0,
                total: 0,
                lastDate: c.created_at,
              };
            }
            if (type === 'Zaka') congregantAgg[congregantId].zaka += amount;
            if (type === 'Sadaka') congregantAgg[congregantId].sadaka += amount;
            congregantAgg[congregantId].total += amount;
            if (new Date(c.created_at) > new Date(congregantAgg[congregantId].lastDate)) {
              congregantAgg[congregantId].lastDate = c.created_at;
            }

            // Group by Church
            const chId = c.church_id;
            if (chId && churchAgg[chId]) {
              if (type === 'Zaka') churchAgg[chId].zaka += amount;
              if (type === 'Sadaka') churchAgg[chId].sadaka += amount;
              churchAgg[chId].total += amount;
              if (c.congregant_id) churchAgg[chId].contributorsCount.add(c.congregant_id);
            }

            // Group by Treasurer
            const treasurerId = c.recorded_by || 'unknown';
            const treasurerName = (c.profiles as any)?.full_name || 'Mhazini';
            const treasurerEmail = (c.profiles as any)?.email || 'N/A';

            if (!treasurerAgg[treasurerId]) {
              treasurerAgg[treasurerId] = {
                id: treasurerId,
                name: treasurerName,
                email: treasurerEmail,
                recordsCount: 0,
                totalAmount: 0,
              };
            }
            treasurerAgg[treasurerId].recordsCount += 1;
            treasurerAgg[treasurerId].totalAmount += amount;
          });

          setMetrics({
            jumla: totalZaka + totalSadaka + otherTotal,
            zaka: totalZaka,
            sadaka: totalSadaka,
            washiriki: uniqueContributors.size,
            others: otherTotal,
            kikundiData
          } as any);

          // Save formatted list of other contributions
          const listOthers = Object.entries(otherTypesMap).map(([name, match]) => ({
            type: name,
            total: match.total,
            count: match.count
          })).sort((a, b) => b.total - a.total);
          setOtherContributionsList(listOthers);

          setMemberRecords(Object.values(congregantAgg).sort((a, b) => b.total - a.total));
          setChurchRecords(Object.values(churchAgg).sort((a, b) => b.total - a.total));
          setTreasurerRecords(Object.values(treasurerAgg).sort((a, b) => b.totalAmount - a.totalAmount));

          const colors = { Zaka: '#6A27E7', Sadaka: '#F37B1D' };
          setDonutData([
            { name: 'Zaka', value: totalZaka, color: colors.Zaka },
            { name: 'Sadaka', value: totalSadaka, color: colors.Sadaka }
          ]);

          const monthsOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const formattedTrendData = Object.keys(monthlyData)
            .sort((a, b) => monthsOrder.indexOf(a) - monthsOrder.indexOf(b))
            .map(month => ({
              name: month,
              zaka: monthlyData[month].zaka,
              sadaka: monthlyData[month].sadaka
            }));

          setTrendData(formattedTrendData.length ? formattedTrendData : [
            { name: 'Jan', zaka: 0, sadaka: 0 }
          ]);
        }
      } catch (err) {
        console.error('Error fetching analytics:', err);
      } finally {
        setLoading(false);
      }
    }
    if (profile) {
      fetchData();
    }
  }, [selectedChurch, timeRange, customStartDate, customEndDate, profile]);

  return (
    <div className="bg-[var(--color-ink)] font-sans flex flex-col h-full min-h-[100dvh]">
      {/* Header Area */}
      <div className="px-4 pt-10 flex flex-col">
        <div className="flex items-start justify-between mb-4">
          <div className="flex flex-col">
            <h1 className="text-[var(--color-text)] text-[24px] font-bold leading-tight tracking-wide mb-1">Ripoti</h1>
            <p className="text-[var(--color-text-dim)] text-[12px] font-normal leading-tight">
              Tazama takwimu na mwenendo wa Zaka na Sadaka
            </p>
          </div>
          <button className="flex items-center gap-1.5 bg-[var(--color-surface)]/10 hover:bg-[var(--color-surface)]/20 text-[var(--color-text)] rounded-[10px] px-3 py-2 text-[12px] font-medium transition-colors border border-white/10">
            <Calendar size={14} /> Kipindi
          </button>
        </div>

        {/* Tabs - Scrollable */}
        <div className="flex items-center gap-6 mt-1 overflow-x-auto scrollbar-hide">
          {(profile?.role === 'mhazini'
            ? ['Muhtasari', 'Mchango kwa Mshiriki']
            : ['Muhtasari', 'Mchango kwa Mshiriki', 'Makanisa', 'Mhazini']
          ).map((tab) => (
            <div 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap pb-2 border-b-[3px] cursor-pointer text-[14px] ${
                activeTab === tab 
                  ? 'text-[var(--color-text)] font-semibold border-white text-shadow-sm' 
                  : 'text-[var(--color-text-dim)] font-medium border-transparent hover:text-[var(--color-text)]'
              }`}
            >
              {tab}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-[var(--color-ink)] rounded-t-[20px] flex-1 px-4 pt-4 pb-8 relative z-10 box-border flex flex-col gap-4">
        
        {/* Filters Row - Stateful Date/Time Filter and Church Filter */}
        <div className="flex flex-col gap-2 pb-2 w-full relative z-20">
          <div className="flex items-center gap-1.5 w-full">
            <div className="flex items-center gap-1 flex-1 min-w-0 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] px-2.5 py-2 shadow-sm">
              <Calendar size={12} className="text-[#00C9A7] shrink-0" />
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="w-full text-[10px] font-semibold text-[var(--color-text-dim)] bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="all">Muda Wote (Zote)</option>
                <option value="today">Siku ya Leo</option>
                <option value="yesterday">Jana tu</option>
                <option value="7days">Siku 7 Zilizopita</option>
                <option value="30days">Siku 30 Zilizopita</option>
                <option value="month">Mwezi Huu</option>
                <option value="year">Mwaka Huu</option>
                <option value="custom">Chagua Tarehe Maalumu... 📅</option>
              </select>
            </div>
            
            {profile?.role === 'mhazini' ? (
              <div className="flex items-center justify-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] px-3 py-2 text-[10px] font-semibold text-[var(--color-text-dim)] shadow-sm shrink-0 min-w-[95px] sm:min-w-[115px]">
                ⛪ {churches.length > 0 ? churches[0].name : 'Inapakia...'}
              </div>
            ) : (
              <select 
                value={selectedChurch || ''} 
                onChange={(e) => setSelectedChurch(e.target.value || null)}
                className="flex items-center justify-between gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] px-2 py-2 text-[10px] font-semibold text-[var(--color-text-dim)] shadow-sm shrink-0 min-w-[95px] sm:min-w-[115px]"
              >
                <option value="">Makanisa Yote</option>
                {churches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {/* Custom Date Range Picker */}
          {timeRange === 'custom' && (
            <div className="flex items-center gap-2 bg-purple-50 p-2.5 rounded-[12px] border border-purple-100 flex-wrap sm:flex-nowrap shadow-inner animate-fadeIn">
              <div className="flex flex-col flex-1 min-w-[110px]">
                <span className="text-[8px] font-bold text-[var(--color-text-muted)] mb-0.5 uppercase tracking-wider">Kuanzia Tarehe</span>
                <input 
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[8px] px-2 py-1 text-[10px] font-medium focus:outline-none focus:border-[#00C9A7] w-full"
                />
              </div>
              <div className="flex flex-col flex-1 min-w-[110px]">
                <span className="text-[8px] font-bold text-[var(--color-text-muted)] mb-0.5 uppercase tracking-wider">Hadi Tarehe</span>
                <input 
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[8px] px-2 py-1 text-[10px] font-medium focus:outline-none focus:border-[#00C9A7] w-full"
                />
              </div>
              {(customStartDate || customEndDate) && (
                <button 
                  onClick={() => {
                    setCustomStartDate('');
                    setCustomEndDate('');
                  }}
                  className="self-end bg-gray-200 hover:bg-gray-300 text-[var(--color-text-dim)] font-bold px-2.5 py-1 text-[8px] uppercase tracking-wider rounded-md"
                >
                  Futa
                </button>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00C9A7]" />
            <p className="text-[12px] font-medium text-[var(--color-text-muted)]">Tunatayarisha ripoti...</p>
          </div>
        ) : (
          <>
            {activeTab === 'Muhtasari' && (
              <>
                {/* 4 Summary Cards Grid */}
                <div className="grid grid-cols-2 gap-3 mb-2">
                  {/* Card 1 */}
                  <div className="bg-[var(--color-surface)] rounded-[16px] p-3 shadow-sm border border-[var(--color-border)] flex flex-col gap-2 relative overflow-hidden flex-1">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[var(--color-surface)]" />
                    <div className="w-8 h-8 rounded-full bg-[#F3E8FF] text-[#00C9A7] flex items-center justify-center mb-1">
                      <Church size={16} />
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--color-text-muted)] font-medium leading-none mb-1.5">Jumla ya Mchango</p>
                      <p className="text-[14px] font-bold text-[var(--color-text)] leading-none mb-2">TZS {metrics.jumla.toLocaleString()}</p>
                      <p className="text-[9px] font-medium text-[var(--color-text-muted)] flex items-center gap-0.5">
                        Data halisi
                      </p>
                    </div>
                  </div>

                  {/* Card 2 */}
                  <div className="bg-[var(--color-surface)] rounded-[16px] p-3 shadow-sm border border-[var(--color-border)] flex flex-col gap-2 relative overflow-hidden flex-1">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#E5F9ED]" />
                    <div className="w-8 h-8 rounded-full bg-[#E5F9ED] text-[#08A452] flex items-center justify-center mb-1">
                      <HandCoins size={16} />
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--color-text-muted)] font-medium leading-none mb-1.5">Zaka (Jumla)</p>
                      <p className="text-[14px] font-bold text-[var(--color-text)] leading-none mb-2">TZS {metrics.zaka.toLocaleString()}</p>
                      <p className="text-[9px] font-medium text-[var(--color-text-muted)] flex items-center gap-0.5">
                        Data halisi
                      </p>
                    </div>
                  </div>

                  {/* Card 3 */}
                  <div className="bg-[var(--color-surface)] rounded-[16px] p-3 shadow-sm border border-[var(--color-border)] flex flex-col gap-2 relative overflow-hidden flex-1">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#FFF2E5]" />
                    <div className="w-8 h-8 rounded-full bg-[#FFF2E5] text-[#F37B1D] flex items-center justify-center mb-1">
                      <Heart size={16} />
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--color-text-muted)] font-medium leading-none mb-1.5">Sadaka (Jumla)</p>
                      <p className="text-[14px] font-bold text-[var(--color-text)] leading-none mb-2">TZS {metrics.sadaka.toLocaleString()}</p>
                      <p className="text-[9px] font-medium text-[var(--color-text-muted)] flex items-center gap-0.5">
                        Data halisi
                      </p>
                    </div>
                  </div>

                  {/* Card 4 (Michango Mingine) */}
                  <div 
                    onClick={() => setShowOthersDetail(!showOthersDetail)}
                    className="bg-[var(--color-surface)] hover:bg-[var(--color-surface)] cursor-pointer rounded-[16px] p-3 shadow-sm border border-[var(--color-border)] flex flex-col gap-2 relative overflow-hidden flex-1 transition-all hover:scale-[1.01]"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#E8F4FF]" />
                    <div className="w-8 h-8 rounded-full bg-[#E8F4FF] text-[#0074DB] flex items-center justify-center mb-1">
                      <FileText size={16} className="text-blue-500" />
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--color-text-muted)] font-medium leading-none mb-1.5">Michango Mingine</p>
                      <p className="text-[14px] font-bold text-[var(--color-text)] leading-none mb-2">
                        TZS {(metrics as any).others?.toLocaleString() || '0'}
                      </p>
                      <p className="text-[9px] font-bold text-[#0074DB] flex items-center gap-0.5">
                        Maelezo {showOthersDetail ? '▲' : '▼'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Other Contributions Breakout Drawer/Board inside */}
                {showOthersDetail && (
                  <div className="bg-blue-50 rounded-[16px] p-4 shadow-sm border border-blue-100 flex flex-col gap-3 animate-fadeIn">
                    <div className="flex justify-between items-center pb-1 border-b border-blue-200">
                      <h4 className="text-[11px] font-bold text-blue-900 flex items-center gap-1.5">
                        <FileText size={13} className="text-[#0074DB]" />
                        Mchanganuo wa Michango Mingine
                      </h4>
                      <button 
                        onClick={() => setShowOthersDetail(false)}
                        className="text-[10px] text-blue-800 hover:text-blue-900 font-bold px-1.5 py-0.5 rounded hover:bg-blue-100"
                      >
                        Funga ✕
                      </button>
                    </div>
                    
                    <div className="grid gap-2">
                      {otherContributionsList.length > 0 ? (
                        otherContributionsList.map((oc, idx) => (
                          <div key={idx} className="flex justify-between items-center text-[11px] p-2 bg-[var(--color-surface)] rounded-lg hover:shadow-sm transition-shadow">
                            <div className="flex flex-col">
                              <span className="font-bold text-[var(--color-text)]">{oc.type}</span>
                              <span className="text-[9px] text-[var(--color-text-muted)]">{oc.count} michango iliyorekodiwa</span>
                            </div>
                            <span className="font-mono font-bold text-[#0074DB]">TZS {oc.total.toLocaleString()}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-[10px] text-blue-500 py-3">
                          Hakuna michango mingine (kama vile Majengo au Makambi) iliyorekodiwa katika muda ulioteuliwa.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Trend Chart Area */}
                <div className="bg-[var(--color-surface)] rounded-[16px] p-4 shadow-sm border border-[var(--color-border)] flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[13px] font-bold text-[var(--color-text)]">
                      Mwenendo wa Mchango <span className="text-[var(--color-text-muted)] font-normal">(Kwa Mwezi)</span>
                    </h2>
                    <button className="flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[8px] px-2 py-1 text-[11px] font-medium text-[var(--color-text-dim)] shadow-sm shrink-0">
                      Mwaka Huu <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#00C9A7]"></div>
                      <span className="text-[11px] font-medium text-[var(--color-text-dim)]">Zaka</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#F37B1D]"></div>
                      <span className="text-[11px] font-medium text-[var(--color-text-dim)]">Sadaka</span>
                    </div>
                  </div>

                  <div className="h-[200px] w-full -ml-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#6B7280' }} 
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#6B7280' }} 
                          tickFormatter={(val) => `${val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : val}`}
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                          labelStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#374151' }}
                          itemStyle={{ fontSize: '12px' }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="zaka" 
                          stroke="#6A27E7" 
                          strokeWidth={2} 
                          dot={{ r: 3, fill: '#fff', stroke: '#6A27E7', strokeWidth: 2 }} 
                          activeDot={{ r: 5 }} 
                        />
                        <Line 
                          type="monotone" 
                          dataKey="sadaka" 
                          stroke="#F37B1D" 
                          strokeWidth={2} 
                          dot={{ r: 3, fill: '#fff', stroke: '#F37B1D', strokeWidth: 2 }} 
                          activeDot={{ r: 5 }} 
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Donut and Bar Charts row */}
                <div className="grid grid-cols-2 gap-3">
                  
                  {/* Donut Chart */}
                  <div className="bg-[var(--color-surface)] rounded-[16px] p-3 shadow-sm border border-[var(--color-border)] flex flex-col items-center">
                    <h2 className="text-[12px] font-bold text-[var(--color-text)] mb-2 self-start">Mchango kwa Aina</h2>
                    <div className="flex-1 w-full relative flex flex-col justify-center items-center min-h-[140px]">
                      <ResponsiveContainer width="100%" height={140}>
                        <PieChart>
                          <Pie
                            data={donutData}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={65}
                            paddingAngle={0}
                            dataKey="value"
                            stroke="none"
                          >
                            {donutData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                            <Label 
                              content={({ viewBox }) => {
                                const { cx, cy } = viewBox as any;
                                return (
                                  <g textAnchor="middle" x={cx} y={cy}>
                                    <text x={cx} y={cy - 8} className="text-[10px] font-bold fill-gray-900">TZS</text>
                                    <text x={cx} y={cy + 6} className="text-[12px] font-bold fill-gray-900">
                                      {metrics.jumla >= 1000000 ? (metrics.jumla / 1000000).toFixed(1) + 'M' : metrics.jumla.toLocaleString()}
                                    </text>
                                    <text x={cx} y={cy + 18} className="text-[8px] font-medium fill-gray-500">Jumla</text>
                                  </g>
                                );
                              }}
                            />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    
                    <div className="flex flex-col gap-1 w-full mt-1">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#00C9A7]"></div>
                          <span className="text-[9px] font-bold text-[var(--color-text)]">Zaka</span>
                        </div>
                        <p className="text-[9px] text-[var(--color-text-muted)] font-medium">
                          {metrics.jumla > 0 ? ((metrics.zaka / metrics.jumla) * 100).toFixed(0) : 0}% (TZS {metrics.zaka.toLocaleString()})
                        </p>
                      </div>

                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#F37B1D]"></div>
                          <span className="text-[9px] font-bold text-[var(--color-text)]">Sadaka</span>
                        </div>
                        <p className="text-[9px] text-[var(--color-text-muted)] font-medium">
                          {metrics.jumla > 0 ? ((metrics.sadaka / metrics.jumla) * 100).toFixed(0) : 0}% (TZS {metrics.sadaka.toLocaleString()})
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Bar Chart (Kikundi) */}
                  <div className="bg-[var(--color-surface)] rounded-[16px] p-3 shadow-sm border border-[var(--color-border)] flex flex-col">
                    <h2 className="text-[12px] font-bold text-[var(--color-text)] mb-3">Mchango kwa Kikundi / Ushirika</h2>
                    <div className="flex flex-col gap-3 justify-center flex-1">
                      {Object.entries((metrics as any).kikundiData || {}).map(([name, val]: [string, any], index) => {
                        const pct = metrics.jumla > 0 ? ((val / metrics.jumla) * 100).toFixed(0) : '0';
                        const colors = ['#6A27E7', '#08A452', '#F37B1D', '#0074DB', '#9CA3AF'];
                        const color = colors[index % colors.length];
                        return (
                          <div key={name} className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-[9px]">
                              <span className="text-[var(--color-text-dim)] font-medium truncate pr-1" title={name}>{name}</span>
                              <div className="flex gap-1 shrink-0">
                                <span className="font-bold text-[var(--color-text)]">TZS {val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : val.toLocaleString()}</span>
                                <span className="text-[var(--color-text-muted)]">{pct}%</span>
                              </div>
                            </div>
                            <div className="w-full bg-[var(--color-ink-800)] rounded-full h-1 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }}></div>
                            </div>
                          </div>
                        );
                      })}
                      {Object.keys((metrics as any).kikundiData || {}).length === 0 && (
                        <p className="text-[10px] text-[var(--color-text-muted)] text-center py-4">Hakuna data ya vikundi.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Reports Section */}
                <div className="bg-[var(--color-surface)] rounded-[16px] p-4 shadow-sm border border-[var(--color-border)] flex flex-col mb-6">
                  <h2 className="text-[13px] font-bold text-[var(--color-text)] mb-3">Taarifa za Haraka</h2>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* Report 1 */}
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[12px] p-3 flex flex-col shadow-sm h-[120px] justify-between relative overflow-hidden flex-1">
                      <div className="absolute top-0 left-0 w-1 h-full bg-[var(--color-surface)]" />
                      <div>
                        <div className="text-[#00C9A7] mb-2">
                          <FileText size={18} />
                        </div>
                        <h3 className="text-[11px] font-bold text-[var(--color-text)] mb-1">Ripoti ya Mwezi</h3>
                        <p className="text-[9px] text-[var(--color-text-muted)] leading-tight pr-2">Tazama ripoti ya mwezi huu</p>
                      </div>
                      <button className="text-[10px] font-bold text-[#00C9A7] text-left mt-2 self-start flex items-center pr-2">
                        Tazama <ChevronDown size={12} className="-rotate-90 ml-0.5"/>
                      </button>
                    </div>

                    {/* Report 2 */}
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[12px] p-3 flex flex-col shadow-sm h-[120px] justify-between relative overflow-hidden flex-1">
                      <div className="absolute top-0 left-0 w-1 h-full bg-[#E5F9ED]" />
                      <div>
                        <div className="text-[#08A452] mb-2">
                          <CalendarDays size={18} />
                        </div>
                        <h3 className="text-[11px] font-bold text-[var(--color-text)] mb-1">Ripoti ya Robo</h3>
                        <p className="text-[9px] text-[var(--color-text-muted)] leading-tight pr-2">Tazama ripoti ya robo mwaka</p>
                      </div>
                      <button className="text-[10px] font-bold text-[#08A452] text-left mt-2 self-start flex items-center pr-2">
                        Tazama <ChevronDown size={12} className="-rotate-90 ml-0.5"/>
                      </button>
                    </div>

                    {/* Report 3 */}
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[12px] p-3 flex flex-col shadow-sm h-[120px] justify-between relative overflow-hidden flex-1">
                      <div className="absolute top-0 left-0 w-1 h-full bg-[#FFF2E5]" />
                      <div>
                        <div className="text-[#F37B1D] mb-2">
                          <BarChart2 size={18} />
                        </div>
                        <h3 className="text-[11px] font-bold text-[var(--color-text)] mb-1">Ripoti ya Mwaka</h3>
                        <p className="text-[9px] text-[var(--color-text-muted)] leading-tight pr-2">Tazama ripoti ya mwaka mzima</p>
                      </div>
                      <button className="text-[10px] font-bold text-[#F37B1D] text-left mt-2 self-start flex items-center pr-2">
                        Tazama <ChevronDown size={12} className="-rotate-90 ml-0.5"/>
                      </button>
                    </div>

                    {/* Report 4 */}
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[12px] p-3 flex flex-col shadow-sm h-[120px] justify-between relative overflow-hidden flex-1">
                      <div className="absolute top-0 left-0 w-1 h-full bg-[#E8F4FF]" />
                      <div>
                        <div className="text-[#0074DB] mb-2">
                          <Download size={18} />
                        </div>
                        <h3 className="text-[11px] font-bold text-[var(--color-text)] mb-1">Pakua Ripoti</h3>
                        <p className="text-[9px] text-[var(--color-text-muted)] leading-tight pr-2">Pakua ripoti kama PDF / Excel</p>
                      </div>
                      <button className="text-[10px] font-bold text-[#0074DB] text-left mt-2 self-start flex items-center pr-2">
                        Pakua <ChevronDown size={12} className="-rotate-90 ml-0.5"/>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'Mchango kwa Mshiriki' && (
              <div className="bg-[var(--color-surface)] rounded-[16px] p-4 shadow-sm border border-[var(--color-border)] flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[13px] font-bold text-[var(--color-text)]">Mchango kwa kila Mshiriki</h2>
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tafuta mshiriki..."
                    className="border border-[var(--color-border)] rounded-[8px] px-2.5 py-1.5 text-[11px] font-medium focus:outline-none focus:border-[#00C9A7] w-full max-w-[150px] sm:max-w-[200px]"
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">
                        <th className="pb-2">Mshiriki</th>
                        <th className="pb-2">Kanisa na Ushirika</th>
                        <th className="pb-2 text-right">Zaka</th>
                        <th className="pb-2 text-right">Sadaka</th>
                        <th className="pb-2 text-right">Jumla</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-[11px]">
                      {memberRecords
                        .filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((record) => (
                          <tr key={record.id} className="hover:bg-[var(--color-surface)]/50">
                            <td className="py-2.5 font-medium text-[var(--color-text)]">{record.name}</td>
                            <td className="py-2.5 text-[var(--color-text-muted)]">
                              <div className="flex flex-col">
                                <span className="font-semibold">{record.churchName}</span>
                                <span className="text-[9px] text-[var(--color-text-muted)]">{record.kikundiName}</span>
                              </div>
                            </td>
                            <td className="py-2.5 text-right font-mono text-[var(--color-text-dim)]">TZS {record.zaka.toLocaleString()}</td>
                            <td className="py-2.5 text-right font-mono text-[var(--color-text-dim)]">TZS {record.sadaka.toLocaleString()}</td>
                            <td className="py-2.5 text-right font-mono font-bold text-[#00C9A7]">TZS {record.total.toLocaleString()}</td>
                          </tr>
                        ))}
                      {memberRecords.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-[var(--color-text-muted)]">
                            Hakuna data ya washiriki kupatikana.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'Makanisa' && (
              <div className="bg-[var(--color-surface)] rounded-[16px] p-4 shadow-sm border border-[var(--color-border)] flex flex-col gap-4">
                <h2 className="text-[13px] font-bold text-[var(--color-text)] mb-1">Mchango kwa Kila Kanisa</h2>
                <div className="grid gap-3">
                  {churchRecords.map((record) => (
                    <div key={record.id} className="border border-[var(--color-border)] bg-[var(--color-surface)]/30 rounded-[12px] p-3 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] font-bold text-[var(--color-text)]">{record.name}</span>
                        <span className="text-[10px] font-medium px-2 py-0.5 bg-purple-50 text-[#00C9A7] rounded-full">
                          {record.contributorsCount.size} Washiriki waliochangia
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-[var(--color-text-muted)]">Jumla ya Zaka</span>
                          <span className="text-[11px] font-mono font-bold text-[var(--color-text)]">TZS {record.zaka.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] text-[var(--color-text-muted)]">Jumla ya Sadaka</span>
                          <span className="text-[11px] font-mono font-bold text-[var(--color-text)]">TZS {record.sadaka.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] text-[var(--color-text-muted)]">Jumla Kuu</span>
                          <span className="text-[11px] font-mono font-bold text-[#00C9A7]">TZS {record.total.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {churchRecords.length === 0 && (
                    <p className="text-center text-[var(--color-text-muted)] py-8 text-[11px]">Hakuna data ya makanisa.</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'Mhazini' && (
              <div className="bg-[var(--color-surface)] rounded-[16px] p-4 shadow-sm border border-[var(--color-border)] flex flex-col gap-4">
                <h2 className="text-[13px] font-bold text-[var(--color-text)] mb-1">Takwimu za Wahazini</h2>
                <div className="grid gap-3">
                  {treasurerRecords.map((record) => (
                    <div key={record.id} className="border border-[var(--color-border)] bg-[var(--color-surface)]/30 rounded-[12px] p-3 flex items-center justify-between">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[12px] font-bold text-[var(--color-text)]">{record.name}</span>
                        <span className="text-[9px] text-[var(--color-text-muted)]">{record.email}</span>
                      </div>
                      <div className="text-right flex flex-col gap-0.5">
                        <span className="text-[11px] font-mono font-bold text-[#00C9A7]">TZS {record.totalAmount.toLocaleString()}</span>
                        <span className="text-[9px] text-[var(--color-text-muted)] font-medium">{record.recordsCount} Michango iliyorekodiwa</span>
                      </div>
                    </div>
                  ))}
                  {treasurerRecords.length === 0 && (
                    <p className="text-center text-[var(--color-text-muted)] py-8 text-[11px]">Hakuna data ya wahazini.</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}

