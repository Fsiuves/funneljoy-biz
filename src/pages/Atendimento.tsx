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
import { toast } from 'sonner';
import {
  useAtualizarConversa, useConversas, useEquipe, useModulosAtivos, useAnunciosDeOrigem, origemDaConversa, descreverOrigem,
  useBuscaConversas, useConversaPorId, useConversasAntigas, useIniciarConversa, useRascunhos, useConversasPorIds,
  type Conversa, type Rascunho,
} from '@/hooks/useAtendimento';
import { CornerUpLeft, Loader2, Megaphone, MessageCircle, Search, Smartphone } from 'lucide-react';

type Fila = 'minhas' | 'sem' | 'todas';

interface ItemConversaProps {
  c: Conversa;
  ativa: boolean;
  responsavel: string;
  mostrarUnidade: boolean;
  /** "Meta · campanha · anúncio", quando o paciente veio de anúncio. */
  anuncio?: string;
  /** Texto deixado escrito por quem está logado, fora da conversa aberta. */
  rascunho?: Rascunho;
  aoAbrir: (id: string) => void;
}

/**
 * Uma linha da fila. Com memo, mensagem nova redesenha só a conversa que mudou,
 * não as 500 da lista.
 */
const ItemConversa = memo(function ItemConversa({ c, ativa, responsavel, mostrarUnidade, anuncio, rascunho, aoAbrir }: ItemConversaProps) {
  const nome = c.contact_name || formatarTelefone(c.phone);
  return (
    <button
      onClick={() => aoAbrir(c.id)}
      className={`w-full text-left px-4 py-3 border-b border-border/60 transition-colors ${
        ativa ? 'bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]' : 'hover:bg-muted/50'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-sm font-semibold text-primary">{iniciais(nome)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className={`truncate ${c.unread_count > 0 ? 'font-semibold' : 'font-medium'} text-foreground`}>
              {nome}
            </p>
            <span className={`text-xs shrink-0 ${c.unread_count > 0 ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
              {rotuloHora(rascunho?.atualizado_em ?? c.last_message_at)}
            </span>
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
          <div className="flex items-center gap-2 mt-1.5">
            {c.interna && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Equipe</span>
            )}
            {mostrarUnidade && (
              <span className="text-[11px] px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">
                {c.unidade}
              </span>
            )}
            {anuncio && (
              <span title={`Veio do anúncio: ${anuncio}`} className="shrink-0 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-medium">
                <Megaphone className="w-3 h-3" />
                Anúncio
              </span>
            )}
            <span className="text-[11px] text-muted-foreground truncate">{responsavel}</span>
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
  const [resolvidas, setResolvidas] = useState(false);
  const [unidade, setUnidade] = useState(TODAS);
  const [busca, setBusca] = useState('');
  const [parametros] = useSearchParams();
  // ?conversa= abre direto a conversa (vem do Follow-up e dos Planos).
  const [abertaId, setAbertaId] = useState<string | null>(() => parametros.get('conversa'));
  const [conectar, setConectar] = useState(false);

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
  const conversas = useMemo(() => {
    const extras = [...achadas, ...(paginasAntigas?.flat() ?? []), ...(avulsa ? [avulsa] : []), ...dosRascunhos];
    if (!extras.length) return recentes;
    const ids = new Set(recentes.map((c) => c.id));
    const novas: Conversa[] = [];
    for (const c of extras) {
      if (ids.has(c.id)) continue;
      ids.add(c.id);
      novas.push(c);
    }
    return novas.length ? [...recentes, ...novas] : recentes;
  }, [recentes, achadas, paginasAntigas, avulsa, dosRascunhos]);

  const eu = equipe.find((p) => p.id === user?.id);
  const nomes = useMemo(() => new Map(equipe.map((p) => [p.id, p.name || p.email])), [equipe]);
  const unidades = useMemo(() => Array.from(new Set(conversas.map((c) => c.unidade))).sort(), [conversas]);
  // Direção escolhe ver as unidades juntas ou separadas; recepção já vem filtrada pelo banco.
  const escolheUnidade = !eu?.unidade && unidades.length > 1;

  const naUnidade = (c: Conversa) => unidade === TODAS || c.unidade === unidade;

  const contagem = useMemo(() => {
    const abertas = conversas.filter((c) => c.status === 'aberta' && naUnidade(c));
    return {
      minhas: abertas.filter((c) => c.assigned_to === user?.id).length,
      sem: abertas.filter((c) => !c.assigned_to).length,
      todas: abertas.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversas, unidade, user?.id]);

  // Rascunho aparece ao sair da conversa (pedido da clínica em 12/11/2026): a aberta
  // fica no lugar dela enquanto a pessoa escreve.
  const comRascunho = (c: Conversa) => !!rascunhos[c.id] && c.id !== abertaId;

  const lista = useMemo(() => {
    const termo = chaveNome(busca.trim());
    const digitos = busca.replace(/\D/g, '');
    const noServidor = new Set(achadas.map((c) => c.id));
    const filtradas = conversas.filter((c) => {
      if (!naUnidade(c)) return false;
      // Buscando, vale qualquer aba: quem procura um nome não sabe se a conversa
      // está aberta ou resolvida, nem com quem. Com rascunho, também: é trabalho
      // pendente de quem escreveu, em qualquer aba.
      if (!termo && !comRascunho(c)) {
        if ((c.status === 'resolvida') !== resolvidas) return false;
        if (fila === 'minhas' && c.assigned_to !== user?.id) return false;
        if (fila === 'sem' && c.assigned_to) return false;
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
    // As com rascunho no topo, a mais recente primeiro; as outras na ordem de sempre.
    const fixas = filtradas.filter(comRascunho)
      .sort((a, b) => rascunhos[b.id].atualizado_em.localeCompare(rascunhos[a.id].atualizado_em));
    return fixas.length ? [...fixas, ...filtradas.filter((c) => !comRascunho(c))] : filtradas;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversas, achadas, resolvidas, unidade, fila, busca, user?.id, rascunhos, abertaId]);

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

            <div className="flex rounded-lg bg-muted p-1">
              {abas.map((a) => (
                <button
                  key={a.id}
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
              {escolheUnidade && (
                <Select value={unidade} onValueChange={setUnidade}>
                  <SelectTrigger className="h-9 w-32 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODAS}>Todas</SelectItem>
                    {unidades.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex gap-4 text-xs">
              <button
                onClick={() => setResolvidas(false)}
                className={!resolvidas ? 'font-semibold text-foreground' : 'text-muted-foreground'}
              >
                Abertas
              </button>
              <button
                onClick={() => setResolvidas(true)}
                className={resolvidas ? 'font-semibold text-foreground' : 'text-muted-foreground'}
              >
                Resolvidas
              </button>
            </div>
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

            {!isLoading && conversas.length > 0 && lista.length === 0 && (
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
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">Nada nesta fila.</p>
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
