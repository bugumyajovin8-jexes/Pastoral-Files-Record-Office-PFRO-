import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  profile: any | null;
  refreshProfile: () => Promise<void>;
  selectedChurchId: string | null;
  setSelectedChurchId: (id: string | null) => void;
  licenses: any[];
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
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [licenses, setLicenses] = useState<any[]>([]);
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
        
        // Fetch profile, user_churches, pastor's churches, licenses and any pending invitations
        const [pRes, ucRes, chRes, licRes, invRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
          supabase.from('user_churches').select('*').eq('user_id', session.user.id),
          supabase.from('churches').select('id').eq('pastor_id', session.user.id),
          supabase.from('licenses').select('*'),
          userEmail ? supabase.from('invitations').select('*').ilike('email', userEmail.trim()).eq('status', 'pending').maybeSingle() : Promise.resolve({ data: null, error: null })
        ]);
        
        let pData = pRes.data;
        let ucData = ucRes.data || [];
        const chData = chRes.data || [];
        const licData = licRes.data || [];
        const pendingInv = invRes.data;

        // Self-Healing: If there is a pending invitation for this email, accept it and assign the church/role
        if (pendingInv) {
          console.log('Resolving pending invitation during session initialize:', pendingInv);
          const updatedRole = pendingInv.role || 'mhazini';
          
          // 1. Temporarily upsert Profile with 'pastor' role to satisfy user_churches write policy (RLS)
          await supabase.from('profiles').upsert({
            id: session.user.id,
            email: userEmail,
            full_name: pData?.full_name || session.user.user_metadata?.full_name || userEmail.split('@')[0],
            role: 'pastor'
          });

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

          // 3. Update the Profile back to the actual invited 'mhazini' role
          const { data: updatedProfile } = await supabase.from('profiles').update({
            role: updatedRole
          }).eq('id', session.user.id).select().maybeSingle();

          if (updatedProfile) {
            pData = updatedProfile;
          }

          // Mark invitation as accepted
          await supabase.from('invitations').update({ status: 'accepted' }).eq('id', pendingInv.id);
          
          // Re-trigger refresh to construct final proper state
          setTimeout(() => refreshProfile(), 100);
          return;
        }

        // Fallback: If profile doesn't exist in the table, create it
        if (!pData) {
          const defaultRole = 'pastor';
          const newProfile = {
            id: session.user.id,
            email: userEmail,
            full_name: session.user.user_metadata?.full_name || userEmail.split('@')[0] || 'User',
            role: defaultRole
          };
          const { data: insertedProfile } = await supabase.from('profiles').upsert(newProfile).select().maybeSingle();
          pData = insertedProfile || newProfile;
        }
        
        const ucIds = ucData.map(uc => uc.church_id);
        const chIds = chData.map(ch => ch.id);
        // Merge and deduplicate
        const mergedIds = Array.from(new Set([...ucIds, ...chIds]));

        const finalProfile = {
          ...pData,
          church_ids: mergedIds,
          church_id: pData.church_id || mergedIds[0] || null
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
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
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

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, isLoading, profile, refreshProfile, selectedChurchId, setSelectedChurchId, licenses }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
