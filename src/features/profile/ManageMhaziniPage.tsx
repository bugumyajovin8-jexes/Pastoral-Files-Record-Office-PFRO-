import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, UserPlus, Phone, Church, ShieldAlert, CheckCircle2,
  Trash2, Send, RefreshCw, Sparkles, AlertCircle, Edit2, X, Check, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { normalizePhone, formatPhoneDisplay, isValidPhone, PHONE_INVALID_MESSAGE } from '../../lib/phone';

interface TreasurerProfile {
  id: string;
  /** How this person is identified on screen: their number, or their address
   *  if they signed up before phone auth. Never blank. */
  contact: string;
  full_name: string | null;
  role: string;
  created_at: string;
  churchName?: string;
  churchId?: string;
}

interface Invitation {
  id: string;
  email: string | null;
  phone: string | null;
  role: string;
  invited_by: string;
  church_id: string;
  status: string;
  created_at: string;
  churchName?: string;
}

/** One label for a person, whichever identifier their account actually has.
 *  `email` is nullable now, so every read of it needs this — `p.email.split()`
 *  throws on a phone-only account, which is every new account. */
function contactOf(p: { phone?: string | null; email?: string | null } | null | undefined): string {
  if (!p) return '';
  const phone = formatPhoneDisplay(p.phone);
  if (phone) return phone;
  return p.email || '';
}

/** A display name when nothing better was ever recorded. */
function nameFrom(p: { phone?: string | null; email?: string | null } | null | undefined, fallback: string): string {
  const email = p?.email;
  if (email) return email.split('@')[0];
  const phone = formatPhoneDisplay(p?.phone);
  return phone || fallback;
}

