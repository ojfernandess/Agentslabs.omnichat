import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: string;
}

interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'supervisor' | 'agent';
  display_name: string | null;
  avatar_url: string | null;
  status: string | null;
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

    const { data: members } = await supabase
      .from('organization_members')
      .select('*, organizations(*)')
      .eq('user_id', user.id);

    if (members && members.length > 0) {
      const orgs = members.map((m: any) => m.organizations as Organization);
      setOrganizations(orgs);

      const savedOrgId = localStorage.getItem('currentOrgId');
      const found = orgs.find(o => o.id === savedOrgId);
      const selected = found || orgs[0];
      setCurrentOrg(selected);

      const member = members.find((m: any) => m.organization_id === selected.id);
      setCurrentMember(member ? {
        id: member.id,
        organization_id: member.organization_id,
        user_id: member.user_id,
        role: member.role,
        display_name: member.display_name,
        avatar_url: member.avatar_url,
        status: member.status,
      } : null);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchOrgs();
  }, [user]);

  const handleSetCurrentOrg = (org: Organization) => {
    setCurrentOrg(org);
    localStorage.setItem('currentOrgId', org.id);
  };

  const createOrganization = async (name: string, slug: string) => {
    if (!user) return { error: 'Not authenticated' };

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name, slug })
      .select()
      .single();

    if (orgError) return { error: orgError };

    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: org.id,
        user_id: user.id,
        role: 'owner' as any,
        display_name: user.user_metadata?.display_name || user.email,
      });

    if (memberError) return { error: memberError };

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
