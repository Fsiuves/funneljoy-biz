import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, Loader2, Maximize } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { avisarPresenca } from '@/lib/presenca';
import { FORMAS, ROTULO_TIPO, reais, type FormaFechamento, type TipoHorario } from '@/hooks/useAgenda';

interface Unidade {
  unidade: string;
  limite_minutos: number;
  esperando: number;
  esperando_atrasados: number;
  paradas: number;
  sem_responsavel: number;
  novas_hoje: number;
  respondidas_hoje: number;
  mediana_minutos: number | null;
  no_prazo_hoje: number;
  fila: { nome: string; desde: string; responsavel: string | null }[];
  avaliacoes: {
    hora: string; nome: string; status: string; fechou_plano: boolean | null; valor: number | null;
    tipo?: TipoHorario; forma?: FormaFechamento | null;
  }[];
}

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Os números que abrem a lista das conversas que eles contam (crm.painel_lista, 55-painel-lista.sql). */
type TipoLista = 'esperando' | 'atrasados' | 'paradas' | 'sem_responsavel' | 'novas_hoje';
const TITULO_LISTA: Record<TipoLista, string> = {
  esperando: 'Esperando resposta',
  atrasados: 'Esperando além do prazo',
  paradas: 'Conversas paradas há mais de um dia',
  sem_responsavel: 'Sem responsável',
  novas_hoje: 'Conversas novas hoje',
};
interface ItemLista { conversa_id: string; nome: string; quando: string | null; responsavel: string | null }
type Abrir = (tipo: TipoLista) => void;

function espera(desde: string, agora: number) {
  const min = Math.max(0, Math.round((agora - new Date(desde).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/** Na lista das paradas a espera passa de um dia: "há 1308 h 55 min" vira "há 54 dias", como no Atendimento. */
function esperaNaLista(desde: string, agora: number) {
  const dias = Math.floor((agora - new Date(desde).getTime()) / 86_400_000);
  if (dias < 1) return espera(desde, agora);
  return dias === 1 ? '1 dia' : `${dias} dias`;
}

/**
 * Bloco 4: a tela para deixar aberta na recepção, num monitor ou TV. Mostra o
 * agora e o hoje de cada unidade (crm.painel_recepcao); a atendente vê só a
 * dela. Atualiza sozinha e conta como CRM aberto, como as outras telas.
 */
export default function Painel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [agora, setAgora] = useState(Date.now());

  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ['painel-recepcao'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('painel_recepcao');
      if (error) throw error;
      return data as { agora: string; unidades: Unidade[] };
    },
  });

  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!user) return;
    void avisarPresenca();
    const t = window.setInterval(() => void avisarPresenca(), 60_000);
    return () => window.clearInterval(t);
  }, [user?.id]);

  const unidades = data?.unidades ?? [];
  const logoUrl = tenant?.system_logo_url || tenant?.logo_url;
  // Na TV ninguém clica; no computador, cada número abre a lista do lado.
  const [lista, setLista] = useState<{ unidade: string; tipo: TipoLista } | null>(null);

  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground px-8 py-5 flex flex-col gap-5">
      <header className="flex items-center gap-6">
        {logoUrl ? <img src={logoUrl} alt={tenant?.name ?? ''} className="h-14 w-auto object-contain" /> : <span className="text-2xl font-semibold">{tenant?.name}</span>}
        <div>
          <p className="text-2xl font-semibold">Painel da recepção</p>
          <p className="text-sm opacity-60">{maiuscula(format(agora, "EEEE, d 'de' MMMM", { locale: ptBR }))}</p>
        </div>
        <p className="ml-auto text-5xl font-semibold tabular-nums">{format(agora, 'HH:mm')}</p>
        <div className="flex flex-col gap-1">
          <button title="Tela cheia" onClick={() => document.documentElement.requestFullscreen?.()} className="p-2 rounded-md opacity-50 hover:opacity-100 hover:bg-white/10">
            <Maximize className="w-5 h-5" />
          </button>
          <button title="Voltar" onClick={() => navigate(-1)} className="p-2 rounded-md opacity-50 hover:opacity-100 hover:bg-white/10">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
      </header>

      {isLoading && <Loader2 className="w-8 h-8 animate-spin opacity-60 mx-auto mt-20" />}

      {/* Na TV ninguém clica: se parou de atualizar, avisa em vez de mostrar números velhos. */}
      {(isError || (dataUpdatedAt > 0 && agora - dataUpdatedAt > 120_000)) && (
        <div className="rounded-xl bg-red-500/20 px-4 py-2 text-center text-lg text-red-100">
          {dataUpdatedAt > 0
            ? `Sem atualizar desde ${format(dataUpdatedAt, 'HH:mm')}. Tentando de novo…`
            : 'Sem conexão com o servidor. Tentando de novo…'}
        </div>
      )}

      <div className={`grid gap-6 flex-1 ${unidades.length > 1 ? 'xl:grid-cols-2' : ''}`}>
        {unidades.map((u) => (
          <Coluna key={u.unidade} u={u} agora={agora} abrir={(tipo) => setLista({ unidade: u.unidade, tipo })} />
        ))}
      </div>

      {dataUpdatedAt > 0 && (
        <p className="text-xs opacity-40 text-center">
          Atualiza sozinho a cada 30 segundos · última às {format(dataUpdatedAt, 'HH:mm:ss')}
        </p>
      )}

      <ListaDoNumero
        lista={lista}
        agora={agora}
        limite={unidades.find((u) => u.unidade === lista?.unidade)?.limite_minutos ?? 15}
        aoFechar={() => setLista(null)}
        aoAbrirConversa={(id) => navigate(`/atendimento?conversa=${id}`)}
      />
    </div>
  );
}

