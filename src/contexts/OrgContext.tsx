import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';
import type { Json } from '@/integrations/supabase/types';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
  settings: Json | null;
}

interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'supervisor' | 'agent';
  display_name: string | null;
  avatar_url: string | null;
  status: string | null;
  auto_offline?: boolean;
  message_signature?: string | null;
}

interface OrgContextType {
  organizations: Organization[];
  currentOrg: Organization | null;
  currentMember: OrgMember | null;
  setCurrentOrg: (org: Organization) => void;
  loading: boolean;
  createOrganization: (name: string, slug: string) => Promise<{ error: any }>;
  refetch: () => void;
}

const OrgContext = createContext<OrgContextType | undefined>(undefined);

export const OrgProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [currentMember, setCurrentMember] = useState<OrgMember | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrgs = async () => {
    if (!user) {
      setOrganizations([]);
      setCurrentOrg(null);
      setCurrentMember(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setOrganizations([]);
        setCurrentOrg(null);
        setCurrentMember(null);
        return;
      }

      // Consulta em dois passos: o embed organizations(...) pode vir null com RLS/PostgREST
      // e deixava currentOrg sempre null → onboarding incorrecto.
      const cols = 'id, organization_id, user_id, role, display_name, avatar_url, status, auto_offline';
      let members: { id: string; organization_id: string; user_id: string; role: string; display_name: string | null; avatar_url: string | null; status: string | null; auto_offline?: boolean; message_signature?: string | null }[];
      const { data: data1, error: membersError } = await supabase
        .from('organization_members')
        .select(`${cols}, message_signature`)
        .eq('user_id', user.id);
      if (membersError) {
        const { data: data2, error: err2 } = await supabase
          .from('organization_members')
          .select(cols)
          .eq('user_id', user.id);
        if (err2) {
          console.error('[OrgContext] organization_members', membersError);
          return;
        }
        members = (data2 ?? []).map((m) => ({ ...m, message_signature: null }));
      } else {
        members = (data1 ?? []) as typeof data1 & { message_signature?: string | null }[];
      }

      if (!members.length) {
        setOrganizations([]);
        setCurrentOrg(null);
        setCurrentMember(null);
        return;
      }

      const orgIds = [...new Set(members.map((m) => m.organization_id))];
      const { data: orgRows, error: orgsError } = await supabase
        .from('organizations')
        .select('id, name, slug, logo_url, plan, settings')
        .in('id', orgIds);

      if (orgsError) {
        console.error('[OrgContext] organizations', orgsError);
        return;
      }

      if (!orgRows?.length) {
        setOrganizations([]);
        setCurrentOrg(null);
        setCurrentMember(null);
        return;
      }

      const orgs = orgRows as Organization[];
      setOrganizations(orgs);

      const savedOrgId = localStorage.getItem('currentOrgId');
      const found = orgs.find((o) => o.id === savedOrgId);
      const selected = found ?? orgs[0];
      setCurrentOrg(selected ?? null);

      const member = members.find((m) => m.organization_id === selected?.id);
      setCurrentMember(
        member
          ? {
              id: member.id,
              organization_id: member.organization_id,
              user_id: member.user_id,
              role: member.role,
              display_name: member.display_name,
              avatar_url: member.avatar_url,
              status: member.status,
              auto_offline: (member as { auto_offline?: boolean }).auto_offline,
              message_signature: (member as { message_signature?: string | null }).message_signature,
            }
          : null
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, [user]);

  useEffect(() => {
    if (!user || !currentOrg) return;
    let cancelled = false;
    (async () => {
      const { data: m, error } = await supabase
        .from('organization_members')
        .select('id, organization_id, user_id, role, display_name, avatar_url, status, auto_offline, message_signature')
        .eq('user_id', user.id)
        .eq('organization_id', currentOrg.id)
        .maybeSingle();
      if (cancelled) return;
      if (!m && error) {
        const { data: m2 } = await supabase
            .from('organization_members')
            .select('id, organization_id, user_id, role, display_name, avatar_url, status, auto_offline')
            .eq('user_id', user.id)
            .eq('organization_id', currentOrg.id)
            .maybeSingle();
        if (cancelled || !m2) return;
        const mm = m2 as typeof m2 & { message_signature?: string | null };
        setCurrentMember({
          id: mm.id,
          organization_id: mm.organization_id,
          user_id: mm.user_id,
          role: mm.role,
          display_name: mm.display_name,
          avatar_url: mm.avatar_url,
          status: mm.status,
          auto_offline: (mm as { auto_offline?: boolean }).auto_offline ?? true,
          message_signature: null,
        });
        return;
      }
      if (!m) return;
      const mm = m as typeof m & { auto_offline?: boolean; message_signature?: string | null };
      setCurrentMember({
        id: mm.id,
        organization_id: mm.organization_id,
        user_id: mm.user_id,
        role: mm.role,
        display_name: mm.display_name,
        avatar_url: mm.avatar_url,
        status: mm.status,
        auto_offline: mm.auto_offline ?? true,
        message_signature: mm.message_signature,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user, currentOrg?.id]);

  useEffect(() => {
    if (!user || !currentMember) return;
    const memberId = currentMember.id;
    const autoOffline = currentMember.auto_offline ?? true;
    const pulse = async () => {
      await supabase.from('organization_members').update({ status: 'online' }).eq('id', memberId);
    };
    pulse();
    const interval = window.setInterval(pulse, 45_000);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (autoOffline) {
          void supabase.from('organization_members').update({ status: 'offline' }).eq('id', memberId);
        }
      } else {
        void pulse();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, currentMember?.id, currentMember?.auto_offline]);

  const handleSetCurrentOrg = (org: Organization) => {
    setCurrentOrg(org);
    localStorage.setItem('currentOrgId', org.id);
  };

  const createOrganization = async (name: string, slug: string) => {
    if (!user) return { error: 'Not authenticated' };

    const { error: rpcError } = await supabase.rpc('create_organization_with_owner', {
      p_name: name.trim(),
      p_slug: slug.trim(),
    });

    if (rpcError) return { error: rpcError };

    await fetchOrgs();
    return { error: null };
  };

  return (
    <OrgContext.Provider value={{
      organizations,
      currentOrg,
      currentMember,
      setCurrentOrg: handleSetCurrentOrg,
      loading,
      createOrganization,
      refetch: fetchOrgs,
    }}>
      {children}
    </OrgContext.Provider>
  );
};

export const useOrg = () => {
  const context = useContext(OrgContext);
  if (!context) throw new Error('useOrg must be used within OrgProvider');
  return context;
};
