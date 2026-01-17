import { useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, name?: string, companyName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { name },
      },
    });
    
    // Create tenant and profile after signup
    if (!error && data.user) {
      // Create tenant first
      const slug = companyName 
        ? companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
        : `empresa-${Date.now()}`;
      
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: companyName || 'Minha Empresa',
          slug: slug,
        })
        .select()
        .single();
      
      if (tenantError) {
        console.error('Error creating tenant:', tenantError);
        return { error: tenantError };
      }

      // Create profile with tenant_id
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email: email,
        name: name || null,
        tenant_id: tenant.id,
      });

      if (profileError) {
        console.error('Error creating profile:', profileError);
      }
    }
    
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    isAuthenticated: !!session,
  };
}
