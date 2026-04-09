import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface TenantCheckResult {
  hasTenant: boolean | null;
  loading: boolean;
  tenantId: string | null;
}

export function useTenantCheck(user: User | null, authLoading: boolean): TenantCheckResult {
  const [hasTenant, setHasTenant] = useState<boolean | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    if (authLoading) {
      setLoading(true);
      return () => {
        isMounted = false;
      };
    }

    if (!user) {
      setHasTenant(null);
      setTenantId(null);
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    const checkTenant = async () => {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('id', user.id)
          .maybeSingle();

        if (!isMounted) return;

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
        if (!isMounted) return;
        console.error('Error checking tenant:', error);
        setHasTenant(false);
        setTenantId(null);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    setLoading(true);
    void checkTenant();

    return () => {
      isMounted = false;
    };
  }, [user, authLoading]);

  return { hasTenant, loading, tenantId };
}
