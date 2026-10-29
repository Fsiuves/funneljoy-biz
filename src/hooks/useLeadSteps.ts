import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { minhaEmpresaId } from '@/lib/minhaEmpresa';
import { LeadStep, LeadStepKey } from '@/types/crm';
import { toast } from '@/hooks/use-toast';

interface LeadStepRow {
  id: string;
  lead_id: string;
  step_key: string;
  done: boolean;
  message: string | null;
  done_at: string | null;
  tenant_id: string;
}

const mapStep = (row: LeadStepRow): LeadStep => ({
  id: row.id,
  leadId: row.lead_id,
  stepKey: row.step_key as LeadStepKey,
  done: row.done,
  message: row.message || undefined,
  doneAt: row.done_at ? new Date(row.done_at) : undefined,
});

async function getUserTenantId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return minhaEmpresaId(user.id);
}

export function useLeadSteps(leadId?: string) {
  return useQuery({
    queryKey: ['lead_steps', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_steps')
        .select('*')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as LeadStepRow[])
        .filter((row) => row.lead_id === leadId)
        .map(mapStep);
    },
  });
}

/**
 * Quantas etapas da sequência cada paciente já fez, numa consulta só, para os
 * cartões do funil. Antes cada cartão buscava as suas: com 1.273 pacientes, o
 * funil disparava 1.273 consultas ao abrir e a cada volta para a janela
 * (auditoria de 29/10, "o CRM trava").
 */
export function usePassosFeitos(ativo = true) {
  return useQuery({
    queryKey: ['lead_steps', 'feitos'],
    enabled: ativo,
    staleTime: 60_000,
    queryFn: async () => {
      const feitos = new Map<string, number>();
      // O servidor devolve no máximo 1.000 linhas por vez.
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase
          .from('lead_steps')
          .select('lead_id')
          .eq('done', true)
          .order('id')
          .range(de, de + 999);
        if (error) throw error;
        for (const r of (data ?? []) as { lead_id: string }[]) feitos.set(r.lead_id, (feitos.get(r.lead_id) ?? 0) + 1);
        if (!data || data.length < 1000) return feitos;
      }
    },
  });
}

export function useUpsertLeadStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      leadId: string;
      stepKey: LeadStepKey;
      done: boolean;
      message?: string | null;
    }) => {
      const tenantId = await getUserTenantId();
      if (!tenantId) throw new Error('Empresa não encontrada');

      const { error } = await supabase.from('lead_steps').upsert(
        {
          lead_id: input.leadId,
          step_key: input.stepKey,
          done: input.done,
          message: input.message ?? null,
          done_at: input.done ? new Date().toISOString() : null,
          tenant_id: tenantId,
        },
        { onConflict: 'lead_id,step_key' }
      );
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['lead_steps', vars.leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead_steps', 'feitos'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao salvar etapa', description: error.message, variant: 'destructive' });
    },
  });
}