import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Receipt, Save, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';

/**
 * The pre-printed header on a giving receipt: denomination, field, post box,
 * town, and the field/church split for combined offerings.
 *
 * Both pastor and treasurer may edit it — a treasurer is usually the person who
 * actually knows what the receipt book says. It lives in its own table rather
 * than on `churches` so that grant does not also hand over `pastor_id`.
 */

const FIELDS: Array<{
  key: string;
  label: string;
  hint: string;
  placeholder: string;
}> = [
  {
    key: 'denomination',
    label: 'Jina la Dhehebu',
    hint: 'Linaloandikwa juu kabisa ya stakabadhi.',
    placeholder: 'Seventh-day Adventist Church'
  },
  {
    key: 'field_name',
    label: 'Jina la Field / Konferensi',
    hint: 'Mfano: East-Coastal Tanzania Field.',
    placeholder: 'East-Coastal Tanzania Field'
  },
  {
    key: 'field_code',
    label: 'Kifupi cha Field',
    hint: 'Kinatumika kwenye jedwali la fedha, mfano "Sadaka ya Pamoja (ECTF)".',
    placeholder: 'ECTF'
  },
  {
    key: 'po_box',
    label: 'S. L. P. (P. O. Box)',
    hint: 'Namba ya sanduku la posta pekee.',
    placeholder: 'P. O. Box 105'
  },
  {
    key: 'location',
    label: 'Mahali (Mji / Wilaya)',
    hint: 'Huandikwa baada ya S. L. P.',
    placeholder: 'Bagamoyo'
  }
];

