import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, setLicenceReadOnly, setBlockedChurches } from '../../lib/supabase';
import { normalizePhone, formatPhoneDisplay } from '../../lib/phone';

export type LicenceState = 'active' | 'expired' | 'suspended' | 'unknown';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  profile: any | null;
  refreshProfile: () => Promise<void>;
  selectedChurchId: string | null;
  setSelectedChurchId: (id: string | null) => void;
  licenses: any[];
  licenceState: LicenceState;
  /** True only when EVERY church the caller leads is frozen. For a pastor with
   *  a mix, use isChurchWritable() — one dead licence must not stop the rest. */
  isReadOnly: boolean;
  /** The caller's churches whose licence has lapsed or been suspended. */
  blockedChurchIds: string[];
  /** Whether writes aimed at this church will be accepted. */
  isChurchWritable: (churchId?: string | null) => boolean;
  /** Set when the account's `profiles` row could not be written. The app is
   *  then running on an unsaved in-memory profile — see Layout's banner. */
  profileError: string | null;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isLoading: true,
  profile: null,
  refreshProfile: async () => {},
  selectedChurchId: null,
  setSelectedChurchId: () => {},
  licenses: [],
  licenceState: 'unknown',
  isReadOnly: false,
  blockedChurchIds: [],
  isChurchWritable: () => true,
  profileError: null,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [selectedChurchId, setSelectedChurchIdState] = useState<string | null>(() => {
    return localStorage.getItem('active_church_id');
  });

  const setSelectedChurchId = (id: string | null) => {
    setSelectedChurchIdState(id);
    if (id) {
      localStorage.setItem('active_church_id', id);
    } else {
      localStorage.removeItem('active_church_id');
    }
  };

  const refreshProfile = async () => {
    if (session?.user) {
      try {
        const userEmail = session.user.email || '';
        // The account's number in the one shape everything compares. Supabase
        // hands it back with the '+' already stripped, but normalising anyway
        // costs nothing and means this does not silently depend on that.
        const userPhone = normalizePhone(session.user.phone || '');
        // What to call this person before their profile row is read. An account
        // created by phone has no address to take a name from.
        const identityLabel = userEmail ? userEmail.split('@')[0] : (formatPhoneDisplay(userPhone) || 'Mtumiaji');

        // Fetch profile, user_churches, pastor's churches, licenses and any pending invitations
        const [pRes, ucRes, chRes, licRes, invRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
          // Ordered so the "primary" church below is stable between logins.
          // Unordered, Postgres may return the rows in any sequence and the
          // church a user landed on could silently change.
          supabase.from('user_churches').select('*').eq('user_id', session.user.id)
            .order('created_at', { ascending: true }).order('church_id', { ascending: true }),
          supabase.from('churches').select('id').eq('pastor_id', session.user.id),
          // Read the view, not the table: it adds `is_active` and
          // `days_remaining` computed against the SERVER clock, so licence
          // validity does not depend on the device's date.
          supabase.from('licence_status').select('*'),
          // Matched by the database, not here — see my_pending_invitation() in
          // database/rls_policies.sql. A client-side filter cannot express
          // "the same phone number written differently", and this also survives
          // a person being invited twice, which used to throw.
          supabase.rpc('my_pending_invitation')
        ]);

        let pData = pRes.data;
        let ucData = ucRes.data || [];
        const chData = chRes.data || [];
        const licData = licRes.data || [];
        const pendingInv = Array.isArray(invRes.data) ? invRes.data[0] ?? null : invRes.data;

        // Accepting an invitation rewrites this account's role, so it must never
        // run against an account that already outranks the invited role. Without
        // this guard, inviting an existing pastor's address silently demoted
        // them to 'mhazini' on their next login and locked them out of
        // administering their own churches.
        //
        // ManageMhaziniPage now refuses to create such an invitation, but rows
        // created before that fix can still be sitting in the table. Those are
        // left 'pending' rather than auto-revoked, so the inviting pastor can
        // see and cancel them.
        const holdsPrivilegedRole = pData?.role === 'pastor' || pData?.role === 'superadmin';
        if (pendingInv && holdsPrivilegedRole) {
          console.warn(
            `Ignoring invitation ${pendingInv.id}: this account is already a ${pData?.role}. ` +
            `Accepting it would demote them. The invitation stays pending for the sender to cancel.`
          );
        }

        // Self-Healing: If there is a pending invitation for this email, accept it and assign the church/role
        if (pendingInv && !holdsPrivilegedRole) {
          console.log('Resolving pending invitation during session initialize:', pendingInv);
          const updatedRole = pendingInv.role || 'mhazini';
          const fullName = pData?.full_name || session.user.user_metadata?.full_name || identityLabel;

          try {
            // 1. The legacy user_churches write policy requires role 'pastor',
            // so the role is raised just long enough to insert the mapping and
            // always restored in `finally` — a failure in between must never
            // strand the account with pastor privileges.
            //
            // This is best-effort on purpose. Once database/rls_policies.sql is
            // applied, a member may accept their own pending invitation
            // directly and this upsert is denied; step 2 then succeeds on its
            // own merits. Ignoring the result keeps both orders working, so the
            // policies can be rolled out without redeploying the app.
            const { error: elevateErr } = await supabase.from('profiles').upsert({
              id: session.user.id,
              // NULL, never ''. `profiles.email` is unique, and the empty
              // string collides with itself — two accounts that both lack an
              // address are not duplicates, but '' = '' says they are.
              email: userEmail || null,
              phone: userPhone || null,
              full_name: fullName,
              role: 'pastor'
            });
            if (elevateErr) {
              console.info('Role elevation not permitted (expected once RLS policies are applied):', elevateErr.message);
            }

            // 2. Insert or update the user_churches record under 'pastor' context
            const hasUch = ucData.some(uc => uc.church_id === pendingInv.church_id);
            if (!hasUch) {
              const { data: newUc } = await supabase.from('user_churches').insert({
                user_id: session.user.id,
                church_id: pendingInv.church_id,
                role_in_church: updatedRole
              }).select();
              if (newUc && newUc[0]) {
                ucData = [...ucData, newUc[0]];
              }
            } else {
              await supabase.from('user_churches').update({
                role_in_church: updatedRole
              }).eq('user_id', session.user.id).eq('church_id', pendingInv.church_id);
            }
          } finally {
            // 3. Always drop back to the actual invited role.
            const { data: updatedProfile } = await supabase.from('profiles').update({
              role: updatedRole
            }).eq('id', session.user.id).select().maybeSingle();

            if (updatedProfile) {
              pData = updatedProfile;
            }
          }

          // Mark invitation as accepted
          await supabase.from('invitations').update({ status: 'accepted' }).eq('id', pendingInv.id);

          // Re-trigger refresh to construct final proper state
          setTimeout(() => refreshProfile(), 100);
          return;
        }

        // Fallback only. The profile is normally created by the
        // on_auth_user_created trigger in database/schema.sql, inside the same
        // transaction as the account, so this should never fire once that is
        // applied. It stays for databases where it has not been.
        if (!pData) {
          const defaultRole = 'pastor';
          const newProfile = {
            id: session.user.id,
            email: userEmail || null,
            phone: userPhone || null,
            full_name: session.user.user_metadata?.full_name || identityLabel,
            role: defaultRole
          };
          const { data: insertedProfile, error: profileErr } = await supabase
            .from('profiles').upsert(newProfile).select().maybeSingle();

          // Previously the error was not even destructured, so a rejected
          // insert fell through to `newProfile` and the app carried on showing
          // a pastor whose row was never written. The account then looked fine
          // and nothing existed in `profiles`. Fail loudly instead.
          if (profileErr) {
            // 23503 on profiles_id_fkey means auth.users has no row for this
            // id: the token belongs to a deleted account. Carrying on would
            // fail every subsequent write for reasons that look like a
            // permissions problem, so end the session instead.
            if ((profileErr as any).code === '23503') {
              console.warn('Session belongs to a deleted account — signing out.');
              await supabase.auth.signOut();
              setSession(null);
              setProfile(null);
              setLicenses([]);
              setProfileError(null);
              return;
            }

            console.error(
              'Could not create the profile row for this account. The app is ' +
              'running on an in-memory profile and nothing has been saved. ' +
              'Apply database/schema.sql so the on_auth_user_created trigger ' +
              'takes over.',
              profileErr
            );
            setProfileError(profileErr.message || 'Imeshindwa kuhifadhi wasifu wako.');
          } else {
            setProfileError(null);
          }

          pData = insertedProfile || newProfile;
        } else {
          setProfileError(null);
        }
        
        const ucIds = ucData.map(uc => uc.church_id);
        const chIds = chData.map(ch => ch.id);
        // Merge and deduplicate
        const mergedIds = Array.from(new Set([...ucIds, ...chIds]));

        // The single church every mhazini screen reads.
        //
        // This used to be `pData.church_id || mergedIds[0]`. `profiles` has no
        // church_id column, so the first term was always undefined and it fell
        // through to whichever row the database returned first. For a treasurer
        // the answer is not "the first row" but "the church they are treasurer
        // of", so read it from the mapping that actually says so. The partial
        // unique index in database/schema.sql guarantees there is at most one.
        const treasurerMapping = ucData.find(uc => uc.role_in_church === 'mhazini');
        const primaryChurchId = pData?.role === 'mhazini'
          ? (treasurerMapping?.church_id ?? mergedIds[0] ?? null)
          : (mergedIds[0] ?? null);

        const finalProfile = {
          ...pData,
          church_ids: mergedIds,
          church_id: primaryChurchId
        };

        setProfile(finalProfile);
        setLicenses(licData || []);

        // Self-Healing Sync: Ensure user_churches matches the user's role in profiles
        // (Only run this for pastors to avoid 403 Forbidden issues for other users under strict RLS policies)
        if (pData?.role === 'pastor') {
          supabase
            .from('user_churches')
            .update({ role_in_church: pData.role })
            .eq('user_id', session.user.id)
            .neq('role_in_church', pData.role)
            .then(({ error }) => {
              if (error) {
                console.warn("Self-healing role_in_church sync warning:", error.message);
              }
            });
        }

        const defaultChurchId = finalProfile.church_id;
        if (!selectedChurchId && defaultChurchId) {
          setSelectedChurchId(defaultChurchId);
        }
      } catch (err) {
        console.error("Error setting custom auth profile:", err);
      }
    } else {
      setProfile(null);
      setLicenses([]);
    }
  };

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    
    // getSession() only reads the token out of local storage — it never asks
    // the server whether that user still exists. A token happily outlives the
    // account it names (the account was deleted, or the project was rebuilt),
    // and the app then runs as a ghost: signed in, but every write fails on
    // profiles_id_fkey with "Key is not present in table users", and every
    // policy that resolves a role finds nothing. That looks like a permissions
    // bug and is really a dead session.
    //
    // getUser() goes to the server, so it can tell the difference. If the
    // account is gone, drop the token and show the login screen.
    supabase.auth.getSession().then(async ({ data: { session: stored } }) => {
      if (!stored) {
        setSession(null);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        console.warn('Stored session refers to an account that no longer exists — signing out.', error);
        await supabase.auth.signOut();
        setSession(null);
        setIsLoading(false);
        return;
      }

      setSession(stored);
      setIsLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Without this the listener outlives the provider on hot reload / remount,
    // stacking duplicate subscriptions that each re-trigger refreshProfile().
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    refreshProfile();

    const handleSyncComplete = () => {
      refreshProfile();
    };

    window.addEventListener('supabase-sync-complete', handleSyncComplete);
    return () => {
      window.removeEventListener('supabase-sync-complete', handleSyncComplete);
    };
  }, [session]);

  // ---------------------------------------------------------------------------
  // Licence state for the church currently on screen
  // ---------------------------------------------------------------------------
  // Computed once here rather than in each screen, so the banner, the hidden
  // buttons and the write guard in lib/supabase.ts can never disagree — a
  // visible "Save" that then fails is worse than no button at all.
  const licenceState: LicenceState = (() => {
    if (!selectedChurchId) return 'unknown';
    const lic = licenses.find((l: any) => l.church_id === selectedChurchId);
    if (!lic) return 'unknown';
    if (lic.status === 'suspended') return 'suspended';

    // `is_active` comes from the licence_status view, computed against the
    // SERVER clock. Trust it whenever present. The fallback reads the device
    // clock, which a user can wind back — it is kept only for offline reads of
    // a cached row, and it cannot make a dead licence work: the database
    // refuses the write regardless of what this decides.
    const expired = typeof lic.is_active === 'boolean'
      ? !lic.is_active
      : lic.status === 'expired' || (lic.expires_at && new Date(lic.expires_at) < new Date());

    return expired ? 'expired' : 'active';
  })();

  // Which of the caller's churches are frozen, church by church.
  //
  // This is the shape a PASTOR needs. They choose the target church on every
  // form and can view "Makanisa Yote" on the dashboard, so a single flag keyed
  // to one church describes nothing they actually do. It mirrors the database,
  // where church_licence_active(church_id) is evaluated per row.
  //
  // A mhazini serves one church, so for them this set is either empty or holds
  // that one church — the behaviour they had before, unchanged.
  const churchIds: string[] = profile?.church_ids?.length
    ? profile.church_ids
    : (profile?.church_id ? [profile.church_id] : []);

  const isSuperadmin = profile?.role === 'superadmin';

  const blockedChurchIds: string[] = isSuperadmin ? [] : churchIds.filter((id: string) => {
    const lic = licenses.find((l: any) => l.church_id === id);
    // No licence row yet is NOT treated as blocked here: licences are still
    // loading on first paint, and flashing a lockout at every sign-in would be
    // its own bug. The database refuses that write regardless.
    if (!lic) return false;
    if (lic.status === 'suspended') return true;
    return typeof lic.is_active === 'boolean'
      ? !lic.is_active
      : lic.status === 'expired' || (lic.expires_at && new Date(lic.expires_at) < new Date());
  });

  const isChurchWritable = (churchId?: string | null) =>
    !churchId || isSuperadmin || !blockedChurchIds.includes(churchId);

  // The GLOBAL lock now means "nothing you lead can be written to", not "your
  // primary church lapsed". A pastor with one dead church out of four keeps
  // working in the other three; only the dead one is refused, per church.
  //
  // Superadmins are never read-only — renewing a lapsed licence is exactly the
  // write they exist to make, and locking them out would be unrecoverable.
  const isReadOnly =
    !isSuperadmin &&
    churchIds.length > 0 &&
    blockedChurchIds.length === churchIds.length;

  useEffect(() => {
    setLicenceReadOnly(isReadOnly);
  }, [isReadOnly]);

  const blockedKey = blockedChurchIds.join(',');
  useEffect(() => {
    setBlockedChurches(blockedKey ? blockedKey.split(',') : []);
  }, [blockedKey]);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, isLoading, profile, refreshProfile, selectedChurchId, setSelectedChurchId, licenses, licenceState, isReadOnly, blockedChurchIds, isChurchWritable, profileError }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
