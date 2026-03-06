import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Lead, LeadSource, LeadStage } from '@/types/crm';
import { toast } from '@/hooks/use-toast';

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
});

async function getUserTenantId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  return profile?.tenant_id || null;
}

export function useLeads() {
  return useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data as LeadRow[]).map(mapLeadFromDb);
    },
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (lead: {
      name: string;
      email?: string;
      phone: string;
      company?: string;
      source: LeadSource;
      value?: number;
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
          created_by: user.id,
          tenant_id: tenantId,
        })
        .select()
        .single();
      
      if (error) throw error;
      return mapLeadFromDb(data as LeadRow);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Lead criado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar lead', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateLeadStage() {
  const queryClient = useQueryClient();
  
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
      toast({ title: 'Erro ao atualizar lead', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, nextFollowUp }: { id: string; nextFollowUp?: Date | null }) => {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      
      if (nextFollowUp !== undefined) {
        updateData.next_follow_up = nextFollowUp ? nextFollowUp.toISOString() : null;
      }

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
      toast({ title: 'Erro ao atualizar lead', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Lead excluído com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao excluir lead', description: error.message, variant: 'destructive' });
    },
  });
}
