import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useIsSuperAdmin() {
  const { user } = useAuth();

  const { data: isSuperAdmin = false } = useQuery({
    queryKey: ['super-admin', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data, error } = await supabase
        .from('super_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        if (error.code === '42P01') return false; // table does not exist yet
        throw error;
      }
      return !!data;
    },
    enabled: !!user?.id,
  });

  return isSuperAdmin;
}
