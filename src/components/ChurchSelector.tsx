import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function ChurchSelector({ onChurchChange }: { onChurchChange: (id: string | null) => void }) {
  const [churches, setChurches] = useState<any[]>([]);

  useEffect(() => {
    async function fetchChurches() {
      const { data } = await supabase.from('churches').select('id, name');
      if (data) setChurches(data);
    }
    fetchChurches();
  }, []);

  return (
    <div className="relative">
      <select 
        onChange={(e) => onChurchChange(e.target.value === 'all' ? null : e.target.value)} 
        className="appearance-none bg-white border border-slate-200 text-slate-700 py-2.5 pl-4 pr-10 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-sm"
      >
        <option value="all">All Churches Overview</option>
        {churches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
      </div>
    </div>
  );
}
