import { useSyncExternalStore } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { sairDaPresenca } from '@/lib/presenca';

// Quem está logado, uma vez só para o app inteiro. Antes cada tela e cada hook
// tinha o seu estado e começava sem usuário até o getSession responder: nesse
// intervalo as consultas da empresa ficavam desligadas e a tela da clínica caía
// no padrão da Dom ("Funil de Vendas", "Detalhes do lead", a sequência de
// contato), e voltava em seguida. Com várias abas abertas o intervalo chegava a
// segundos (vídeo da recepção de 19/10).
interface EstadoAuth {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

let estado: EstadoAuth = { session: null, user: null, loading: true };
const ouvintes = new Set<() => void>();
let iniciado = false;

function guardar(session: Session | null) {
  // Renovar o token troca o objeto da sessão, mas não a pessoa: mantém o mesmo
  // user para não refazer tudo o que depende dele a cada renovação.
  const mesmo = estado.user && session?.user && JSON.stringify(estado.user) === JSON.stringify(session.user);
  estado = { session, user: mesmo ? estado.user : session?.user ?? null, loading: false };
  ouvintes.forEach((avisar) => avisar());
}

function iniciar() {
  if (iniciado) return;
  iniciado = true;
  // Primeiro a sessão guardada; os eventos só valem depois dela.
  supabase.auth.getSession().then(({ data: { session } }) => guardar(session));
  supabase.auth.onAuthStateChange((_event, session) => {
    if (!estado.loading) guardar(session);
  });
}

function assinar(avisar: () => void) {
  iniciar();
  ouvintes.add(avisar);
  return () => ouvintes.delete(avisar);
}

export function useAuth() {
  const { user, session, loading } = useSyncExternalStore(assinar, () => estado);

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

    // Empresa, perfil e papel de admin numa chamada só, no servidor. O insert
    // direto de perfil com tenant_id deixou de ser aceito: era por ele que
    // qualquer cadastro virava admin de uma empresa alheia.
    const { error: tenantError } = await supabase.rpc('create_my_tenant', {
      _company_name: (companyName || 'Minha Empresa').trim(),
    });

    if (tenantError) {
      console.error('Tenant creation error:', tenantError);
      return {
        error: null,
        needsEmailConfirmation: false as const,
        needsOnboarding: true as const
      };
    }

    return { error: null, needsEmailConfirmation: false as const, needsOnboarding: false as const };
  };

  const signOut = async () => {
    await sairDaPresenca();
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
