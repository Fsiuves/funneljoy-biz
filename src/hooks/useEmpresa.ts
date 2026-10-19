// Vocabulário e etapas do funil da empresa de quem está logado.
//
// Empresa sem configuração própria fica com o de sempre: "lead", "Funil de
// Vendas" e as etapas de LEAD_STAGES. A Coluna Ajustada tem "paciente" e as
// etapas da clínica (crm.tenants.config e crm.funil_etapas).

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LEAD_STAGES } from '@/types/crm';
import { useAuth } from './useAuth';

const crm = supabase as any;

export type TipoEtapa = 'aberta' | 'ganho' | 'perdido';

export interface Etapa {
  value: string;
  label: string;
  /** Cor pronta para CSS: hex das etapas da empresa, variável do tema nas de sempre. */
  cor: string;
  tipo: TipoEtapa;
}

// As de sempre, com o comportamento de sempre: só 'won' é ganho e só 'lost' é
// perda. "Não tem interesse" sempre contou como ativo nos números do DOM.
const ETAPAS_PADRAO: Etapa[] = LEAD_STAGES.map((s) => ({
  value: s.value,
  label: s.label,
  cor: `hsl(var(--${s.color}))`,
  tipo: s.value === 'won' ? 'ganho' : s.value === 'lost' ? 'perdido' : 'aberta',
}));

interface ConfigEmpresa {
  vocabulario?: {
    lead?: string;
    leads?: string;
    genero?: 'm' | 'f';
    funil?: string;
  };
  menu?: {
    /** Item que abre o menu. */
    primeiro?: string;
    /** Telas que a empresa não usa. */
    ocultar?: string[];
    /** O que cada papel enxerga; a primeira é a tela inicial dele. */
    papeis?: Record<string, string[]>;
  };
  funil?: {
    /** false esconde a sequência de contato (0/7) da Dom nos cards. */
    sequencia?: boolean;
  };
  /** PDF do guia do CRM, aberto pelo menu. */
  guia_url?: string;
}

interface LinhaEtapa {
  chave: string;
  rotulo: string;
  cor: string;
  tipo: TipoEtapa;
}

function useConfigEmpresa() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['config-empresa', user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    // Até responder: falha não pode deixar a tela com o padrão da Dom.
    retry: true,
    retryDelay: (tentativa: number) => Math.min(1000 * 2 ** tentativa, 10_000),
    queryFn: async () => {
      const [empresa, etapas] = await Promise.all([
        crm.from('tenants').select('config').maybeSingle(),
        crm.from('funil_etapas').select('chave, rotulo, cor, tipo').order('ordem'),
      ]);
      // Falha não é "empresa sem configuração": sem o throw, a clínica ficava
      // 5 minutos com a cara e as etapas da Dom. Com ele, a consulta tenta de
      // novo e a tela segue com o que já tinha.
      if (empresa.error) throw empresa.error;
      if (etapas.error) throw etapas.error;
      return {
        config: (empresa.data?.config ?? {}) as ConfigEmpresa,
        etapas: (etapas.data ?? []) as LinhaEtapa[],
      };
    },
  });
}

/** A configuração da empresa (tenants.config). */
export function useConfig() {
  const { data, isLoading } = useConfigEmpresa();
  return { config: data?.config ?? ({} as ConfigEmpresa), carregando: isLoading };
}

export function useEtapas() {
  const { data, isLoading } = useConfigEmpresa();
  const etapas: Etapa[] = data?.etapas.length
    ? data.etapas.map((e) => ({ value: e.chave, label: e.rotulo, cor: e.cor, tipo: e.tipo }))
    : ETAPAS_PADRAO;
  const porChave = new Map(etapas.map((e) => [e.value, e]));

  return {
    etapas,
    /** Enquanto carrega, o funil não desenha: evita mostrar as etapas erradas e trocar. */
    carregando: isLoading,
    /** A empresa tem etapas próprias (crm.funil_etapas); sem elas, valem as padrão. */
    personalizadas: !!data?.etapas.length,
    rotulo: (v: string) => porChave.get(v)?.label ?? v,
    cor: (v: string) => porChave.get(v)?.cor ?? 'hsl(var(--muted-foreground))',
    ehGanho: (v: string) => porChave.get(v)?.tipo === 'ganho',
    estaAberta: (v: string) => (porChave.get(v)?.tipo ?? 'aberta') === 'aberta',
  };
}

/** Papel de quem está logado na empresa atual. O RLS de user_roles só devolve os dela. */
export function useMeuPapel() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['meu-papel', user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    // Até responder: falha não pode deixar a tela com o padrão da Dom.
    retry: true,
    retryDelay: (tentativa: number) => Math.min(1000 * 2 ** tentativa, 10_000),
    queryFn: async () => {
      const { data, error } = await crm.from('user_roles').select('role').eq('user_id', user!.id).maybeSingle();
      // Sem papel o menu mostra tudo: falha tenta de novo, não vira "sem papel".
      if (error) throw error;
      return (data?.role ?? null) as string | null;
    },
  });
}

/**
 * O que aparece no menu e qual é a tela inicial. Esconder é conforto, não
 * segurança: quem protege o dado é o RLS.
 */
export function useMenu() {
  const { data, isLoading } = useConfigEmpresa();
  const { data: papel, isLoading: carregandoPapel } = useMeuPapel();
  const menu = data?.config.menu ?? {};
  const ocultar = new Set(menu.ocultar ?? []);
  const doPapel = papel ? menu.papeis?.[papel] : undefined;

  const permitido = (path: string) => !ocultar.has(path) && (!doPapel || doPapel.includes(path));

  return {
    carregando: isLoading || carregandoPapel,
    permitido,
    primeiro: menu.primeiro,
    inicio: doPapel?.[0] ?? '/',
    papel: papel ?? null,
  };
}

export interface Vocabulario {
  lead: string;
  leads: string;
  Lead: string;
  Leads: string;
  /** "Novo lead", "Novo paciente" */
  novo: string;
  /** "Nenhum lead", "Nenhum paciente" */
  nenhum: string;
  /** "do lead", "do paciente" */
  do: string;
  /** "este lead" */
  este: string;
  /** "um lead" */
  um: string;
  /** "seu primeiro lead" */
  primeiro: string;
  funil: string;
  /** Palavra feminina ("criada", "excluída"). */
  feminino: boolean;
}

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function useVocabulario(): Vocabulario {
  const { data } = useConfigEmpresa();
  const v = data?.config.vocabulario ?? {};
  const lead = v.lead ?? 'lead';
  const leads = v.leads ?? 'leads';
  const f = v.genero === 'f';
  return {
    lead,
    leads,
    Lead: maiuscula(lead),
    Leads: maiuscula(leads),
    novo: `${f ? 'Nova' : 'Novo'} ${lead}`,
    nenhum: `${f ? 'Nenhuma' : 'Nenhum'} ${lead}`,
    do: `${f ? 'da' : 'do'} ${lead}`,
    este: `${f ? 'esta' : 'este'} ${lead}`,
    um: `${f ? 'uma' : 'um'} ${lead}`,
    primeiro: `${f ? 'sua primeira' : 'seu primeiro'} ${lead}`,
    funil: v.funil ?? 'Funil de Vendas',
    feminino: f,
  };
}
