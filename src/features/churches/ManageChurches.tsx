import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Church, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export default function ManageChurches() {
  const [churches, setChurches] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { profile, refreshProfile } = useAuth();

  useEffect(() => {
    fetchChurches();
  }, [profile]);

  async function fetchChurches() {
    let query = supabase.from('churches').select('*').order('name');
    
    if (profile?.role === 'pastor') {
      if (profile.church_ids && profile.church_ids.length > 0) {
        query = query.in('id', profile.church_ids);
      } else {
        // pastor with no church yet, prevent querying other pastor's data
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      }
    } else if (profile?.role === 'mhazini') {
      if (profile.church_id) {
        query = query.eq('id', profile.church_id);
      } else {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      }
    } else {
      // unidentified or logged out
      query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    }

    const { data } = await query;
    if (data) setChurches(data);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    
    try {
      // Get current user to use as pastor_id
      const { data: { user } } = await supabase.auth.getUser();
      
      // Find user profile to check role
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id).single();
      
      if (!profile || profile.role !== 'pastor') {
          setLoading(false);
          setErrorMessage("Tatizo: Hujasajiliwa kama mchungaji kwenye mfumo.");
          return;
      }
      
      const { data: newChurches, error } = await supabase.from('churches').insert({ 
        name: name.trim(),
        pastor_id: user?.id 
      }).select();
      
      if (error) {
        setErrorMessage('Kuna tatizo kuhifadhi kanisa: ' + error.message);
        setLoading(false);
        return;
      }

      if (newChurches && newChurches.length > 0) {
        const churchId = newChurches[0].id;
        const churchName = newChurches[0].name;
        
        // Grant 14-day license for this new church
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 14);

        await Promise.all([
          supabase.from('user_churches').insert({
            user_id: user?.id,
            church_id: churchId,
            role_in_church: 'pastor'
          }),
          supabase.from('licenses').insert({
            church_id: churchId,
            church_name: churchName,
            status: 'active',
            expires_at: expiryDate.toISOString()
          })
        ]);

        // Instantly add to local list for snappy UI response
        setChurches(prev => [...prev, newChurches[0]].sort((a, b) => a.name.localeCompare(b.name)));
        
        setSuccessMessage(`Hongera! Kanisa la "${churchName}" limesajiliwa kikamilifu.`);
        setName('');
        
        // Refresh Auth Context to recognize new church access
        await refreshProfile();
        
        // Dispatch event to refresh profile church mappings in real-time across components
        window.dispatchEvent(new CustomEvent('supabase-sync-complete'));
      }
    } catch (err: any) {
      setErrorMessage('Kuna tatizo lisilojulikana: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, churchName: string) {
    if (!window.confirm(`Una uhakika unataka kufuta kanisa la "${churchName}"?`)) return;
    setSuccessMessage(null);
    setErrorMessage(null);

    // Optimistically filter from state
    setChurches(prev => prev.filter(c => c.id !== id));

    const { error } = await supabase.from('churches').delete().eq('id', id);
    if (error) {
      setErrorMessage('Imeshindikana kufuta kanisa: ' + error.message);
      fetchChurches(); // Rollback on error
    } else {
      setSuccessMessage(`Kanisa la "${churchName}" limefutwa kikamilifu.`);
      await refreshProfile();
      // Dispatch event to refresh profile church mappings in real-time
      window.dispatchEvent(new CustomEvent('supabase-sync-complete'));
    }
  }

  return (
    <div className="bg-[var(--color-ink)] font-sans flex flex-col h-full min-h-[100dvh]">
      <div className="px-4 pt-10 flex flex-col mb-4">
        <h1 className="text-[var(--color-text)] text-[24px] font-bold">Makanisa</h1>
        <p className="text-[var(--color-text-dim)] text-[12px]">Simamia orodha ya makanisa</p>
      </div>
      
      <div className="bg-[var(--color-ink)] rounded-t-[20px] flex-1 px-4 pt-6 pb-8 relative z-10 box-border">
        
        {/* Alerts section */}
        {successMessage && (
          <div className="mb-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[13px] flex items-start gap-2.5 animate-fadeIn">
            <span className="shrink-0 mt-0.5 font-bold">✓</span>
            <div className="flex-1">
              <p className="font-semibold text-emerald-300">Imefanikiwa!</p>
              <p className="text-[12px] opacity-90">{successMessage}</p>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="hover:opacity-80 font-bold shrink-0 text-[16px] px-1">×</button>
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[13px] flex items-start gap-2.5 animate-fadeIn">
            <span className="shrink-0 mt-0.5 font-bold">⚠️</span>
            <div className="flex-1">
              <p className="font-semibold text-rose-300">Hitilafu!</p>
              <p className="text-[12px] opacity-90">{errorMessage}</p>
            </div>
            <button onClick={() => setErrorMessage(null)} className="hover:opacity-80 font-bold shrink-0 text-[16px] px-1">×</button>
          </div>
        )}

        {profile?.role !== 'mhazini' && (
          <form onSubmit={handleAdd} className="bg-[var(--color-surface)] p-4 rounded-xl border border-[var(--color-border)] shadow-sm mb-6 flex flex-col gap-4">
            <h2 className="text-[14px] font-bold text-[var(--color-text)]">Ongeza Kanisa Jipya</h2>
            
            <div className="flex flex-col gap-1.5">
              <input 
                type="text" 
                required 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="Jina la kanisa (Mf. Kemange SDA Church)" 
                className="w-full border border-[var(--color-border)] p-2.5 text-[14px] rounded-[10px] focus:outline-none focus:border-[#00C9A7] focus:ring-1 focus:ring-[#00C9A7]/20 text-[var(--color-text)] bg-[var(--color-ink-800)]" 
              />
            </div>

            <button 
              type="submit"
              disabled={loading || !name.trim()} 
              className="w-full py-3 bg-[#00C9A7] hover:bg-[#00b294] text-[var(--color-text)] font-semibold rounded-xl flex items-center justify-center gap-2 text-[14px] shadow-sm transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              <span>{loading ? 'Inahifadhi...' : 'Hifadhi Kanisa'}</span>
            </button>
          </form>
        )}

        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden text-sm">
          <h2 className="text-[14px] font-bold text-[var(--color-text)] p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]/50">Orodha ya Makanisa</h2>
          {churches.length === 0 ? (
            <div className="p-6 text-center text-[var(--color-text-muted)]">
              Hakuna makanisa yaliyosajiliwa.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {churches.map((c) => (
                <li key={c.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-surface)] text-[#00C9A7] flex items-center justify-center shrink-0">
                      <Church size={14} />
                    </div>
                    <span className="font-medium text-[var(--color-text)]">{c.name}</span>
                  </div>
                  {profile?.role !== 'mhazini' && (
                    <button 
                      onClick={() => handleDelete(c.id, c.name)} 
                      className="p-2 text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Futa kanisa"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>
    </div>
  );
}
