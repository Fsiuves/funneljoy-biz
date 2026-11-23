import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { IntegrationSettingsModal } from '@/components/settings/IntegrationSettingsModal';
import {
  PainelConversa, formatarTelefone, iniciais, rotuloHora,
} from '@/components/atendimento/PainelConversa';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { avisarConversaAberta } from '@/lib/presenca';
import { chaveNome } from '@/lib/busca';
import { ChipEtiqueta } from '@/components/atendimento/Etiquetas';
import { useEtiquetas, useMarcacoes, type Etiqueta } from '@/hooks/useEtiquetas';
import { toast } from 'sonner';
import {
  useAtualizarConversa, useConversas, useEquipe, useModulosAtivos, useAnunciosDeOrigem, origemDaConversa, descreverOrigem,
  useBuscaConversas, useConversaPorId, useConversasAntigas, useIniciarConversa, useRascunhos, useConversasPorIds, ehGrupo,
  useConversasAguardando, useConversasFixadas,
  type Conversa, type Rascunho,
} from '@/hooks/useAtendimento';
import { CornerUpLeft, Loader2, Megaphone, MessageCircle, Pin, Search, SlidersHorizontal, Smartphone, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type Fila = 'minhas' | 'sem' | 'todas';
type Situacao = 'abertas' | 'aguardando' | 'resolvidas';

/** Paciente esperando resposta de uma pessoa, numa conversa aberta (48-aguardando-resposta.sql). */
const aguardando = (c: Conversa) => c.status === 'aberta' && !!c.aguardando_desde && !c.interna;

/** "5 min", "3 h", "2 d": há quanto tempo o paciente espera. */
function tempoDeEspera(desde: string): string {
  const min = Math.max(0, Math.floor((Date.now() - Date.parse(desde)) / 60_000));
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / (24 * 60))} d`;
}

/**
 * Cor do relógio de espera (pedido de 21/11/2026): verde até 5 min, o prazo do
 * Painel da recepção; amarelo até 30 min, quando sai o aviso de espera; vermelho depois.
 */
function corDaEspera(desde: string): string {
  const min = (Date.now() - Date.parse(desde)) / 60_000;
  if (min <= 5) return 'bg-emerald-100 text-emerald-800';
  if (min <= 30) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-700';
}

/** Filtro ligado, à vista embaixo da busca, com o x para tirar. */
function FiltroLigado({ children, tirar }: { children: React.ReactNode; tirar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/60 pl-2.5 pr-1 py-0.5 text-xs text-foreground">
      {children}
      <button type="button" onClick={tirar} className="rounded-full p-0.5 hover:bg-muted" aria-label="Tirar filtro">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

interface ItemConversaProps {
  c: Conversa;
  ativa: boolean;
  responsavel: string;
  mostrarUnidade: boolean;
  /** "Meta · campanha · anúncio", quando o paciente veio de anúncio. */
  anuncio?: string;
  /** Texto deixado escrito por quem está logado, fora da conversa aberta. */
  rascunho?: Rascunho;
  /** Paciente esperando resposta: desde quando, no lugar da hora (relógio colorido). */
  esperando?: string | null;
  /** Muda a cada minuto nas conversas que esperam, para o relógio andar sem redesenhar as outras. */
  minuto?: number;
  /** Etiquetas da conversa; "celular" quando vieram do WhatsApp do celular. */
  etiquetas?: { e: Etiqueta; celular: boolean }[];
  aoAbrir: (id: string) => void;
}

/**
 * Uma linha da fila. Com memo, mensagem nova redesenha só a conversa que mudou,
 * não as 500 da lista.
 */
const ItemConversa = memo(function ItemConversa({ c, ativa, responsavel, mostrarUnidade, anuncio, rascunho, esperando, etiquetas, aoAbrir }: ItemConversaProps) {
  const nome = c.contact_name || (ehGrupo(c.phone) ? 'Grupo do WhatsApp' : formatarTelefone(c.phone));
  return (
    <button
      onClick={() => aoAbrir(c.id)}
      className={`w-full text-left px-4 py-2 border-b border-border/60 transition-colors ${
        ativa ? 'bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]' : 'hover:bg-muted/50'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-xs font-semibold text-primary">{iniciais(nome)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className={`truncate flex items-center gap-1 ${c.unread_count > 0 ? 'font-semibold' : 'font-medium'} text-foreground`}>
              {c.fixada_em && <Pin className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-label="Fixada" />}
              <span className="truncate">{nome}</span>
            </p>
            {esperando ? (
              <span
                className={`text-[11px] shrink-0 font-semibold px-1.5 py-0.5 rounded-full ${corDaEspera(esperando)}`}
                title={`Esperando resposta desde ${new Date(esperando).toLocaleString('pt-BR')}`}
              >
                há {tempoDeEspera(esperando)}
              </span>
            ) : (
              <span className={`text-xs shrink-0 ${c.unread_count > 0 ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                {rotuloHora(rascunho?.atualizado_em ?? c.last_message_at)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className="text-sm text-muted-foreground truncate flex items-center gap-1">
              {rascunho ? (
                <span className="truncate">
                  <span className="font-semibold text-emerald-600">Rascunho:</span> {rascunho.texto}
                </span>
              ) : (
                <>
                  {c.last_message_from_me && <CornerUpLeft className="w-3.5 h-3.5 shrink-0" />}
                  <span className="truncate">{c.last_message_preview}</span>
                </>
              )}
            </p>
            {c.unread_count > 0 && (
              <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-accent text-accent-foreground text-[11px] font-semibold flex items-center justify-center">
                {c.unread_count}
              </span>
            )}
          </div>
          {/* Selos numa linha só (pedido de 21/11/2026): o que não cabe fica escondido no fim. */}
          <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden whitespace-nowrap [&_span]:leading-4">
            {c.interna && (
              <span className="shrink-0 text-[11px] px-1.5 rounded bg-primary/10 text-primary font-medium">
                {ehGrupo(c.phone) ? 'Grupo' : 'Equipe'}
              </span>
            )}
            {mostrarUnidade && (
              <span className="shrink-0 text-[11px] px-1.5 rounded border bg-muted text-muted-foreground">
                {c.unidade}
              </span>
            )}
            {anuncio && (
              <span title={`Veio do anúncio: ${anuncio}`} className="shrink-0 inline-flex items-center gap-1 text-[11px] px-1.5 rounded bg-amber-100 text-amber-900 font-medium">
                <Megaphone className="w-3 h-3" />
                Anúncio
              </span>
            )}
            {etiquetas?.slice(0, 2).map(({ e, celular }) => (
              <span key={e.id} className="shrink-0"><ChipEtiqueta e={e} celular={celular} /></span>
            ))}
            {etiquetas && etiquetas.length > 2 && (
              <span className="shrink-0 text-[11px] text-muted-foreground">+{etiquetas.length - 2}</span>
            )}
            <span className="text-[11px] text-muted-foreground truncate min-w-0">{responsavel}</span>
          </div>
        </div>
      </div>
    </button>
  );
});
const TODAS = '__todas__';

export default function Atendimento() {
  const { user } = useAuth();
  const { data: modulos, isLoading: carregandoModulos } = useModulosAtivos();
  const liberado = !!modulos?.has('atendimento');
  const { data: recentes = [], isLoading: carregandoConversas, isError, isFetching, refetch } = useConversas(liberado);
  // Enquanto os módulos carregam a lista fica desligada: é carregando, não "nenhuma conversa".
  const isLoading = carregandoConversas || carregandoModulos;
  const { data: equipe = [] } = useEquipe();
  const { data: origens } = useAnunciosDeOrigem(liberado);
  const atualizar = useAtualizarConversa();

  const [fila, setFila] = useState<Fila>('todas');
  const [situacao, setSituacao] = useState<Situacao>('abertas');
  // Filtro por etiqueta: como a busca, vale em qualquer aba e fila.
  const [etiquetaFiltro, setEtiquetaFiltro] = useState<string>(TODAS);
  const { data: etiquetas = [] } = useEtiquetas(liberado);
  const { data: marcacoes = [] } = useMarcacoes(liberado);
  const etiquetasPorId = useMemo(() => new Map(etiquetas.map((e) => [e.id, e])), [etiquetas]);
  const etiquetasDaConversa = useMemo(() => {
    const m = new Map<string, { e: Etiqueta; celular: boolean }[]>();
    for (const x of marcacoes) {
      const e = etiquetasPorId.get(x.etiqueta_id);
      if (!e) continue;
      m.set(x.conversation_id, [...(m.get(x.conversation_id) ?? []), { e, celular: x.origem === 'whatsapp' }]);
    }
    return m;
  }, [marcacoes, etiquetasPorId]);
  const resolvidas = situacao === 'resolvidas';
  const [unidade, setUnidade] = useState(TODAS);
  const [busca, setBusca] = useState('');
  const [parametros] = useSearchParams();
  // ?conversa= abre direto a conversa (vem do Follow-up e dos Planos).
  const [abertaId, setAbertaId] = useState<string | null>(() => parametros.get('conversa'));
  const [conectar, setConectar] = useState(false);
  // O relógio de espera da lista anda sozinho: a cada minuto redesenha só quem espera.
  const [minuto, setMinuto] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMinuto((m) => m + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Conversas antigas, fora das 500 da lista: as achadas na busca e a do ?conversa=.
  const { data: achadas = [], isFetching: buscando } = useBuscaConversas(busca, liberado);
  const antigas = useConversasAntigas();
  const paginasAntigas = antigas.data?.pages;
  const iniciar = useIniciarConversa();
  const naLista = recentes.some((c) => c.id === abertaId);
  const { data: avulsa } = useConversaPorId(abertaId, liberado && !carregandoConversas && !naLista);
  // Rascunhos de quem está logado: a conversa sobe para o topo, como no WhatsApp.
  const { data: rascunhos = {} } = useRascunhos(user?.id, liberado);
  const foraDaLista = useMemo(() => {
    const ids = new Set([...recentes, ...achadas, ...(paginasAntigas?.flat() ?? [])].map((c) => c.id));
    return Object.keys(rascunhos).filter((id) => !ids.has(id));
  }, [rascunhos, recentes, achadas, paginasAntigas]);
  const { data: dosRascunhos = [] } = useConversasPorIds(foraDaLista, liberado && !carregandoConversas);
  // Conversas da etiqueta escolhida que estão fora das carregadas.
  const daEtiquetaForaDaLista = useMemo(() => {
    if (etiquetaFiltro === TODAS) return [];
    const ids = new Set([...recentes, ...achadas, ...(paginasAntigas?.flat() ?? [])].map((c) => c.id));
    return marcacoes.filter((m) => m.etiqueta_id === etiquetaFiltro && !ids.has(m.conversation_id)).map((m) => m.conversation_id);
  }, [etiquetaFiltro, marcacoes, recentes, achadas, paginasAntigas]);
  const { data: daEtiqueta = [] } = useConversasPorIds(daEtiquetaForaDaLista, liberado && etiquetaFiltro !== TODAS);
  // As que esperam resposta, buscadas à parte: as mais antigas podem estar fora das 500 da lista.
  const { data: esperandoNoServidor = [] } = useConversasAguardando(liberado);
  // Fixadas da unidade, também à parte (uma fixada antiga pode estar fora das 500).
  const { data: fixadasNoServidor = [] } = useConversasFixadas(liberado);
  const conversas = useMemo(() => {
    const extras = [...achadas, ...(paginasAntigas?.flat() ?? []), ...(avulsa ? [avulsa] : []), ...dosRascunhos, ...esperandoNoServidor, ...fixadasNoServidor, ...daEtiqueta];
    if (!extras.length) return recentes;
    const ids = new Set(recentes.map((c) => c.id));
    const novas: Conversa[] = [];
    for (const c of extras) {
      if (ids.has(c.id)) continue;
      ids.add(c.id);
      novas.push(c);
    }
    return novas.length ? [...recentes, ...novas] : recentes;
  }, [recentes, achadas, paginasAntigas, avulsa, dosRascunhos, esperandoNoServidor, fixadasNoServidor, daEtiqueta]);

  const eu = equipe.find((p) => p.id === user?.id);
  const nomes = useMemo(() => new Map(equipe.map((p) => [p.id, p.name || p.email])), [equipe]);
  const unidades = useMemo(() => Array.from(new Set(conversas.map((c) => c.unidade))).sort(), [conversas]);
  // Direção escolhe ver as unidades juntas ou separadas; recepção já vem filtrada pelo banco.
  const escolheUnidade = !eu?.unidade && unidades.length > 1;

  const naUnidade = (c: Conversa) => unidade === TODAS || c.unidade === unidade;

  const contagem = useMemo(() => {
    const abertas = conversas.filter((c) => c.status === 'aberta' && naUnidade(c));
    const daFila = (c: Conversa) => fila === 'todas' || (fila === 'minhas' ? c.assigned_to === user?.id : !c.assigned_to);
    return {
      minhas: abertas.filter((c) => c.assigned_to === user?.id).length,
      // Grupo é da equipe toda e nunca tem dono: não é paciente esperando alguém pegar.
      sem: abertas.filter((c) => !c.assigned_to && !ehGrupo(c.phone)).length,
      todas: abertas.length,
      aguardando: abertas.filter((c) => aguardando(c) && daFila(c)).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversas, unidade, user?.id, fila]);

  // Rascunho aparece ao sair da conversa (pedido da clínica em 12/11/2026): a aberta
  // fica no lugar dela enquanto a pessoa escreve.
  const comRascunho = (c: Conversa) => !!rascunhos[c.id] && c.id !== abertaId;

  const lista = useMemo(() => {
    const termo = chaveNome(busca.trim());
    const digitos = busca.replace(/\D/g, '');
    const noServidor = new Set(achadas.map((c) => c.id));
    const filtrandoEtiqueta = etiquetaFiltro !== TODAS;
    const filtradas = conversas.filter((c) => {
      if (!naUnidade(c)) return false;
      if (filtrandoEtiqueta && !etiquetasDaConversa.get(c.id)?.some(({ e }) => e.id === etiquetaFiltro)) return false;
      // Buscando, vale qualquer aba: quem procura um nome não sabe se a conversa
      // está aberta ou resolvida, nem com quem. Com rascunho, também: é trabalho
      // pendente de quem escreveu, em qualquer aba. Fixada aparece em Abertas em
      // qualquer fila: vale para a unidade inteira (decisão do Fred em 16/11/2026).
      // Em "Aguardando resposta" entra só quem espera, com ou sem rascunho.
      const passaDireto = situacao !== 'aguardando'
        && (comRascunho(c) || (situacao === 'abertas' && !!c.fixada_em));
      if (!termo && !filtrandoEtiqueta && !passaDireto) {
        if (situacao === 'aguardando') {
          if (!aguardando(c)) return false;
        } else if ((c.status === 'resolvida') !== resolvidas) return false;
        if (fila === 'minhas' && c.assigned_to !== user?.id) return false;
        if (fila === 'sem' && (c.assigned_to || ehGrupo(c.phone))) return false;
      }
      if (termo) {
        const nome = chaveNome(c.contact_name ?? '');
        // Pelo fim do número: acha com ou sem o 9 e com ou sem o 55.
        const fim = digitos.length >= 8 ? digitos.slice(-8) : digitos;
        // A busca do servidor também olha o nome do cadastro, que a lista não tem.
        if (!nome.includes(termo) && !(digitos.length >= 3 && c.phone.includes(fim)) && !noServidor.has(c.id)) return false;
      }
      return true;
    });
    // Aguardando resposta: quem espera há mais tempo primeiro (pedido da clínica em 12/11/2026).
    if (situacao === 'aguardando' && !termo) {
      return [...filtradas].sort((a, b) => Date.parse(a.aguardando_desde ?? '') - Date.parse(b.aguardando_desde ?? ''));
    }
    // No topo: as fixadas (a fixada por último primeiro), depois as com rascunho (a
    // mais recente primeiro); as outras na ordem de sempre.
    const fixadas = filtradas.filter((c) => c.fixada_em)
      .sort((a, b) => (b.fixada_em ?? '').localeCompare(a.fixada_em ?? ''));
    const comTexto = filtradas.filter((c) => !c.fixada_em && comRascunho(c))
      .sort((a, b) => rascunhos[b.id].atualizado_em.localeCompare(rascunhos[a.id].atualizado_em));
    if (!fixadas.length && !comTexto.length) return filtradas;
    return [...fixadas, ...comTexto, ...filtradas.filter((c) => !c.fixada_em && !comRascunho(c))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversas, achadas, situacao, unidade, fila, busca, user?.id, rascunhos, abertaId, etiquetaFiltro, etiquetasDaConversa]);

  // Fim da lista à vista: busca as próximas 500. Em fila com poucas conversas, segue
  // buscando até encher a tela ou acabar.
  const fimDaLista = useRef<HTMLDivElement>(null);
  const temMaisConversas = recentes.length >= 500 && (!paginasAntigas || antigas.hasNextPage);
  useEffect(() => {
    const alvo = fimDaLista.current;
    if (!alvo || !temMaisConversas) return;
    const observador = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !antigas.isFetching) void antigas.fetchNextPage();
    });
    observador.observe(alvo);
    return () => observador.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temMaisConversas, paginasAntigas?.length, antigas.isFetching]);

  // ESC fecha a conversa e volta para a lista, como no WhatsApp. O rascunho fica guardado.
  useEffect(() => {
    const aoTeclar = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      setAbertaId(null);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  // Número digitado que não tem conversa: dá para iniciar por aqui, como no WhatsApp.
  const numeroNovo = busca.replace(/\D/g, '').length >= 10 && lista.length === 0 && !buscando;
  const opcoesDeUnidade = unidade !== TODAS ? [unidade] : unidades;
  const iniciarConversa = async (uni: string) => {
    try {
      const { conversation_id } = await iniciar.mutateAsync({ telefone: busca.trim(), unidade: uni });
      setBusca('');
      setAbertaId(conversation_id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível iniciar a conversa.');
    }
  };

  const aberta = conversas.find((c) => c.id === abertaId) ?? null;

  // A conversa na tela desempata quando duas atendentes da unidade estão logadas.
  useEffect(() => { avisarConversaAberta(abertaId); }, [abertaId]);
  useEffect(() => () => avisarConversaAberta(null), []);

  // Abrir a conversa é ler. Só conta com a aba visível, e conta também quando a
  // aba volta a ficar visível com a conversa aberta.
  const [visivel, setVisivel] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const aoMudar = () => setVisivel(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', aoMudar);
    return () => document.removeEventListener('visibilitychange', aoMudar);
  }, []);
  // Uma tentativa por conversa e mensagem: se a gravação falha, o cache volta ao
  // não lido e o efeito gravaria de novo sem parar (laço com a rede ruim).
  const tentouLer = useRef('');
  useEffect(() => {
    if (!aberta || aberta.unread_count === 0 || !visivel) return;
    const chave = `${aberta.id}:${aberta.last_message_at}`;
    if (tentouLer.current === chave) return;
    tentouLer.current = chave;
    atualizar.mutate({ id: aberta.id, unread_count: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta?.id, aberta?.unread_count, aberta?.last_message_at, visivel]);

  if (!carregandoModulos && !liberado) {
    return (
      <MainLayout>
        <div className="max-w-lg mx-auto mt-24 text-center">
          <MessageCircle className="w-10 h-10 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold mt-4">Atendimento não contratado</h1>
          <p className="text-muted-foreground mt-2">
            A tela de atendimento pelo WhatsApp não está ativa nesta conta. Fale com o suporte.
          </p>
        </div>
      </MainLayout>
    );
  }

  const abas: { id: Fila; rotulo: string; n: number }[] = [
    { id: 'minhas', rotulo: 'Minhas', n: contagem.minhas },
    { id: 'sem', rotulo: 'Sem responsável', n: contagem.sem },
    { id: 'todas', rotulo: 'Todas', n: contagem.todas },
  ];
  const situacoes: { id: Situacao; rotulo: string; n: number; dica?: string }[] = [
    // Abertas sem número: a lista carrega aos poucos e a conta crescia ao rolar
    // (588 no começo, 3.188 de verdade em 21/11/2026). Aguardando vem inteira do servidor.
    { id: 'abertas', rotulo: 'Abertas', n: 0 },
    { id: 'aguardando', rotulo: 'Aguardando', n: contagem.aguardando, dica: 'Pacientes esperando resposta, de quem espera há mais tempo para quem espera há menos' },
    { id: 'resolvidas', rotulo: 'Resolvidas', n: 0 },
  ];
  const filtrosLigados = (fila !== 'todas' ? 1 : 0) + (unidade !== TODAS ? 1 : 0) + (etiquetaFiltro !== TODAS ? 1 : 0);

  return (
    <MainLayout fullBleed>
      <div className="flex h-screen">
        {/* Fila */}
        <aside className="w-[380px] shrink-0 border-r border-border bg-card flex flex-col">
          <div className="px-4 pt-5 pb-3 space-y-3 border-b border-border">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-foreground">Atendimento</h1>
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setConectar(true)}>
                <Smartphone className="w-4 h-4 mr-1" />
                Números
              </Button>
            </div>

            {/* Uma linha só de abas (pedido de 21/11/2026). Responsável, unidade e
                etiqueta ficam em Filtros, e o que está ligado aparece embaixo da busca. */}
            <div className="flex rounded-lg bg-muted p-1">
              {situacoes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSituacao(s.id)}
                  title={s.dica}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    situacao === s.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s.rotulo}
                  {s.n > 0 && (
                    <span className={`ml-1 ${s.id === 'aguardando' ? 'text-amber-700 font-semibold' : 'text-muted-foreground'}`}>{s.n}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome ou telefone"
                  className="input-field pl-9 w-full h-9 text-sm"
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5">
                    <SlidersHorizontal className="w-4 h-4" />
                    Filtros
                    {filtrosLigados > 0 && (
                      <span className="min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] leading-4">{filtrosLigados}</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 space-y-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Responsável</p>
                    <div className="flex rounded-lg bg-muted p-1">
                      {abas.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setFila(a.id)}
                          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                            fila === a.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {a.rotulo}
                          {a.n > 0 && <span className="ml-1 text-muted-foreground">{a.n}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                  {escolheUnidade && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Unidade</p>
                      <Select value={unidade} onValueChange={setUnidade}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={TODAS}>Todas as unidades</SelectItem>
                          {unidades.map((u) => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {etiquetas.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Etiqueta</p>
                      <Select value={etiquetaFiltro} onValueChange={setEtiquetaFiltro}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={TODAS}>Todas as etiquetas</SelectItem>
                          {etiquetas.filter((e) => unidade === TODAS || !e.unidade || e.unidade === unidade).map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              <span className="inline-flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: e.cor }} />
                                {e.nome}{e.origem === 'whatsapp' ? ' (celular)' : ''}{unidades.length > 1 && e.unidade ? ` · ${e.unidade}` : ''}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {filtrosLigados > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {fila !== 'todas' && (
                  <FiltroLigado tirar={() => setFila('todas')}>{fila === 'minhas' ? 'Minhas' : 'Sem responsável'}</FiltroLigado>
                )}
                {unidade !== TODAS && <FiltroLigado tirar={() => setUnidade(TODAS)}>{unidade}</FiltroLigado>}
                {etiquetaFiltro !== TODAS && (
                  <FiltroLigado tirar={() => setEtiquetaFiltro(TODAS)}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: etiquetasPorId.get(etiquetaFiltro)?.cor }} />
                    {etiquetasPorId.get(etiquetaFiltro)?.nome ?? 'Etiqueta'}
                  </FiltroLigado>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}

            {/* Erro não é "nenhuma conversa": a falha de conexão aparecia como WhatsApp desconectado. */}
            {!isLoading && isError && conversas.length === 0 && (
              <div className="px-6 py-12 flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
                <p>Não foi possível carregar as conversas.</p>
                <Button size="sm" variant="outline" disabled={isFetching} onClick={() => void refetch()}>
                  {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tentar de novo'}
                </Button>
              </div>
            )}

            {!isLoading && !isError && conversas.length === 0 && (
              <div className="px-6 py-12 text-center">
                <Smartphone className="w-8 h-8 mx-auto text-muted-foreground" />
                <p className="mt-3 text-sm text-foreground font-medium">Nenhuma conversa ainda</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  As mensagens aparecem aqui assim que o WhatsApp da unidade estiver conectado.
                </p>
                <Button size="sm" className="mt-4" onClick={() => setConectar(true)}>
                  Conectar WhatsApp
                </Button>
              </div>
            )}

            {/* Enquanto chegam as conversas antigas ou a busca, ainda não é "nada nesta fila". */}
            {!isLoading && lista.length === 0 && buscando && busca.trim() && (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isLoading && conversas.length > 0 && lista.length === 0 && !antigas.isFetching && !buscando && (
              numeroNovo ? (
                <div className="px-6 py-10 text-center">
                  <p className="text-sm text-muted-foreground">Nenhuma conversa com esse número.</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {opcoesDeUnidade.map((u) => (
                      <Button key={u} size="sm" disabled={iniciar.isPending} onClick={() => void iniciarConversa(u)}>
                        {opcoesDeUnidade.length > 1 ? `Iniciar pela ${u}` : 'Iniciar conversa'}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                  {situacao === 'aguardando' && !busca.trim() ? 'Ninguém esperando resposta nesta fila.' : 'Nada nesta fila.'}
                </p>
              )
            )}

            {lista.map((c) => (
              <ItemConversa
                key={c.id}
                c={c}
                ativa={c.id === abertaId}
                responsavel={c.assigned_to ? nomes.get(c.assigned_to) ?? 'Equipe' : 'Sem responsável'}
                mostrarUnidade={unidades.length > 1}
                anuncio={(() => { const o = origemDaConversa(origens, c); return o ? descreverOrigem(o) : undefined; })()}
                rascunho={comRascunho(c) ? rascunhos[c.id] : undefined}
                esperando={aguardando(c) ? c.aguardando_desde : undefined}
                minuto={aguardando(c) ? minuto : 0}
                etiquetas={etiquetasDaConversa.get(c.id)}
                aoAbrir={setAbertaId}
              />
            ))}

            {temMaisConversas && !busca.trim() && (
              <div ref={fimDaLista} className="py-3 text-center text-xs text-muted-foreground">
                {antigas.isFetching ? 'Carregando conversas…' : (
                  <button type="button" className="underline" onClick={() => void antigas.fetchNextPage()}>Carregar mais conversas</button>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Conversa */}
        <section className="flex-1 min-w-0 bg-background">
          {aberta ? (
            <PainelConversa conversa={aberta} equipe={equipe} eu={eu} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-8">
              <MessageCircle className="w-12 h-12 text-muted-foreground/60" />
              <p className="mt-4 text-foreground font-medium">Escolha uma conversa</p>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                Quem responde primeiro vira responsável. Dá para passar a conversa para outra pessoa pelo topo.
              </p>
            </div>
          )}
        </section>
      </div>

      <IntegrationSettingsModal open={conectar} onOpenChange={setConectar} />
    </MainLayout>
  );
}
