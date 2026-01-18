import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  address?: string | null;
  cnpj?: string | null;
  system_logo_url?: string | null;
  favicon_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
}

interface Profile {
  id: string;
  email: string;
  name: string | null;
  tenant_id: string;
}

interface TeamMemberWithRole extends Profile {
  role?: 'admin' | 'manager' | 'sales';
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

        setTenant(tenantData as Tenant);
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

  const getTeamMembers = async (): Promise<TeamMemberWithRole[]> => {
    if (!tenant) return [];

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .eq('tenant_id', tenant.id);

    if (!profiles) return [];

    // Get roles for all members
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .eq('tenant_id', tenant.id);

    const rolesMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);

    return profiles.map(profile => ({
      ...profile,
      role: rolesMap.get(profile.id) as 'admin' | 'manager' | 'sales' | undefined,
    }));
  };

  const updateMemberRole = async (userId: string, role: 'admin' | 'manager' | 'sales') => {
    if (!tenant) return { error: 'No tenant found' };

    // Check if role exists
    const { data: existingRole } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('tenant_id', tenant.id)
      .maybeSingle();

    if (existingRole) {
      // Update existing role
      const { error } = await supabase
        .from('user_roles')
        .update({ role })
        .eq('user_id', userId)
        .eq('tenant_id', tenant.id);

      return { error: error?.message || null };
    } else {
      // Insert new role
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role,
          tenant_id: tenant.id,
        });

      return { error: error?.message || null };
    }
  };

  const inviteTeamMember = async (email: string, name: string, password: string, role: 'admin' | 'manager' | 'sales' = 'sales') => {
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

      // Assign role
      const { error: roleError } = await supabase.from('user_roles').insert({
        user_id: data.user.id,
        role,
        tenant_id: tenant.id,
      });

      if (roleError) return { error: roleError.message };
    }

    return { error: null };
  };

  const uploadLogo = async (file: File, type: 'company' | 'system' | 'favicon'): Promise<{ url: string | null; error: string | null }> => {
    if (!tenant) return { url: null, error: 'No tenant found' };

    const fileExt = file.name.split('.').pop();
    const fileName = `${tenant.id}/${type}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data: urlData } = supabase.storage
      .from('logos')
      .getPublicUrl(fileName);

    return { url: urlData.publicUrl, error: null };
  };

  return {
    tenant,
    loading,
    updateTenant,
    getTeamMembers,
    inviteTeamMember,
    updateMemberRole,
    uploadLogo,
    refetch: fetchTenant,
  };
}
