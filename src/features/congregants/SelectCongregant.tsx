import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Search, ChevronRight, X, Phone, Users, UserX, HeartHandshake } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { formatPhoneDisplay, normalizePhone } from '../../lib/phone';

interface Congregant {
  id: string;
  full_name: string;
  phone: string;
}

// Avatar tint, picked from the name so a given member always looks the same.
// Recognising a row by colour is faster than reading it, which is the whole
// point of a list you scroll every Sabbath.
const AVATAR_TINTS = ['teal', 'sky', 'violet', 'gold', 'rose'] as const;

function tintFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

function initialsOf(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function SelectCongregant() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [congregants, setCongregants] = useState<Congregant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCongregants() {
      if (!profile) return;
      setLoading(true);
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
      setLoading(false);
    }
    fetchCongregants();
  }, [profile]);

  // `phone` is nullable in the database, so guard both fields — an unguarded
  // .includes() on a null phone threw and blanked the whole list.
  const query = searchQuery.trim().toLowerCase();
  // Digits are matched against the NORMALISED number, not the stored text. The
  // list shows 0754 112 233 while the column holds 255754112233, so searching
  // for what is on screen has to still find the row it came from.
  const queryDigits = searchQuery.replace(/[^0-9]/g, '');
  const filteredCongregants = useMemo(
    () => congregants.filter(c => {
      if ((c.full_name || '').toLowerCase().includes(query)) return true;
      if (!queryDigits) return false;
      const stored = normalizePhone(c.phone);
      return stored.includes(queryDigits) || stored.includes(normalizePhone(searchQuery));
    }),
    [congregants, query, queryDigits, searchQuery]
  );

  // Page background must be --color-ink, not --color-surface: the cards below
  // are --color-surface, so on a matching background they were invisible apart
  // from a 1px border.
  return (
    <div className="bg-[var(--color-ink)] min-h-screen pb-24">

      {/* Header */}
      <div
        className="px-4 pt-10 pb-5"
        style={{ background: 'linear-gradient(180deg, var(--color-ink-800) 0%, var(--color-ink) 100%)' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 mb-3 bg-transparent border-0 cursor-pointer p-0"
          style={{ color: 'var(--color-text-dim)' }}
          aria-label="Rudi nyuma"
        >
          <ArrowLeft size={18} />
          <span style={{ fontFamily: 'Sora, sans-serif', fontSize: 12, fontWeight: 600 }}>Rudi</span>
        </button>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center shrink-0"
            style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#00C9A7,#00A88C)' }}
          >
            <HeartHandshake size={20} color="var(--color-on-accent)" />
          </div>
          <div className="min-w-0">
            <h1 style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--color-text)', letterSpacing: '-0.5px', margin: 0 }}>
              Chagua Mshiriki
            </h1>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
              Gonga jina la mshiriki kurekodi mchango wake
            </p>
          </div>
        </div>
      </div>

      <div className="px-4">

        {/* Search — sticky so it stays reachable on a long roll. */}
        <div
          className="sticky z-10 -mx-4 px-4 pt-1 pb-3"
          style={{ top: 0, background: 'var(--color-ink)' }}
        >
          <div className="relative">
            <Search
              size={18}
              className="absolute pointer-events-none"
              style={{ left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}
            />
            <input
              type="text"
              placeholder="Tafuta kwa jina au simu"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-dark has-icon"
              style={{ paddingRight: searchQuery ? 44 : 14 }}
              aria-label="Tafuta mshiriki"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Futa utafutaji"
                className="absolute flex items-center justify-center cursor-pointer"
                style={{
                  right: 8, top: '50%', transform: 'translateY(-50%)',
                  width: 30, height: 30, borderRadius: 8,
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-dim)',
                }}
              >
                <X size={15} />
              </button>
            )}
          </div>

          {!loading && congregants.length > 0 && (
            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', margin: '9px 2px 0', letterSpacing: '0.04em' }}>
              {query
                ? `Wamepatikana ${filteredCongregants.length} kati ya ${congregants.length}`
                : `Washiriki ${congregants.length}`}
            </p>
          )}
        </div>

        <div className="space-y-2 pt-1">

          {/* Skeletons, not a blank page: the list is a network round trip and an
              empty screen mid-flight reads as "no members". */}
          {loading && [0, 1, 2, 3, 4].map(i => (
            <div key={i} className="card p-3.5 flex items-center gap-3" style={{ opacity: 1 - i * 0.15 }}>
              <div style={{ width: 42, height: 42, borderRadius: 14, background: 'var(--color-ink-800)' }} />
              <div className="flex-1 min-w-0">
                <div style={{ height: 11, width: '55%', borderRadius: 5, background: 'var(--color-ink-800)' }} />
                <div style={{ height: 9, width: '32%', borderRadius: 5, background: 'var(--color-ink-800)', marginTop: 8 }} />
              </div>
            </div>
          ))}

          {/* Was a <div onClick>: not focusable, not keyboard-operable and
              invisible to screen readers. A real button also gets the focus
              ring and the 44px minimum height from index.css. */}
          {!loading && filteredCongregants.map(c => {
            const tint = tintFor(c.full_name || '');
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/record-contribution?congregantId=${c.id}`)}
                className="card w-full text-left p-3.5 flex items-center gap-3 cursor-pointer min-h-[68px] hover:border-[var(--color-ink-500)] transition-colors"
              >
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 42, height: 42, borderRadius: 14,
                    background: `color-mix(in srgb, var(--color-${tint}) 16%, transparent)`,
                    color: `var(--color-${tint}-on)`,
                    fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 14,
                    letterSpacing: '0.02em',
                  }}
                  aria-hidden="true"
                >
                  {initialsOf(c.full_name)}
                </div>

                <div className="flex flex-col min-w-0 flex-1">
                  <span className="truncate" style={{ fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: 14.5, color: 'var(--color-text)' }}>
                    {c.full_name}
                  </span>
                  <span className="flex items-center gap-1.5 mt-0.5" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {c.phone
                      ? <><Phone size={11} className="shrink-0" /> {formatPhoneDisplay(c.phone) || c.phone}</>
                      : <span style={{ fontStyle: 'italic' }}>Hakuna namba ya simu</span>}
                  </span>
                </div>

                <ChevronRight size={18} className="shrink-0" style={{ color: 'var(--color-text-muted)' }} />
              </button>
            );
          })}

          {/* Two different problems, two different answers. "Nothing found" when
              the roll is empty sends a treasurer hunting for a search bug. */}
          {!loading && filteredCongregants.length === 0 && (
            <div className="card flex flex-col items-center text-center px-6 py-10 mt-1">
              <div
                className="flex items-center justify-center mb-3"
                style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--color-ink-800)', color: 'var(--color-text-muted)' }}
              >
                {congregants.length === 0 ? <Users size={24} /> : <UserX size={24} />}
              </div>
              <p style={{ fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--color-text)', margin: 0 }}>
                {congregants.length === 0 ? 'Hakuna washiriki bado' : 'Hakuna aliyepatikana'}
              </p>
              <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: '6px 0 0', lineHeight: 1.5, maxWidth: 260 }}>
                {congregants.length === 0
                  ? 'Ongeza washiriki wa kanisa kwanza, kisha utaweza kurekodi michango yao hapa.'
                  : <>Hakuna mshiriki mwenye jina au namba inayofanana na “{searchQuery.trim()}”. Jaribu herufi chache zaidi.</>}
              </p>
              {congregants.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-4 cursor-pointer"
                  style={{
                    padding: '9px 16px', borderRadius: 10,
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    color: 'var(--color-text)', fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: 12.5,
                  }}
                >
                  Onyesha wote
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
