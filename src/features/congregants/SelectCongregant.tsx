import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Search, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface Congregant {
  id: string;
  full_name: string;
  phone: string;
}

export default function SelectCongregant() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [congregants, setCongregants] = useState<Congregant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchCongregants() {
      if (!profile) return;
      let query = supabase
        .from('congregants')
        .select('id, full_name, phone, church_id')
        .order('full_name');
        
      if (profile.role === 'pastor') {
        if (profile.church_ids && profile.church_ids.length > 0) {
          query = query.in('church_id', profile.church_ids);
        } else {
          query = query.eq('church_id', '00000000-0000-0000-0000-000000000000');
        }
      } else if (profile.role === 'mhazini') {
        if (profile.church_id) {
          query = query.eq('church_id', profile.church_id);
        } else {
          query = query.eq('church_id', '00000000-0000-0000-0000-000000000000');
        }
      } else {
        query = query.eq('church_id', '00000000-0000-0000-0000-000000000000');
      }

      const { data } = await query;
      if (data) setCongregants(data);
    }
    fetchCongregants();
  }, [profile]);

  const filteredCongregants = congregants.filter(c => 
    c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.phone.includes(searchQuery)
  );

  return (
    <div className="bg-[var(--color-surface)] min-h-screen pb-20">
      <div className="bg-[var(--color-ink)] px-4 pt-10 pb-6 text-[var(--color-text)]">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-[var(--color-text)]">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-[18px] font-semibold">Chagua Mshiriki</h1>
        </div>
      </div>
      
      <div className="px-4 py-4">
        <div className="relative mb-6">
          <Search className="absolute left-3 top-3.5 text-[var(--color-text-muted)]" size={18} />
          <input 
            type="text"
            placeholder="Tafuta mshiriki..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-[14px]"
          />
        </div>
        
        <div className="space-y-2">
          {filteredCongregants.map(c => (
            <div 
              key={c.id} 
              onClick={() => navigate(`/record-contribution?congregantId=${c.id}`)}
              className="bg-[var(--color-surface)] p-4 rounded-xl shadow-sm border border-[var(--color-border)] flex items-center justify-between cursor-pointer hover:bg-[var(--color-surface)]"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-[15px]">{c.full_name}</span>
                <span className="text-[12px] text-[var(--color-text-muted)]">{c.phone}</span>
              </div>
              <ChevronRight size={18} className="text-[var(--color-text-muted)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