export default function ManageMhaziniPage() {
  const { user, profile, isChurchWritable } = useAuth();
  const navigate = useNavigate();

  // Lists
  const [treasurers, setTreasurers] = useState<TreasurerProfile[]>([]);
  const [otherProfiles, setOtherProfiles] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [churches, setChurches] = useState<{ id: string; name: string }[]>([]);

  // Form State
  const [invitePhone, setInvitePhone] = useState('');
  const [selectedChurchId, setSelectedChurchId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Directly assign role form state
  const [promotingUserId, setPromotingUserId] = useState('');
  const [promotingChurchId, setPromotingChurchId] = useState('');
  const [isPromoting, setIsPromoting] = useState(false);

  // Modal State for editing church assignment
  const [editingTreasurer, setEditingTreasurer] = useState<TreasurerProfile | null>(null);
  const [newAssignedChurchId, setNewAssignedChurchId] = useState('');
  const [updatingAssignment, setUpdatingAssignment] = useState(false);

  // Notification States
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Diagnostic Logs
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [debugLogs, setDebugLogs] = useState<{
    currentUser: { id: string | undefined; email: string | undefined; phone: string | undefined; role: string; profile_role_table: string };
    churchesCount: number;
    churchesQueryError: any;
    churchesData: any[];
    profilesCount: number;
    profilesQueryError: any;
    profilesData: any[];
    userChurchesCount: number;
    userChurchesQueryError: any;
    userChurchesData: any[];
    filteredDetails: string[];
    invitationsCount: number;
    invitationsQueryError: any;
  } | null>(null);

  // Fetch initial data
  const fetchData = async () => {
    setLoading(true);
    const diagFilters: string[] = [];
    let curProfileRole = 'mshiriki';
    let churches_Data: any[] = [];
    let churches_Err: any = null;
    let profiles_Data: any[] = [];
    let profiles_Err: any = null;
    let uc_Data: any[] = [];
    let uc_Err: any = null;
    let inv_Err: any = null;

    try {
      console.log('[WHAZINI DIAGNOSTICS] Starting fetchData. Current Auth User:', user);

      // 0. Fetch the current logged-in user's profile role
      const { data: curProfile, error: profileRoleErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user?.id)
        .single();

      curProfileRole = curProfile?.role || 'mshiriki';
      console.log('[WHAZINI DIAGNOSTICS] profiles role for current user:', curProfile, 'Error:', profileRoleErr);

      // 1. Fetch Churches - filter by pastor_id if the user is a pastor
      let churchesQuery = supabase.from('churches').select('id, name, pastor_id');
      
      if (curProfileRole === 'pastor') {
        churchesQuery = churchesQuery.eq('pastor_id', user?.id);
        diagFilters.push(`Churches filtered by pastor_id = ${user?.id}`);
      } else {
        diagFilters.push(`Churches unfiltered (not pastor)`);
      }

      const { data: churchesData, error: churchesErr } = await churchesQuery.order('name');
      churches_Data = churchesData || [];
      churches_Err = churchesErr;
      console.log('[WHAZINI DIAGNOSTICS] Churches fetched:', churchesData, 'Error:', churchesErr);
      
      if (churchesErr) throw churchesErr;
      const churchesList = churchesData || [];
      setChurches(churchesList);

      // 2. Fetch All Profiles
      const { data: profilesData, error: profilesErr } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');

      profiles_Data = profilesData || [];
      profiles_Err = profilesErr;
      console.log('[WHAZINI DIAGNOSTICS] All Profiles fetched:', profilesData, 'Error:', profilesErr);

      if (profilesErr) throw profilesErr;

      // 3. Fetch user_churches entries to associate treasurers with current church assignments
      const { data: userChurchesData, error: userChurchesErr } = await supabase
        .from('user_churches')
        .select('user_id, church_id, role_in_church');

      uc_Data = userChurchesData || [];
      uc_Err = userChurchesErr;
      console.log('[WHAZINI DIAGNOSTICS] user_churches matches fetched:', userChurchesData, 'Error:', userChurchesErr);

      if (userChurchesErr) throw userChurchesErr;

      // 4. Fetch ALL matching invitations (not just pending, to reconcile accepted/pending emails of this pastor)
      const { data: invitesData, error: invitesErr } = await supabase
        .from('invitations')
        .select('*')
        .order('created_at', { ascending: false });

      inv_Err = invitesErr;
      console.log('[WHAZINI DIAGNOSTICS] All Invitations fetched:', invitesData, 'Error:', invitesErr);

      if (invitesErr) throw invitesErr;

      // Separate into active treasurers and other profiles
      const mappedTreasurers: TreasurerProfile[] = [];
      const mappedOthers: any[] = [];

      // We will loop through user_churches mapping to find all active treasurers for the pastor's churches
      const activeTreasurersInMyChurches = (userChurchesData || []).filter(uc => {
        const church = churchesList.find(c => c.id === uc.church_id);
        const isMyTreasurer = !!church && uc.role_in_church === 'mhazini';
        return isMyTreasurer;
      });

      // Keep track of user_ids we have processed as active treasurers
      const processedTreasurerUserIds = new Set<string>();

      activeTreasurersInMyChurches.forEach(uc => {
        const church = churchesList.find(c => c.id === uc.church_id)!;
        processedTreasurerUserIds.add(uc.user_id);

        // Find profile if accessible
        const p = (profilesData || []).find(profile => profile.id === uc.user_id);

        // Try to find matching accepted/pending invitation on this church to extract their contact
        const matchedInvite = (invitesData || []).find(inv =>
          inv.church_id === uc.church_id &&
          (inv.status === 'accepted' || inv.status === 'pending')
        );

        // The old fallback invented an address — `mhazini.<church>@kanisa.org` —
        // for a treasurer whose profile this pastor cannot read. That is a
        // plausible-looking string that belongs to nobody, and it was shown as
        // if it were their real contact. Say what is actually true instead.
        const contact = contactOf(p) || contactOf(matchedInvite) || 'Mawasiliano hayajulikani';
        const full_name = p?.full_name || nameFrom(matchedInvite, `Mhazini wa ${church.name}`);

        diagFilters.push(
          `Resolved active treasurer mapping via user_churches: User ID: ${uc.user_id}, Church: "${church.name}", Profile Found: ${!!p}, Invite Found: ${!!matchedInvite}, Assigned Contact: "${contact}", Assigned Name: "${full_name}"`
        );

        mappedTreasurers.push({
          id: uc.user_id,
          contact,
          full_name: full_name,
          role: 'mhazini',
          created_at: p?.created_at || uc.created_at || new Date().toISOString(),
          churchId: uc.church_id,
          churchName: church.name
        });
      });

      // Now add profiles who are marked as 'mhazini' in their profile but maybe not in user_churches mapping yet
      // or if superadmin, list all 'mhazini' profiles
      (profilesData || []).forEach(p => {
        if (processedTreasurerUserIds.has(p.id)) return; // already added

        const uChMatches = userChurchesData?.filter(uc => uc.user_id === p.id) || [];
        const uCh = uChMatches[0];
        const church = uCh ? churchesList.find(c => c.id === uCh.church_id) : null;
        const isMhazini = p.role === 'mhazini' || uCh?.role_in_church === 'mhazini';

        if (isMhazini) {
          const isMyTreasurer = !!church;
          const item: TreasurerProfile = {
            id: p.id,
            contact: contactOf(p) || 'Mawasiliano hayajulikani',
            full_name: p.full_name || nameFrom(p, 'Mhazini'),
            role: 'mhazini',
            created_at: p.created_at,
            churchId: uCh?.church_id || undefined,
            churchName: church ? church.name : 'Haijapangwa Kanisa'
          };

          if (isMyTreasurer || curProfileRole === 'superadmin') {
            mappedTreasurers.push(item);
            processedTreasurerUserIds.add(p.id);
            diagFilters.push(`Found mhazini from profilesData check: "${item.full_name}"`);
          }
        }
      });

      // The rest of the profiles that are NOT mhazini and are NOT current user are promotaeable
      (profilesData || []).forEach(p => {
        if (processedTreasurerUserIds.has(p.id)) return;
        if (p.id === user?.id) return; // exclude self
        
        const uChMatches = userChurchesData?.filter(uc => uc.user_id === p.id) || [];
        const uCh = uChMatches[0];
        const church = uCh ? churchesList.find(c => c.id === uCh.church_id) : null;

        mappedOthers.push({
          ...p,
          churchId: uCh?.church_id || undefined,
          churchName: church ? church.name : 'Haijapangwa Kanisa'
        });
      });

      console.log('[WHAZINI DIAGNOSTICS] Final mapped treasurers shown to user:', mappedTreasurers);
      setTreasurers(mappedTreasurers);
      setOtherProfiles(mappedOthers);

      // Now map and filter only the active PENDING invitations for the UI pending invitations list
      const mappedInvites: Invitation[] = (invitesData || [])
        .filter(inv => inv.role === 'mhazini' && inv.status === 'pending')
        .map(inv => {
          const church = churchesList.find(c => c.id === inv.church_id);
          return {
            ...inv,
            churchName: church ? church.name : 'Unknown Church'
          };
        })
        .filter(inv => inv.churchName !== 'Unknown Church' || curProfileRole === 'superadmin');

      setInvitations(mappedInvites);

      setDebugLogs({
        currentUser: { id: user?.id, email: user?.email, phone: user?.phone, role: profile?.role, profile_role_table: curProfileRole },
        churchesCount: churches_Data.length,
        churchesQueryError: churches_Err,
        churchesData: churches_Data,
        profilesCount: profiles_Data.length,
        profilesQueryError: profiles_Err,
        profilesData: profiles_Data,
        userChurchesCount: uc_Data.length,
        userChurchesQueryError: uc_Err,
        userChurchesData: uc_Data,
        filteredDetails: diagFilters,
        invitationsCount: mappedInvites.length,
        invitationsQueryError: inv_Err
      });

    } catch (err: any) {
      console.error('[WHAZINI DIAGNOSTICS] Error fetching treasurers dashboard data:', err);
      setErrorMsg('Imeshindwa kupakia data: ' + err.message);
      
      setDebugLogs({
        currentUser: { id: user?.id, email: user?.email, phone: user?.phone, role: profile?.role, profile_role_table: curProfileRole },
        churchesCount: churches_Data .length,
        churchesQueryError: churches_Err || err.message || err,
        churchesData: churches_Data,
        profilesCount: profiles_Data.length,
        profilesQueryError: profiles_Err,
        profilesData: profiles_Data,
        userChurchesCount: uc_Data.length,
        userChurchesQueryError: uc_Err,
        userChurchesData: uc_Data,
        filteredDetails: [...diagFilters, `Error caught: ${err.message}`],
        invitationsCount: 0,
        invitationsQueryError: inv_Err
      });
    } finally {
      setLoading(false);
    }
  };

  // Directly promote user to Treasurer
  const handlePromoteToTreasurer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promotingUserId || !promotingChurchId) {
      triggerError('Tafadhali chagua mtumiaji na kanisa la kumpangia.');
      return;
    }

    setIsPromoting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // 1. Update the profile role to 'mhazini' in Profiles table
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ role: 'mhazini' })
        .eq('id', promotingUserId);

      if (profileErr) throw profileErr;

      // 2. Check if user_churches record exists for this user
      const { data: existingRecord } = await supabase
        .from('user_churches')
        .select('*')
        .eq('user_id', promotingUserId)
        .maybeSingle();

      if (existingRecord) {
        // Update existing record
        const { error: ucErr } = await supabase
          .from('user_churches')
          .update({ church_id: promotingChurchId, role_in_church: 'mhazini' })
          .eq('user_id', promotingUserId);

        if (ucErr) throw ucErr;
      } else {
        // Insert new record
        const { error: ucErr } = await supabase
          .from('user_churches')
          .insert({
            user_id: promotingUserId,
            church_id: promotingChurchId,
            role_in_church: 'mhazini'
          });

        if (ucErr) throw ucErr;
      }

      triggerSuccess('Mtumiaji amepandishwa jukumu na kuwa Mhazini kikamilifu!');
      setPromotingUserId('');
      setPromotingChurchId('');
      fetchData();

    } catch (err: any) {
      console.error('Error promoting profile:', err);
      triggerError('Imeshindwa jukumu la mhazini: ' + err.message);
    } finally {
      setIsPromoting(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Display notification helpers
  const triggerSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 5000);
  };

  // Submit new invitation
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitePhone || !selectedChurchId) {
      triggerError('Tafadhali jaza namba ya simu na uchague kanisa.');
      return;
    }
    if (!isValidPhone(invitePhone)) {
      triggerError(PHONE_INVALID_MESSAGE);
      return;
    }
    if (!isChurchWritable(selectedChurchId)) {
      triggerError('Leseni ya kanisa hili imeisha. Huwezi kumwalika mhazini mpaka leseni ihuishwe.');
      return;
    }

    // Stored in the canonical form, so the invitee's token matches it on sign-in
    // whatever shape they typed their number in when registering.
    const phoneNorm = normalizePhone(invitePhone);

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // Check if this number is already invited. `.maybeSingle()` would THROW
      // on two pending rows rather than reporting the duplicate, which is the
      // exact case being tested for — take the first instead.
      const { data: existingInvites } = await supabase
        .from('invitations')
        .select('id')
        .eq('phone', phoneNorm)
        .eq('status', 'pending')
        .limit(1);

      if (existingInvites && existingInvites.length > 0) {
        throw new Error('Tayari kuna mwaliko unaosubiriwa kwa namba hii ya simu.');
      }

      // Check what account, if any, already owns this number
      const { data: existingProfiles } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('phone', phoneNorm)
        .limit(1);
      const existingProfile = existingProfiles?.[0] ?? null;

      if (existingProfile && existingProfile.role === 'mhazini') {
        throw new Error('Mtumiaji mwenye namba hii tayari ni Mhazini amilifu.');
      }

      // Accepting an invitation rewrites the account's role. Sending one to a
      // pastor or a superadmin would therefore demote them on their next login
      // — stripping their own churches' administration from them. Only the
      // 'mhazini' check existed before, so those addresses passed straight
      // through.
      if (existingProfile && (existingProfile.role === 'pastor' || existingProfile.role === 'superadmin')) {
        throw new Error(
          'Namba hii ni ya akaunti yenye madaraka ya juu (Mchungaji au Msimamizi). ' +
          'Huwezi kuibadilisha kuwa Mhazini. Tumia namba nyingine.'
        );
      }

      if (existingProfile && existingProfile.id === user?.id) {
        throw new Error('Huwezi kujialika mwenyewe kuwa Mhazini.');
      }

      // invitations_insert requires invited_by = auth.uid(). An undefined id
      // here would be dropped from the payload and the row refused by RLS with
      // a message about policies rather than about the missing sender.
      const invitedBy = user?.id ?? profile?.id ?? null;
      if (!invitedBy) {
        throw new Error('Kipindi chako kimeisha. Tafadhali toka na uingie tena.');
      }

      // Insert into invitations
      const { error: inviteErr } = await supabase
        .from('invitations')
        .insert({
          phone: phoneNorm,
          role: 'mhazini',
          invited_by: invitedBy,
          church_id: selectedChurchId,
          status: 'pending'
        });

      if (inviteErr) throw inviteErr;

      triggerSuccess(
        `Mwaliko wa ${formatPhoneDisplay(phoneNorm)} umehifadhiwa. Mfumo HAUTUMI ujumbe — mjulishe mwenyewe ` +
        `ajisajili kwenye programu akitumia namba hii hasa, kisha atapata nafasi ya Mhazini.`
      );
      setInvitePhone('');
      setSelectedChurchId('');
      fetchData(); // Refresh list

    } catch (err: any) {
      console.error(err);
      triggerError(err.message || 'Mwaliko umeshindwa kuhifadhiwa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete/Cancel an invitation
  const handleCancelInvite = async (inviteId: string, contact: string) => {
    if (!window.confirm(`Je, uko na uhakika unataka kufuta mwaliko kwa ajili ya ${contact}?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', inviteId);

      if (error) throw error;

      triggerSuccess('Mwaliko umefutwa kikamilifu!');
      fetchData();
    } catch (err: any) {
      triggerError('Imeshindwa kufuta mwaliko: ' + err.message);
    }
  };

  // Open modal to change assigned church for a treasurer
  const startEditingChurch = (treasurer: TreasurerProfile) => {
    setEditingTreasurer(treasurer);
    setNewAssignedChurchId(treasurer.churchId || '');
  };

  // Update Assigned Church for a Treasurer
  const handleUpdateChurchAssignment = async () => {
    if (!editingTreasurer || !newAssignedChurchId) return;

    setUpdatingAssignment(true);
    setErrorMsg('');

    try {
      // Check if user_churches record exists for this treasurer
      const { data: existingRecord } = await supabase
        .from('user_churches')
        .select('*')
        .eq('user_id', editingTreasurer.id)
        .maybeSingle();

      if (existingRecord) {
        // Update existing record
        const { error: updateErr } = await supabase
          .from('user_churches')
          .update({ church_id: newAssignedChurchId, role_in_church: 'mhazini' })
          .eq('user_id', editingTreasurer.id);

        if (updateErr) throw updateErr;
      } else {
        // Insert new record
        const { error: insertErr } = await supabase
          .from('user_churches')
          .insert({
            user_id: editingTreasurer.id,
            church_id: newAssignedChurchId,
            role_in_church: 'mhazini'
          });

        if (insertErr) throw insertErr;
      }

      triggerSuccess(`Kanisa la ${editingTreasurer.full_name || editingTreasurer.contact} limebadilishwa kwa mafanikio!`);
      setEditingTreasurer(null);
      fetchData();

    } catch (err: any) {
      console.error(err);
      triggerError('Imeshindwa kusasisha kanisa: ' + err.message);
    } finally {
      setUpdatingAssignment(false);
    }
  };

  // Revoke/Deactivate Treasurer (change role to normal member or remove access)
  const handleRevokeTreasurer = async (treasurer: TreasurerProfile) => {
    const name = treasurer.full_name || treasurer.contact;
    if (!window.confirm(`Je, uko na uhakika wa kuondoa udhamini wa Mhazini kwa ${name}? Hatua hii itamrudisha kuwa mtumiaji wa kawaida isipokuwa ukapewa jukumu lingine.`)) {
      return;
    }

    try {
      // 1. Remove from user_churches to dissociate from church
      const { error: deleteUCErr } = await supabase
        .from('user_churches')
        .delete()
        .eq('user_id', treasurer.id);

      if (deleteUCErr) throw deleteUCErr;

      // 2. Demote to the ordinary member role. This used to write NULL, which
      // is not one of the roles the app understands: the account fell through
      // every role check into the "unidentified" branch, could not be listed
      // for re-promotion, and still satisfied the CHECK constraint so nothing
      // flagged it. 'mshiriki' is a valid role and keeps the account usable.
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ role: 'mshiriki' })
        .eq('id', treasurer.id);

      if (profileErr) throw profileErr;

      triggerSuccess(`Idhini ya Mhazini kwa ${name} imeondolewa kikamilifu!`);
      fetchData();

    } catch (err: any) {
      console.error('Error revoking treasurer privileges:', err);
      triggerError('Imeshindwa kuondoa mhazini: ' + err.message);
    }
  };

  return (
    <div className="bg-[var(--color-ink)] font-sans flex flex-col min-h-[100dvh]">
      
      {/* Upper Navigation Back Header */}
      <div className="px-5 pt-8 pb-4 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <button 
            id="back-btn"
            onClick={() => navigate('/')} 
            className="w-10 h-10 rounded-full bg-[var(--color-surface)]/10 hover:bg-[var(--color-surface)]/20 flex items-center justify-center transition-colors text-[var(--color-text)] cursor-pointer"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-[var(--color-text)] text-[19px] font-black leading-tight tracking-wide">Usimamizi wa Wahazini</h1>
            <p className="text-[#CEB4FD] text-[11px] font-medium mt-1 uppercase tracking-wider">Church Treasurers Portal (PFRO)</p>
          </div>
        </div>
      </div>

      {/* Main Panel Canvas Area */}
      <div className="bg-[var(--color-ink)] rounded-t-[20px] flex-1 px-4 pt-5 pb-16 flex flex-col gap-5">
        
        {/* Banner Alert Toast Notices */}
        <AnimatePresence>
          {successMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -10 }}
              className="note note-success"
            >
              <CheckCircle2 className="shrink-0 mt-0.5" size={16} />
              <p className="text-[13px] font-semibold leading-relaxed">{successMsg}</p>
            </motion.div>
          )}

          {errorMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -10 }}
              className="note note-error"
            >
              <AlertCircle className="shrink-0 mt-0.5" size={16} />
              <p className="text-[13px] font-semibold leading-relaxed">{errorMsg}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 1. Invite New Treasurer Card */}
        {profile?.role !== 'mhazini' && (
          <div className="bg-[var(--color-surface)] rounded-2xl p-5 border border-[var(--color-border)] shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-[var(--color-surface)] text-[var(--color-teal-on)] flex items-center justify-center">
                <UserPlus size={16} strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-[13px] font-black text-[var(--color-text)] uppercase tracking-tight">Alika Mhazini Mpya</h3>
                <p className="text-[12px] text-[var(--color-text-muted)] font-medium">Andaa nafasi ya Mhazini kwa kanisa mteule. Baada ya hapo mjulishe mwenyewe ajisajili.</p>
              </div>
            </div>

            <form onSubmit={handleInviteSubmit} className="flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Phone Input */}
                <div className="relative">
                  <Phone className="absolute left-3 top-3 text-[var(--color-text-muted)]" size={15} />
                  <input
                    id="invite-phone-input"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    placeholder="Namba ya simu ya mhazini (07XX XXX XXX)"
                    className="w-full pl-9 pr-3 py-2.5 border border-[var(--color-border)] rounded-xl text-[12px] font-medium bg-[var(--color-surface)] focus:bg-[var(--color-surface)] focus:outline-none focus:border-[#00C9A7] placeholder:text-[var(--color-text-muted)]"
                    required
                  />
                </div>

                {/* Church Selection */}
                <div className="relative">
                  <Church className="absolute left-3 top-3 text-[var(--color-text-muted)]" size={15} />
                  <select
                    id="invite-church-select"
                    value={selectedChurchId}
                    onChange={(e) => setSelectedChurchId(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 border border-[var(--color-border)] rounded-xl text-[12px] font-bold bg-[var(--color-surface)] text-[var(--color-text-dim)] focus:bg-[var(--color-surface)] focus:outline-none focus:border-[#00C9A7]"
                    required
                  >
                    <option value="">Chagua Kanisa Atakalozea...</option>
                    {/* invitations_insert is gated by church_licence_active(),
                        so inviting into a frozen church is refused by the
                        database. Say so here rather than after sending. */}
                    {churches.map((ch) => (
                      <option key={ch.id} value={ch.id} disabled={!isChurchWritable(ch.id)}>
                        {ch.name}{isChurchWritable(ch.id) ? '' : ' — leseni imeisha'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                id="send-invite-btn"
                type="submit"
                disabled={isSubmitting}
                className="bg-[#00C9A7] hover:bg-[#571DC8] text-[var(--color-text)] text-[12px] font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Inahifadhi...
                  </>
                ) : (
                  <>
                    <Send size={14} /> Hifadhi Mwaliko wa Mhazini
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* 1.5 Promote Registered User to Treasurer Directly */}
        {profile?.role !== 'mhazini' && (
          <div className="bg-[var(--color-surface)] rounded-2xl p-5 border border-[var(--color-border)] shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-[#E8F8F0] text-[#08A452] flex items-center justify-center">
                <Sparkles size={16} strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-[13px] font-black text-[var(--color-text)] uppercase tracking-tight">Thibitisha Mtumiaji Aliyopo kuwa Mhazini</h3>
                <p className="text-[12px] text-[var(--color-text-muted)] font-medium">Bomba wasifu wa mtumiaji ambaye tayari amejisajili kwenye mfumo ili umpe mamlaka ya uhazini mara moja.</p>
              </div>
            </div>

            <form onSubmit={handlePromoteToTreasurer} className="flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Profile select option */}
                <div className="relative">
                  <User className="absolute left-3 top-3 text-[var(--color-text-muted)]" size={15} />
                  <select
                    id="promote-user-select"
                    value={promotingUserId}
                    onChange={(e) => setPromotingUserId(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 border border-[var(--color-border)] rounded-xl text-[12px] font-bold bg-[var(--color-surface)] text-[var(--color-text-dim)] focus:bg-[var(--color-surface)] focus:outline-none focus:border-[#00C9A7]"
                    required
                  >
                    <option value="">Chagua Mtumiaji Aliyopo...</option>
                    {otherProfiles.length > 0 ? (
                      otherProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name || contactOf(p)} ({contactOf(p) || 'hakuna mawasiliano'}) - {p.role === 'pastor' ? 'Pastor' : 'Mshiriki'}
                        </option>
                      ))
                    ) : (
                      <option disabled>Hakuna watumiaji wengine waliopatikana</option>
                    )}
                  </select>
                </div>

                {/* Church Selection */}
                <div className="relative">
                  <Church className="absolute left-3 top-3 text-[var(--color-text-muted)]" size={15} />
                  <select
                    id="promote-church-select"
                    value={promotingChurchId}
                    onChange={(e) => setPromotingChurchId(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 border border-[var(--color-border)] rounded-xl text-[12px] font-bold bg-[var(--color-surface)] text-[var(--color-text-dim)] focus:bg-[var(--color-surface)] focus:outline-none focus:border-[#00C9A7]"
                    required
                  >
                    <option value="">Chagua Kanisa Atakaloendea...</option>
                    {churches.map((ch) => (
                      <option key={ch.id} value={ch.id}>{ch.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                id="promote-submit-btn"
                type="submit"
                disabled={isPromoting}
                className="bg-[#08A452] hover:bg-[#068441] text-[var(--color-text)] text-[12px] font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:shadow-md cursor-pointer disabled:opacity-50"
              >
                {isPromoting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Inapandisha...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} /> Thibitisha Kuwa Mhazini
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* 2. Treasurers and Invites Content Loading State */}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00C9A7]" />
            <p className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">Tunawasiliana na ofisi...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            
            {/* Active Treasurers Section */}
            <div className="flex flex-col gap-2.5">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-[12px] font-black text-[var(--color-text)] uppercase tracking-tight flex items-center gap-1.5">
                  💼 Wahazini Amilifu wa Makanisa ({treasurers.length})
                </h3>
                <span className="text-[11px] font-bold bg-[#E8F8F0] text-[#08A452] px-2 py-0.5 rounded-full uppercase">
                  Wameidhinishwa
                </span>
              </div>

              {treasurers.length > 0 ? (
                <div className="grid gap-3">
                  {treasurers.map((tr) => (
                    <div 
                      key={tr.id} 
                      className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)] shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-purple-200 transition-all"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-full bg-[var(--color-surface-hover)] text-[var(--color-gold)] flex items-center justify-center font-black text-[13px] shrink-0 border border-[var(--color-border)] uppercase">
                          {(tr.full_name || tr.contact).substring(0, 2)}
                        </div>
                        <div>
                          <h4 className="text-[13px] font-bold text-[var(--color-text)] leading-tight">
                            {tr.full_name || tr.contact}
                          </h4>
                          <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5 font-medium">{tr.contact}</p>
                          
                          {/* Assigned Church Tag */}
                          <div className="inline-flex items-center gap-1 bg-[color-mix(in srgb, var(--color-gold) 12%, transparent)] border border-[color-mix(in srgb, var(--color-gold) 20%, transparent)] text-[var(--color-gold)] font-bold text-[11px] px-2 py-0.5 rounded-md mt-1.5">
                            <Church size={10} color="var(--color-gold)"/>
                            <span>{tr.churchName}</span>
                          </div>
                        </div>
                      </div>

                      {/* Control Panel Actions for this Treasurer */}
                      {profile?.role !== 'mhazini' && (
                        <div className="flex items-center gap-2 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-50 justify-end">
                          <button
                            onClick={() => startEditingChurch(tr)}
                            className="flex items-center gap-1.5 bg-[var(--color-surface)] hover:bg-[var(--color-ink-800)] border border-[var(--color-border)] text-[var(--color-text-dim)] text-[12px] font-bold px-3 py-1.5 rounded-lg transition-all"
                          >
                            <Edit2 size={12} /> Badili Kanisa
                          </button>
                          <button
                            onClick={() => handleRevokeTreasurer(tr)}
                            className="flex items-center gap-1.5 text-[var(--color-rose-on)] border border-[color-mix(in_srgb,var(--color-rose)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-rose)_10%,transparent)] text-[12px] font-bold px-3 py-2 rounded-lg transition-all min-h-[40px]"
                          >
                            <Trash2 size={12} /> Ondoa jukumu
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-[var(--color-surface)] rounded-2xl p-8 border border-dashed border-[var(--color-border)] text-center text-[var(--color-text-muted)]">
                  <ShieldAlert className="mx-auto mb-2 text-gray-300" size={24} />
                  <p className="text-[11px] font-bold uppercase tracking-wide">Hakuna Wahazini waliopatikana kwa sasa</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-1">Alika watumiaji wajiunge kama wahazini kupitia fomu iliyoratibiwa hapo juu.</p>
                </div>
              )}
            </div>

            {/* Pending Invitations Section */}
            <div className="flex flex-col gap-2.5 mt-2">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-[12px] font-black text-[var(--color-text)] uppercase tracking-tight flex items-center gap-1.5">
                  ⏳ Wanaosubiriwa Kujisajili ({invitations.length})
                </h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full uppercase text-[var(--color-gold-on)] bg-[color-mix(in_srgb,var(--color-gold)_16%,transparent)] border border-[color-mix(in_srgb,var(--color-gold)_32%,transparent)]">
                  Hawajajisajili
                </span>
              </div>

              {invitations.length > 0 ? (
                <div className="grid gap-3">
                  {invitations.map((inv) => (
                    <div 
                      key={inv.id} 
                      className="bg-[var(--color-surface)] rounded-xl p-3.5 border border-[var(--color-border)] flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-bold text-[var(--color-text)] truncate block">{contactOf(inv) || 'Mwaliko usio na mawasiliano'}</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] text-[var(--color-text-muted)] font-medium">
                          <span>Kanisa: <strong className="text-[var(--color-text-dim)]">{inv.churchName}</strong></span>
                          <span>•</span>
                          <span>Imetumwa: {new Date(inv.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      {profile?.role !== 'mhazini' && (
                        <button
                          onClick={() => handleCancelInvite(inv.id, contactOf(inv) || 'mwaliko huu')}
                          className="btn-icon btn-icon-danger shrink-0"
                          title="Cancel/Delete Invitation"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-[var(--color-surface)] rounded-xl p-5 border border-[var(--color-border)] text-center text-[var(--color-text-muted)] text-[12px] font-semibold">
                  Hakuna mialiko inayorandana kwa sasa.
                </div>
              )}
            </div>



          </div>
        )}

      </div>

      {/* Edit Church Assignment Modal popup */}
      <AnimatePresence>
        {editingTreasurer && (
          <div 
            id="edit-modal-overlay"
            className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--color-surface)] rounded-[24px] max-w-[400px] w-full p-6 shadow-2xl border border-[var(--color-border)] relative"
            >
              <button 
                onClick={() => setEditingTreasurer(null)}
                className="absolute right-4 top-4 w-8 h-8 rounded-full bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>

              <h3 className="text-[14px] font-black text-[var(--color-text)] uppercase tracking-tight mb-1.5 flex items-center gap-1.5">
                <Sparkles size={16} className="text-[var(--color-teal-on)]" /> Badili Kanisa Sanifu
              </h3>
              <p className="text-[11px] text-[var(--color-text-muted)] mb-4 font-semibold leading-relaxed">
                Mhazini: <strong className="text-[var(--color-text)]">{editingTreasurer.full_name || editingTreasurer.contact}</strong>
              </p>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <label id="assignment-select-label" className="text-[12px] font-extrabold text-[var(--color-teal-on)] uppercase mb-1">
                    Kanisa Lipya (New Assigned Church)
                  </label>
                  
                  <select
                    id="new-church-assignment-select"
                    value={newAssignedChurchId}
                    onChange={(e) => setNewAssignedChurchId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-[var(--color-border)] rounded-xl text-[12px] font-bold bg-[var(--color-surface)] text-[var(--color-text-dim)] focus:outline-none focus:border-[#00C9A7]"
                  >
                    <option value="">Weka kando au chagua kanisa...</option>
                    {churches.map((ch) => (
                      <option key={ch.id} value={ch.id}>{ch.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2 justify-end pt-2 border-t border-gray-50">
                  <button
                    onClick={() => setEditingTreasurer(null)}
                    className="px-4 py-2 bg-[var(--color-ink-800)] hover:bg-gray-200 text-[var(--color-text-dim)] text-[11px] font-bold rounded-xl transition-all"
                  >
                    Futa (Cancel)
                  </button>
                  <button
                    id="save-assignment-btn"
                    onClick={handleUpdateChurchAssignment}
                    disabled={updatingAssignment}
                    className="px-4 py-2 bg-[#00C9A7] hover:bg-[#571DC8] text-[var(--color-text)] text-[11px] font-bold rounded-xl flex items-center gap-1 transition-all"
                  >
                    {updatingAssignment ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" /> Inahifadhi...
                      </>
                    ) : (
                      <>
                        <Check size={12} /> Hifadhi Mabadiliko
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
