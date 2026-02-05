import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface TenantCheckResult {
  hasTenant: boolean | null;
  loading: boolean;
  tenantId: string | null;
}

export function useTenantCheck(): TenantCheckResult {
  const { user, loading: authLoading } = useAuth();
  const [hasTenant, setHasTenant] = useState<boolean | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setHasTenant(null);
      setTenantId(null);
      setLoading(false);
      return;
    }

    const checkTenant = async () => {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error checking tenant:', error);
          setHasTenant(false);
          setTenantId(null);
        } else if (profile?.tenant_id) {
          setHasTenant(true);
          setTenantId(profile.tenant_id);
        } else {
          setHasTenant(false);
          setTenantId(null);
        }
      } catch (error) {
        console.error('Error checking tenant:', error);
        setHasTenant(false);
        setTenantId(null);
      } finally {
        setLoading(false);
      }
    };

    checkTenant();
  }, [user, authLoading]);

  return { hasTenant, loading, tenantId };
}
