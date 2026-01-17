import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Activity, ActivityType } from '@/types/crm';
import { toast } from '@/hooks/use-toast';

interface ActivityRow {
  id: string;
  lead_id: string;
  type: string;
  description: string;
  created_at: string;
  created_by: string;
}

const mapActivityFromDb = (row: ActivityRow): Activity => ({
  id: row.id,
  leadId: row.lead_id,
  type: row.type as ActivityType,
  description: row.description,
  createdAt: new Date(row.created_at),
  createdBy: row.created_by,
});

export function useActivities(leadId?: string) {
  return useQuery({
    queryKey: ['activities', leadId],
    queryFn: async () => {
      let query = supabase
        .from('activities')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (leadId) {
        query = query.eq('lead_id', leadId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
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

      const { data, error } = await supabase
        .from('activities')
        .insert({
          lead_id: activity.leadId,
          type: activity.type,
          description: activity.description,
          created_by: user.id,
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
