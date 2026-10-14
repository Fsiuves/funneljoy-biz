import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// As funções de resultados não estão nos tipos gerados do Lovable.
const crm = supabase as any;

/** Uma linha por anúncio (Meta), campanha (Google) ou unidade (sem anúncio). Ver 19-resultados.sql. */
export interface LinhaResultado {
  plataforma: 'meta' | 'google' | null;
  unidade: string | null;
  campanha_id: string | null;
  campanha: string | null;
  anuncio_id: string | null;
  anuncio: string | null;
  gasto: number;
  impressoes: number;
  cliques: number;
  conversas_plataforma: number | null;
  contatos: number;
  agendaram: number;
  compareceram: number;
  fecharam: number;
  valor: number;
}

export interface Sincronizacao {
  concluido_em: string | null;
  ok: boolean | null;
  detalhe: { avisos?: string[] } | null;
  configurado: boolean;
}

/** Contatos que chegaram de "de" a "ate" (dias, inclusive) e o gasto do período. */
export function useResultados(de: string, ate: string) {
  return useQuery({
    queryKey: ['resultados', de, ate],
    queryFn: async () => {
      const { data, error } = await crm.rpc('resultados_anuncios', { _de: de, _ate: ate });
      if (error) throw error;
      return ((data ?? []) as LinhaResultado[]).map((l) => ({
        ...l,
        gasto: Number(l.gasto), valor: Number(l.valor), contatos: Number(l.contatos),
        agendaram: Number(l.agendaram), compareceram: Number(l.compareceram), fecharam: Number(l.fecharam),
        conversas_plataforma: l.conversas_plataforma === null ? null : Number(l.conversas_plataforma),
      }));
    },
  });
}

export function useSincronizacao() {
  return useQuery({
    queryKey: ['anuncios-sync'],
    queryFn: async () => {
      const { data, error } = await crm.rpc('anuncios_sincronizacao');
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as Sincronizacao | null;
    },
  });
}

/** Busca no Vigia o gasto e a origem mais recentes (anuncios-sincronizar). */
export function useSincronizar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (forcar: boolean) => {
      const { data, error } = await supabase.functions.invoke('anuncios-sincronizar', { body: { forcar } });
      if (error) throw error;
      return data;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['resultados'] });
      qc.invalidateQueries({ queryKey: ['anuncios-sync'] });
    },
  });
}
