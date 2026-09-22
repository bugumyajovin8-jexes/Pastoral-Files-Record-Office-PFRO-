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
  const { user, profile, refreshProfile } = useAuth();

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
      // The owner id comes from the session already in context.
      //
      // This used to call getUser() and then send `pastor_id: user?.id`. When
      // that returned no user — an expired token, a refresh that failed, a
      // phone with a bad connection — `pastor_id` was undefined. supabase-js
      // still lists the key in the `columns` parameter, but JSON.stringify
      // drops an undefined value, so the row reached Postgres with NO owner.
      //
      // Row-level security is evaluated before the NOT NULL constraint, so the
      // database answered "new row violates row-level security policy for
      // table churches" — a message that never mentions the missing id and
      // sends you hunting through roles, grants and policies instead. Verified
      // against a real database: an absent pastor_id produces exactly that
      // error, character for character.
      //
      // So: resolve it up front, and refuse to send the insert without one.
      const ownerId = user?.id ?? profile?.id ?? null;

      if (!ownerId) {
        setErrorMessage('Kipindi chako kimeisha. Tafadhali toka na uingie tena.');
        setLoading(false);
        return;
      }

      // The role is no longer checked here. Creating a church makes you its
      // pastor — see ensure_church_owner_is_pastor() in database/schema.sql —
      // so a client-side role test could only ever reject someone the database
      // would have accepted. A treasurer is still refused, by the policy.
      const { data: newChurches, error } = await supabase.from('churches').insert({
        name: name.trim(),
        pastor_id: ownerId
      }).select();

      if (error) {
        // Keep the full picture in the console, not in the pastor's face.
        //
        // "new row violates row-level security policy" is the same sentence for
        // several unrelated causes, and it never says which term was false — it
        // was reported for months against churches_insert when the failing
        // check was actually churches_select, applied to the RETURNING row that
        // the .select() below asks for. So log who the client thinks it is, and
        // ask the database who IT thinks is calling: when those disagree, that
        // disagreement is the whole bug.
        let dbView: unknown = 'unavailable';
        try {
          const { data: who, error: whoErr } = await supabase.rpc('whoami');
          dbView = whoErr ? `rpc-error:${whoErr.message}` : who;
        } catch (e: any) {
          dbView = `rpc-threw:${e?.message ?? e}`;
        }

        console.error('Church insert failed', {
          sent: { name: name.trim(), pastor_id: ownerId },
          session: user?.id ?? null,
          profile: { id: profile?.id ?? null, role: profile?.role ?? null },
          code: (error as any).code ?? null,
          databaseSaysCallerIs: dbView,
          error,
        });
        setErrorMessage(`Kuna tatizo kuhifadhi kanisa: ${error.message}`);
        setLoading(false);
        return;
      }

      if (newChurches && newChurches.length > 0) {
        const churchId = newChurches[0].id;
        const churchName = newChurches[0].name;
        
        // The trial licence is NOT created here any more.
        //
        // This used to compute expires_at from the device clock and insert the
        // row from the browser, so anyone holding the anon key could grant
        // themselves any expiry they liked. A trigger on `churches` now issues
        // it using the server clock, and RLS forbids clients from writing the
        // licences table at all. See database/schema.sql (grant_trial_licence).
        // Same id, same reasoning — an undefined user_id here would fail the
        // user_churches policy just as opaquely.
        //
        // The user_churches mapping is NOT written here either.
        //
        // link_church_pastor() on `churches` files it in the same transaction
        // as the church itself, so by the time this code runs the row already
        // exists. The app used to insert it a second time, which collided with
        // the trigger's row on the (user_id, church_id) primary key and
        // reported "duplicate key value violates unique constraint" — a
        // failure message for a church that had in fact been created
        // correctly, mapping and all.
        //
        // Writing it from here was never safe anyway: it is a second request,
        // so it can fail on its own (it once did, with "permission denied for
        // table user_churches") and leave a church with no mapping. One
        // transaction, one owner of the write.
        //
        // What is still worth doing is READING it back. A partial success
        // reported as a whole one is worse than a clean failure, and this is
        // the check that tells the two apart without being able to cause
        // either.
        const { count: mapCount, error: mapErr } = await supabase
          .from('user_churches')
          .select('church_id', { count: 'exact', head: true })
          .eq('user_id', ownerId)
          .eq('church_id', churchId);

        // Instantly add to local list for snappy UI response
        setChurches(prev => [...prev, newChurches[0]].sort((a, b) => a.name.localeCompare(b.name)));

        if (mapErr || (mapCount ?? 0) === 0) {
          console.error('Church created, but the pastor mapping is missing:', { churchId, ownerId, mapErr });
          setErrorMessage(
            `Kanisa la "${churchName}" limesajiliwa, lakini kuunganisha akaunti yako na kanisa kumeshindikana. ` +
            `Baadhi ya sehemu za programu hazitaonyesha kanisa hili mpaka hili litatuliwe.`
          );
          setName('');
          await refreshProfile();
          window.dispatchEvent(new CustomEvent('supabase-sync-complete'));
          return;
        }

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
    setSuccessMessage(null);
    setErrorMessage(null);

    // `congregants.church_id` and `contributions.church_id` both reference this
    // row, so the delete would fail on a foreign key. Check first and explain,
    // rather than letting the user watch the row disappear and reappear.
    const { count, error: countErr } = await supabase
      .from('congregants')
      .select('id', { count: 'exact', head: true })
      .eq('church_id', id);

    if (countErr) {
      setErrorMessage('Imeshindikana kuthibitisha washiriki wa kanisa hili: ' + countErr.message);
      return;
    }

    if (count && count > 0) {
      setErrorMessage(
        `Kanisa la "${churchName}" lina washiriki ${count}. Wahamishe au wafute kwanza kabla ya kufuta kanisa.`
      );
      return;
    }

    if (!window.confirm(`Una uhakika unataka kufuta kanisa la "${churchName}"? Hatua hii hairudishwi.`)) return;

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
          <div className="note note-success mb-4 animate-fadeIn">
            <span className="shrink-0 mt-0.5 font-bold">✓</span>
            <div className="flex-1">
              <p className="font-semibold">Imefanikiwa!</p>
              <p className="text-[12px] opacity-90">{successMessage}</p>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="hover:opacity-80 font-bold shrink-0 text-[16px] px-1">×</button>
          </div>
        )}

        {errorMessage && (
          <div className="note note-error mb-4 animate-fadeIn">
            <span className="shrink-0 mt-0.5 font-bold">⚠️</span>
            <div className="flex-1">
              <p className="font-semibold">Hitilafu!</p>
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
            <ul className="divide-y divide-[var(--color-border)]">
              {churches.map((c) => (
                <li key={c.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-surface)] text-[var(--color-teal-on)] flex items-center justify-center shrink-0">
                      <Church size={14} />
                    </div>
                    <span className="font-medium text-[var(--color-text)]">{c.name}</span>
                  </div>
                  {profile?.role !== 'mhazini' && (
                    <button 
                      onClick={() => handleDelete(c.id, c.name)} 
                      className="btn-icon btn-icon-danger"
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