export default function ReceiptSettingsPage() {
  const navigate = useNavigate();
  const { profile, selectedChurchId, isReadOnly } = useAuth() as any;

  // A treasurer serves exactly one church; a pastor edits whichever is selected.
  const churchId = profile?.role === 'mhazini'
    ? profile?.church_id ?? null
    : selectedChurchId ?? profile?.church_id ?? null;

  const [form, setForm] = useState<Record<string, string>>({
    denomination: '',
    field_name: '',
    field_code: '',
    po_box: '',
    location: ''
  });
  const [fieldShare, setFieldShare] = useState<string>('58');
  const [churchName, setChurchName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!churchId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [chRes, stRes] = await Promise.all([
          supabase.from('churches').select('name').eq('id', churchId).maybeSingle(),
          supabase.from('church_receipt_settings').select('*').eq('church_id', churchId).maybeSingle()
        ]);

        setChurchName(chRes.data?.name || '');

        const s: any = stRes.data;
        if (s) {
          setForm({
            denomination: s.denomination || '',
            field_name: s.field_name || '',
            field_code: s.field_code || '',
            po_box: s.po_box || '',
            location: s.location || ''
          });
          if (s.field_share_percent !== null && s.field_share_percent !== undefined) {
            setFieldShare(String(s.field_share_percent));
          }
        }
      } catch (err: any) {
        setError('Imeshindwa kupakia mipangilio: ' + (err?.message || ''));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [churchId]);

  const shareNumber = parseFloat(fieldShare);
  const shareValid = !Number.isNaN(shareNumber) && shareNumber >= 0 && shareNumber <= 100;
  const churchShare = shareValid ? 100 - shareNumber : null;

  const handleSave = async () => {
    if (!churchId) return;
    if (!shareValid) {
      setError('Asilimia ya Field lazima iwe kati ya 0 na 100.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const { error: upErr } = await supabase.from('church_receipt_settings').upsert({
        church_id: churchId,
        denomination: form.denomination.trim() || null,
        field_name: form.field_name.trim() || null,
        field_code: form.field_code.trim() || null,
        po_box: form.po_box.trim() || null,
        location: form.location.trim() || null,
        field_share_percent: shareNumber,
        updated_at: new Date().toISOString(),
        updated_by: profile?.id ?? null
      });

      if (upErr) throw upErr;
      setSavedAt(Date.now());
    } catch (err: any) {
      setError(err?.message || 'Imeshindwa kuhifadhi mipangilio.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '11px 13px',
    borderRadius: 11,
    background: 'var(--color-ink)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
    fontFamily: 'Sora, sans-serif',
    fontSize: 14,
    outline: 'none'
  };

  const labelStyle: CSSProperties = {
    fontFamily: 'Sora, sans-serif',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--color-text)',
    display: 'block',
    marginBottom: 5
  };

  const hintStyle: CSSProperties = {
    fontFamily: 'Sora, sans-serif',
    fontSize: 11,
    color: 'var(--color-text-muted)',
    margin: '5px 0 0',
    lineHeight: 1.4
  };

  return (
    <div style={{ padding: 16, paddingBottom: 32 }}>
      <button
        onClick={() => navigate('/profile')}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none',
          color: 'var(--color-text-muted)', fontFamily: 'Sora, sans-serif', fontSize: 13,
          fontWeight: 600, cursor: 'pointer', padding: '4px 0', marginBottom: 14
        }}
      >
        <ArrowLeft size={16} /> Rudi
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 6 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 12,
          background: 'color-mix(in srgb, var(--color-gold) 15%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-gold)', flexShrink: 0
        }}>
          <Receipt size={19} />
        </div>
        <div>
          <h1 style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 18, color: 'var(--color-text)', margin: 0 }}>
            Mipangilio ya Stakabadhi
          </h1>
          {churchName && (
            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
              {churchName}
            </p>
          )}
        </div>
      </div>

      <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 12.5, color: 'var(--color-text-dim)', lineHeight: 1.55, margin: '12px 0 18px' }}>
        Taarifa hizi huonekana juu ya stakabadhi ya kila mshiriki kwenye programu ya washirika.
        Zinatofautiana kutoka kanisa moja hadi jingine, hivyo jaza zinazolingana na kitabu chenu cha stakabadhi.
      </p>

      {!churchId && (
        <div style={{
          background: 'color-mix(in srgb, var(--color-rose) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-rose) 25%, transparent)',
          borderRadius: 12, padding: 13, display: 'flex', gap: 9, marginBottom: 16
        }}>
          <AlertTriangle size={16} style={{ color: 'var(--color-rose)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 12.5, color: 'var(--color-text)', margin: 0, lineHeight: 1.5 }}>
            Hakuna kanisa lililochaguliwa. Chagua kanisa kwanza kisha rudi hapa.
          </p>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--color-text-muted)', fontFamily: 'Sora, sans-serif', fontSize: 13, padding: '20px 0' }}>
          <Loader2 size={16} className="animate-spin" /> Inapakia...
        </div>
      ) : churchId ? (
        <>
          {/* Live preview — what the member will actually see printed. */}
          <div style={{
            background: '#ffffff',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: 14,
            marginBottom: 20,
            textAlign: 'center'
          }}>
            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 9.5, fontWeight: 700, color: '#8a8a8a', textTransform: 'uppercase', letterSpacing: '0.09em', margin: '0 0 9px' }}>
              Mfano wa kichwa cha stakabadhi
            </p>
            <p style={{ fontFamily: 'Georgia, serif', fontSize: 14, fontWeight: 600, color: '#111', margin: 0, lineHeight: 1.35 }}>
              {form.denomination || 'Jina la Dhehebu'}
            </p>
            <p style={{ fontFamily: 'Georgia, serif', fontSize: 13, fontWeight: 700, color: '#111', margin: '2px 0 0', lineHeight: 1.35 }}>
              {form.field_name || 'Jina la Field'}
            </p>
            <p style={{ fontFamily: 'Georgia, serif', fontSize: 12.5, fontWeight: 600, color: '#111', margin: '2px 0 0', lineHeight: 1.35 }}>
              {[form.po_box || 'P. O. Box —', form.location].filter(Boolean).join(', ')}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label style={labelStyle} htmlFor={`rs-${f.key}`}>{f.label}</label>
                <input
                  id={`rs-${f.key}`}
                  type="text"
                  value={form[f.key]}
                  placeholder={f.placeholder}
                  disabled={isReadOnly}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  style={{ ...inputStyle, opacity: isReadOnly ? 0.55 : 1 }}
                />
                <p style={hintStyle}>{f.hint}</p>
              </div>
            ))}

            <div>
              <label style={labelStyle} htmlFor="rs-share">Mgawanyo wa Sadaka ya Pamoja (%)</label>
              <input
                id="rs-share"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={fieldShare}
                disabled={isReadOnly}
                onChange={(e) => setFieldShare(e.target.value)}
                style={{ ...inputStyle, opacity: isReadOnly ? 0.55 : 1 }}
              />
              <p style={hintStyle}>
                Sehemu inayokwenda Field. Kanisa hupata iliyobaki
                {churchShare !== null ? ` — kwa sasa Field ${shareNumber}%, Kanisa ${churchShare}%.` : '.'}
                {' '}Zaka huenda Field yote; Majengo hubaki kanisani.
              </p>
            </div>
          </div>

          {error && (
            <div style={{
              background: 'color-mix(in srgb, var(--color-rose) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-rose) 25%, transparent)',
              borderRadius: 12, padding: 12, marginTop: 16
            }}>
              <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 12.5, color: 'var(--color-rose-on)', margin: 0, lineHeight: 1.5 }}>
                {error}
              </p>
            </div>
          )}

          {savedAt && !error && (
            <div style={{
              background: 'color-mix(in srgb, var(--color-teal) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-teal) 25%, transparent)',
              borderRadius: 12, padding: 12, marginTop: 16, display: 'flex', gap: 8, alignItems: 'center'
            }}>
              <CheckCircle2 size={16} style={{ color: 'var(--color-teal)', flexShrink: 0 }} />
              <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 12.5, color: 'var(--color-teal-on)', margin: 0 }}>
                Imehifadhiwa. Washirika wataona mabadiliko wakifungua stakabadhi zao.
              </p>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || isReadOnly}
            style={{
              width: '100%', marginTop: 20, padding: '14px',
              borderRadius: 14, border: 'none',
              background: isReadOnly ? 'var(--color-surface)' : 'linear-gradient(135deg, #00C9A7, #00A88C)',
              color: isReadOnly ? 'var(--color-text-muted)' : 'var(--color-on-accent)',
              fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              cursor: saving || isReadOnly ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
            {saving ? 'Inahifadhi...' : 'Hifadhi Mipangilio'}
          </button>
        </>
      ) : null}
    </div>
  );
}
