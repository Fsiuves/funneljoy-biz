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

    if (error) return { error, needsEmailConfirmation: false as const };
    if (!data.user) {
      return {
        error: new Error('Não foi possível criar o usuário.'),
        needsEmailConfirmation: false as const,
      };
    }

    // Se a confirmação por email estiver habilitada, não haverá sessão agora.
    // Nesse caso, o usuário precisa confirmar o email e fazer login antes de criarmos o tenant/perfil.
    if (!data.session) {
      return { error: null, needsEmailConfirmation: true as const };
    }

    // Garante que o cliente está autenticado ANTES de chamar o banco (evita RLS no signup)
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    // Create tenant and profile after signup (requires authenticated session)
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

    if (tenantError) return { error: tenantError, needsEmailConfirmation: false as const };

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      email,
      name: name || null,
      tenant_id: tenant.id,
    });

    if (profileError) return { error: profileError, needsEmailConfirmation: false as const };

    return { error: null, needsEmailConfirmation: false as const };
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
