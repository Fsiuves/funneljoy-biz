import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  primaryColor: string;
}

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
}

export function useTenant() {
  return useQuery({
    queryKey: ['tenant'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Get user's tenant_id from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile?.tenant_id) return null;

      // Get tenant details
      const { data: tenant, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', profile.tenant_id)
        .maybeSingle();

      if (error || !tenant) return null;

      const row = tenant as TenantRow;
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        logoUrl: row.logo_url || undefined,
        primaryColor: row.primary_color,
      } as Tenant;
    },
  });
}

export async function getUserTenantId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  return profile?.tenant_id || null;
}
