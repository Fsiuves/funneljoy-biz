import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buscarTudo } from '@/lib/buscarTudo';
import { minhaEmpresaId } from '@/lib/minhaEmpresa';
import { Activity, ActivityType } from '@/types/crm';
import { toast } from '@/hooks/use-toast';

interface ActivityRow {
  id: string;
  lead_id: string;
  type: string;
  description: string;
  created_at: string;
  created_by: string;
  tenant_id: string | null;
}

const mapActivityFromDb = (row: ActivityRow): Activity => ({
  id: row.id,
  leadId: row.lead_id,
  type: row.type as ActivityType,
  description: row.description,
  createdAt: new Date(row.created_at),
  createdBy: row.created_by,
});

async function getUserTenantId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  return minhaEmpresaId(user.id);
}

export function useActivities(leadId?: string) {
  return useQuery({
    queryKey: ['activities', leadId],
    queryFn: async () => {
      // De 1.000 em 1.000: o servidor devolve no máximo 1.000 linhas por vez.
      const data = await buscarTudo<any>((de, ate) => {
        let query = supabase
          .from('activities')
          .select('*')
          .order('created_at', { ascending: false })
          .order('id');
        if (leadId) query = query.eq('lead_id', leadId);
        return query.range(de, ate);
      });
      return (data as ActivityRow[]).map(mapActivityFromDb);
    },
  });
}

export function useCreateActivity() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (activity: {
      leadId: string;
      type: ActivityType;
      description: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const tenantId = await getUserTenantId();
      if (!tenantId) throw new Error('Empresa não encontrada');

      const { data, error } = await supabase
        .from('activities')
        .insert({
          lead_id: activity.leadId,
          type: activity.type,
          description: activity.description,
          created_by: user.id,
          tenant_id: tenantId,
        })
        .select()
        .single();
      
      if (error) throw error;
      return mapActivityFromDb(data as ActivityRow);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      toast({ title: 'Atividade registrada!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao registrar atividade', description: error.message, variant: 'destructive' });
    },
  });
}
