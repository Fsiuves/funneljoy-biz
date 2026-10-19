import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { minhaEmpresaId } from '@/lib/minhaEmpresa';
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
  pia_ativo?: boolean | null;
  dominio?: string | null;
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
  const qc = useQueryClient();
  const chave = ['tenant', user?.id];

  // No cache: o menu se monta de novo a cada tela, e sem cache o logo e o nome
  // da empresa sumiam ("CRM Dom Intelligence") até a consulta voltar.
  const consulta = useQuery({
    queryKey: chave,
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // A da aba, se a pessoa tem papel nela; senão a do perfil.
      const tenantId = await minhaEmpresaId(user!.id);
      if (!tenantId) return null;
      const { data, error } = await supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Tenant | null;
    },
  });
  const tenant = consulta.data ?? null;
  const loading = !!user && consulta.isLoading;
  const setTenant = (novo: Tenant) => qc.setQueryData(chave, novo);
  const fetchTenant = async () => {
    await consulta.refetch();
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

  const inviteTeamMember = async (
    email: string,
    name: string,
    password: string,
    role: 'admin' | 'manager' | 'atendente' | 'sales' = 'sales',
    unidade: string | null = null,
  ) => {
    if (!tenant) return { error: 'No tenant found' };

    const { data, error } = await supabase.functions.invoke('create-team-member', {
      body: { email, name, password, role, unidade },
    });

    if (error) {
      return { error: error.message || 'Erro ao criar membro' };
    }

    if (data?.error) {
      const errorMessages: Record<string, string> = {
        not_authenticated: 'Você precisa estar logado',
        not_authorized: 'Você não tem permissão para convidar membros',
        no_tenant: 'Empresa não encontrada',
        invalid_email: 'Email inválido',
        invalid_name: 'Nome deve ter pelo menos 2 caracteres',
        invalid_role: 'Função inválida',
        unidade_invalida: 'Unidade não encontrada nesta empresa',
        email_em_outra_empresa: 'Este email já pertence a outra empresa',
        email_already_exists: 'Este usuário ou email já está cadastrado nesta empresa',
        usuario_de_outra_empresa: 'Esse usuário pertence a outra empresa',
        so_atendente: 'A gerente cadastra só atendentes',
        outra_unidade: 'Você só cadastra atendentes da sua unidade',
        atendente_sem_unidade: 'Atendente precisa de uma unidade',
        ja_cadastrado: 'Essa pessoa já está na equipe',
      };
      return { error: errorMessages[data.error] || data.error };
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
