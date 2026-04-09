import { useEffect, useState, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  useEffect(() => {
    // First restore session from storage
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      initializedRef.current = true;
    });

    // Then listen for subsequent auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // Only update after initial session has been restored
        if (initializedRef.current) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, name?: string, companyName?: string) => {
    await supabase.auth.signOut();

    const redirectUrl = `${window.location.origin}/`;

    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { name },
      },
    });

    if (error) return { error, needsEmailConfirmation: false as const };
    if (!data.user) {
      return {
        error: new Error('Não foi possível criar o usuário.'),
        needsEmailConfirmation: false as const,
      };
    }

    if (!data.session) {
      return { error: null, needsEmailConfirmation: true as const };
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    if (sessionError) {
      return { error: sessionError, needsEmailConfirmation: false as const };
    }

    const { data: currentUser } = await supabase.auth.getUser();
    if (currentUser.user?.id !== data.user.id) {
      return {
        error: new Error('Sessão inválida. Por favor, tente novamente.'),
        needsEmailConfirmation: false as const,
      };
    }

    const baseSlug = (companyName || 'minha-empresa')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40);

    const slug = `${baseSlug || 'empresa'}-${Date.now().toString(36)}`;

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name: companyName || 'Minha Empresa',
        slug,
      })
      .select()
      .single();

    if (tenantError) {
      console.error('Tenant creation error:', tenantError);
      return { 
        error: null, 
        needsEmailConfirmation: false as const,
        needsOnboarding: true as const 
      };
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      email,
      name: name || null,
      tenant_id: tenant.id,
    });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      return { 
        error: null, 
        needsEmailConfirmation: false as const,
        needsOnboarding: true as const 
      };
    }

    return { error: null, needsEmailConfirmation: false as const, needsOnboarding: false as const };
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
