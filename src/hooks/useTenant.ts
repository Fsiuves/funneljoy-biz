import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  primary_color?: string;
  secondary_color?: string;
}

interface Profile {
  id: string;
  email: string;
  name: string | null;
  tenant_id: string;
}

export function useTenant() {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchTenant();
    } else {
      setTenant(null);
      setLoading(false);
    }
  }, [user]);

  const fetchTenant = async () => {
    if (!user) return;

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.tenant_id) {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', profile.tenant_id)
          .maybeSingle();

        setTenant(tenantData);
      }
    } catch (error) {
      console.error('Error fetching tenant:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateTenant = async (updates: Partial<Tenant>) => {
    if (!tenant) return { error: 'No tenant found' };

    const { error } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', tenant.id);

    if (!error) {
      setTenant({ ...tenant, ...updates });
    }

    return { error };
  };

  const getTeamMembers = async (): Promise<Profile[]> => {
    if (!tenant) return [];

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('tenant_id', tenant.id);

    return data || [];
  };

  const inviteTeamMember = async (email: string, name: string, password: string) => {
    if (!tenant) return { error: 'No tenant found' };

    // Create user via Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (error) return { error: error.message };

    if (data.user) {
      // Create profile for new user
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        name,
        tenant_id: tenant.id,
      });

      if (profileError) return { error: profileError.message };
    }

    return { error: null };
  };

  return {
    tenant,
    loading,
    updateTenant,
    getTeamMembers,
    inviteTeamMember,
    refetch: fetchTenant,
  };
}
