import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { minhaEmpresaId } from '@/lib/minhaEmpresa';
import { buscarTudo } from '@/lib/buscarTudo';
import { Lead, LeadSource, LeadStage } from '@/types/crm';
import { toast } from '@/hooks/use-toast';
import { useVocabulario } from '@/hooks/useEmpresa';

interface LeadRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string | null;
  source: string;
  stage: string;
  value: number | null;
  assigned_to: string | null;
  next_follow_up: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  tenant_id: string | null;
  notes?: string | null;
  unidade?: string | null;
  cpf?: string | null;
  endereco?: string | null;
}

const mapLeadFromDb = (row: LeadRow): Lead => ({
  id: row.id,
  name: row.name,
  email: row.email || undefined,
  phone: row.phone,
  company: row.company || undefined,
  source: row.source as LeadSource,
  stage: row.stage as LeadStage,
  value: row.value || undefined,
  assignedTo: row.assigned_to || undefined,
  nextFollowUp: row.next_follow_up ? new Date(row.next_follow_up) : undefined,
  tags: row.tags || undefined,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
  notes: row.notes || undefined,
  unidade: row.unidade || undefined,
  cpf: row.cpf || undefined,
  endereco: row.endereco || undefined,
});

async function getUserTenantId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  return minhaEmpresaId(user.id);
}

/**
 * Clientes importados do cadastro da clínica (04/11/2026, 5.271 pessoas). Já eram
 * clientes: contá-los como "Fechou plano" levava a conversão do Dashboard para
 * perto de 90% e lotava o funil. Ficam em Pacientes e fora do funil e dos números.
 * Quem volta a agendar muda de etapa e entra no funil normalmente.
 */
export const TAG_BASE = 'Base da clínica';
export const ehDaBase = (lead: Lead) => lead.stage === 'fechou_plano' && !!lead.tags?.includes(TAG_BASE);

export function useLeads() {
  return useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const data = await buscarTudo<LeadRow>((de, ate) => supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id')
        .range(de, ate) as unknown as PromiseLike<{ data: LeadRow[] | null; error: unknown }>);
      const leads = data.map(mapLeadFromDb);

      // Fetch profile names for created_by and assigned_to
      const userIds = new Set<string>();
      data.forEach((row: LeadRow) => {
        if (row.created_by) userIds.add(row.created_by);
        if (row.assigned_to) userIds.add(row.assigned_to);
      });

      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', Array.from(userIds));

        const profileMap = new Map(
          (profiles || []).map(p => [p.id, p.name || p.email])
        );

        leads.forEach((lead, i) => {
          const row = data[i];
          lead.createdByName = profileMap.get(row.created_by) || undefined;
          lead.assignedToName = row.assigned_to ? profileMap.get(row.assigned_to) || undefined : undefined;
        });
      }

      return leads;
    },
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  const v = useVocabulario();
  
  return useMutation({
    mutationFn: async (lead: {
      name: string;
      email?: string;
      phone: string;
      company?: string;
      source: LeadSource;
      value?: number;
      unidade?: string;
      cpf?: string;
      endereco?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const tenantId = await getUserTenantId();
      if (!tenantId) throw new Error('Empresa não encontrada. Faça login novamente.');

      const { data, error } = await supabase
        .from('leads')
        .insert({
          name: lead.name,
          email: lead.email || null,
          phone: lead.phone,
          company: lead.company || null,
          source: lead.source,
          value: lead.value || null,
          cpf: lead.cpf || null,
          endereco: lead.endereco || null,
          created_by: user.id,
          tenant_id: tenantId,
          // Sem unidade, o banco usa a de quem cadastra (atendente).
          ...(lead.unidade ? { unidade: lead.unidade } : {}),
        })
        .select()
        .single();
      
      if (error) throw error;
      return mapLeadFromDb(data as LeadRow);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: `${v.Lead} ${v.feminino ? 'criada' : 'criado'} com sucesso!` });
    },
    onError: (error: Error) => {
      toast({ title: `Erro ao criar ${v.lead}`, description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateLeadStage() {
  const queryClient = useQueryClient();
  const v = useVocabulario();
  
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: LeadStage }) => {
      const { error } = await supabase
        .from('leads')
        .update({ stage, updated_at: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (error: Error) => {
      toast({ title: `Erro ao atualizar ${v.lead}`, description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  const v = useVocabulario();
  
  return useMutation({
    mutationFn: async ({
      id,
      nextFollowUp,
      notes,
      name,
      email,
      phone,
      company,
      source,
      value,
      cpf,
      endereco,
    }: {
      id: string;
      nextFollowUp?: Date | null;
      notes?: string | null;
      name?: string;
      email?: string | null;
      phone?: string;
      company?: string | null;
      source?: LeadSource;
      value?: number | null;
      cpf?: string | null;
      endereco?: string | null;
    }) => {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      
      if (nextFollowUp !== undefined) {
        updateData.next_follow_up = nextFollowUp ? nextFollowUp.toISOString() : null;
      }
      if (notes !== undefined) updateData.notes = notes;
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (company !== undefined) updateData.company = company;
      if (source !== undefined) updateData.source = source;
      if (value !== undefined) updateData.value = value;
      if (cpf !== undefined) updateData.cpf = cpf;
      if (endereco !== undefined) updateData.endereco = endereco;

      const { error } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (error: Error) => {
      toast({ title: `Erro ao atualizar ${v.lead}`, description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  const v = useVocabulario();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('leads')
        .delete()
        .eq('id', id)
        .select('id');
      if (error) throw error;
      // A regra do banco recusa sem erro (atendente não exclui): nada saiu.
      if (!data?.length) throw new Error('Você não tem permissão para excluir este cadastro.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: `${v.Lead} ${v.feminino ? 'excluída' : 'excluído'} com sucesso!` });
    },
    onError: (error: Error) => {
      toast({ title: `Erro ao excluir ${v.lead}`, description: error.message, variant: 'destructive' });
    },
  });
}