function ListaDoNumero({ lista, agora, limite, aoFechar, aoAbrirConversa }: {
  lista: { unidade: string; tipo: TipoLista } | null;
  agora: number;
  limite: number;
  aoFechar: () => void;
  aoAbrirConversa: (id: string) => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['painel-lista', lista?.unidade, lista?.tipo],
    enabled: !!lista,
    refetchInterval: 30_000,
    queryFn: async () => {
      // painel_lista não está nos tipos gerados do Lovable.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('painel_lista', { _unidade: lista!.unidade, _tipo: lista!.tipo });
      if (error) throw error;
      return data as { total: number; itens: ItemLista[] };
    },
  });
  const ehEspera = !!lista && ['esperando', 'atrasados', 'paradas'].includes(lista.tipo);
  const itens = data?.itens ?? [];

  const quando = (i: ItemLista) => {
    if (!i.quando) return '';
    if (ehEspera) return `há ${esperaNaLista(i.quando, agora)}`;
    if (lista?.tipo === 'novas_hoje') return `chegou às ${format(new Date(i.quando), 'HH:mm')}`;
    return `última mensagem ${format(new Date(i.quando), "dd/MM 'às' HH:mm")}`;
  };

  return (
    <Sheet open={!!lista} onOpenChange={(aberta) => { if (!aberta) aoFechar(); }}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle>{lista ? TITULO_LISTA[lista.tipo] : ''}</SheetTitle>
          <SheetDescription>
            {lista?.unidade}
            {data ? ` · ${data.total} ${data.total === 1 ? 'conversa' : 'conversas'}` : ''}
            {' · '}clique para abrir no Atendimento
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto -mx-2">
          {isLoading && <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mt-10" />}
          {isError && <p className="px-2 text-sm text-destructive">Não foi possível carregar a lista.</p>}
          {data && itens.length === 0 && <p className="px-2 text-sm text-muted-foreground">Nenhuma conversa agora.</p>}
          {itens.map((i) => {
            const atrasado = ehEspera && !!i.quando && agora - new Date(i.quando).getTime() > limite * 60_000;
            return (
              <button
                key={i.conversa_id}
                type="button"
                onClick={() => aoAbrirConversa(i.conversa_id)}
                className="w-full text-left flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
              >
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{i.nome}</span>
                  <span className="block truncate text-xs text-muted-foreground">{i.responsavel ?? 'sem responsável'}</span>
                </span>
                <span className={`shrink-0 text-xs tabular-nums ${atrasado ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                  {quando(i)}
                </span>
              </button>
            );
          })}
          {data && data.total > itens.length && (
            <p className="px-2 pt-2 text-xs text-muted-foreground">
              Mostrando {itens.length} de {data.total}. As outras estão no Atendimento.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Coluna({ u, agora, abrir }: { u: Unidade; agora: number; abrir: Abrir }) {
  const noPrazo = u.respondidas_hoje ? Math.round((u.no_prazo_hoje / u.respondidas_hoje) * 100) : null;
  const ag = u.avaliacoes;
  const contar = (f: (a: Unidade['avaliacoes'][number]) => boolean) => ag.filter(f).length;
  const valor = ag.filter((a) => a.fechou_plano).reduce((s, a) => s + Number(a.valor ?? 0), 0);

  return (
    <section className="rounded-2xl bg-white/5 border border-white/10 p-5 flex flex-col gap-4">
      <h2 className="text-2xl font-semibold">{u.unidade}</h2>

      <div className="grid grid-cols-2 gap-4">
        <Bloco
          rotulo="Esperando resposta"
          valor={u.esperando}
          alerta={u.esperando_atrasados > 0}
          abrir={() => abrir('esperando')}
          extra={u.esperando_atrasados > 0 ? `${u.esperando_atrasados} há mais de ${u.limite_minutos} min` : 'ninguém atrasado'}
          abrirExtra={u.esperando_atrasados > 0 ? () => abrir('atrasados') : undefined}
        />
        <Bloco rotulo="Sem responsável" valor={u.sem_responsavel} extra="conversas abertas" abrir={() => abrir('sem_responsavel')} />
        <Bloco rotulo="Conversas novas hoje" valor={u.novas_hoje} abrir={() => abrir('novas_hoje')} />
        <Bloco
          rotulo="Tempo de resposta hoje"
          valor={u.mediana_minutos === null ? '-' : `${Math.round(u.mediana_minutos)} min`}
          extra={noPrazo === null ? 'nenhuma resposta ainda' : `${noPrazo}% em até ${u.limite_minutos} min · ${u.respondidas_hoje} respostas`}
        />
      </div>

      <div>
        <div className="flex items-baseline gap-3 mb-2">
          <p className="text-lg font-semibold">Avaliações de hoje</p>
          {ag.length > 0 && (
            <p className="text-sm opacity-60">
              {ag.length} marcadas · {contar((a) => a.status === 'compareceu')} vieram · {contar((a) => a.status === 'faltou')} faltaram
              · {contar((a) => !!a.fechou_plano)} fecharam{valor > 0 ? ` (${reais(valor)})` : ''}
            </p>
          )}
        </div>
        {ag.length === 0 ? (
          <p className="text-base opacity-50">Nenhuma avaliação marcada na Agenda para hoje.</p>
        ) : (
          <div className="flex flex-col divide-y divide-white/10">
            {ag.slice(0, 6).map((a, i) => (
              <div key={i} className="flex items-center gap-4 py-1.5 text-lg">
                <span className="w-16 tabular-nums font-semibold">{a.hora}</span>
                <span className="flex-1 truncate">
                  {a.nome}
                  {a.tipo && a.tipo !== 'avaliacao' && <span className="ml-2 text-sm px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200">{ROTULO_TIPO[a.tipo]}</span>}
                </span>
                <Situacao a={a} />
              </div>
            ))}
            {ag.length > 6 && <p className="pt-1 text-sm opacity-50">e mais {ag.length - 6} na Agenda</p>}
          </div>
        )}
      </div>

      <div>
        <p className="text-lg font-semibold mb-2">Esperando há mais tempo</p>
        {u.fila.length === 0 ? (
          <p className="text-base opacity-50">Ninguém esperando resposta.</p>
        ) : (
          <div className="flex flex-col divide-y divide-white/10">
            {u.fila.slice(0, 5).map((f, i) => {
              const atrasado = agora - new Date(f.desde).getTime() > u.limite_minutos * 60_000;
              return (
                <div key={i} className="flex items-center gap-4 py-1.5 text-lg">
                  <span className="flex-1 truncate">{f.nome}</span>
                  <span className="text-sm opacity-60 truncate max-w-[10rem]">{f.responsavel ?? 'sem responsável'}</span>
                  <span className={`whitespace-nowrap text-right tabular-nums font-semibold ${atrasado ? 'text-red-400' : ''}`}>há {espera(f.desde, agora)}</span>
                </div>
              );
            })}
          </div>
        )}
        {u.paradas > 0 && (
          <button type="button" onClick={() => abrir('paradas')} className="pt-2 text-left text-sm opacity-50 hover:opacity-100 hover:underline">
            Mais {u.paradas} {u.paradas === 1 ? 'conversa parada' : 'conversas paradas'} há mais de um dia: responda ou resolva no Atendimento.
          </button>
        )}
      </div>
    </section>
  );
}

function Bloco({ rotulo, valor, extra, alerta = false, abrir, abrirExtra }: {
  rotulo: string; valor: number | string; extra?: string; alerta?: boolean;
  /** Clicar no número abre a lista das conversas que ele conta. */
  abrir?: () => void;
  abrirExtra?: () => void;
}) {
  const clicavel = !!abrir && typeof valor === 'number' && valor > 0;
  return (
    <div className={`rounded-xl p-4 ${alerta ? 'bg-red-500/15 ring-1 ring-red-400/40' : 'bg-white/5'}`}>
      <p className="text-sm opacity-70">{rotulo}</p>
      {clicavel ? (
        <button
          type="button"
          onClick={abrir}
          title="Ver a lista"
          className={`block text-[2.75rem] leading-tight font-semibold tabular-nums rounded-md hover:underline decoration-2 underline-offset-4 ${alerta ? 'text-red-300' : ''}`}
        >
          {valor}
        </button>
      ) : (
        <p className={`text-[2.75rem] leading-tight font-semibold tabular-nums ${alerta ? 'text-red-300' : ''}`}>{valor}</p>
      )}
      {extra && (abrirExtra ? (
        <button type="button" onClick={abrirExtra} className={`block text-left text-sm mt-1 hover:underline ${alerta ? 'text-red-200' : 'opacity-60'}`}>
          {extra}
        </button>
      ) : (
        <p className={`text-sm mt-1 ${alerta ? 'text-red-200' : 'opacity-60'}`}>{extra}</p>
      ))}
    </div>
  );
}

function Situacao({ a }: { a: Unidade['avaliacoes'][number] }) {
  const [texto, cor] =
    a.status === 'faltou' ? ['Faltou', 'bg-red-500/20 text-red-200']
    : a.status === 'compareceu' && a.fechou_plano ? [FORMAS[a.forma ?? 'plano'].rotulo, 'bg-emerald-500/20 text-emerald-200']
    : a.status === 'compareceu' && a.fechou_plano === false ? ['Não fechou', 'bg-amber-500/20 text-amber-200']
    : a.status === 'compareceu' ? ['Compareceu', 'bg-sky-500/20 text-sky-200']
    : ['Aguardando', 'bg-white/10'];
  return <span className={`text-sm px-2.5 py-1 rounded-md ${cor}`}>{texto}</span>;
}
