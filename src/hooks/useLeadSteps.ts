import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
  const { data: profile } = await supabase
    .from('profiles').select('tenant_id').eq('id', user.id).maybeSingle();
  return profile?.tenant_id || null;
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
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao salvar etapa', description: error.message, variant: 'destructive' });
    },
  });
}