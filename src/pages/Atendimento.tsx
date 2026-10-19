import { useEffect, useMemo, useState } from 'react';
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
import {
  useAtualizarConversa, useConversas, useEquipe, useModulosAtivos, type Conversa,
} from '@/hooks/useAtendimento';
import { CornerUpLeft, Loader2, MessageCircle, Search, Smartphone } from 'lucide-react';

type Fila = 'minhas' | 'sem' | 'todas';
const TODAS = '__todas__';

export default function Atendimento() {
  const { user } = useAuth();
  const { data: modulos, isLoading: carregandoModulos } = useModulosAtivos();
  const liberado = !!modulos?.has('atendimento');
  const { data: conversas = [], isLoading } = useConversas(liberado);
  const { data: equipe = [] } = useEquipe();
  const atualizar = useAtualizarConversa();

  const [fila, setFila] = useState<Fila>('todas');
  const [resolvidas, setResolvidas] = useState(false);
  const [unidade, setUnidade] = useState(TODAS);
  const [busca, setBusca] = useState('');
  const [parametros] = useSearchParams();
  // ?conversa= abre direto a conversa (vem do Follow-up e dos Planos).
  const [abertaId, setAbertaId] = useState<string | null>(() => parametros.get('conversa'));
  const [conectar, setConectar] = useState(false);

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

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = busca.replace(/\D/g, '');
    return conversas.filter((c) => {
      if ((c.status === 'resolvida') !== resolvidas) return false;
      if (!naUnidade(c)) return false;
      if (fila === 'minhas' && c.assigned_to !== user?.id) return false;
      if (fila === 'sem' && c.assigned_to) return false;
      if (termo) {
        const nome = (c.contact_name ?? '').toLowerCase();
        if (!nome.includes(termo) && !(digitos.length >= 3 && c.phone.includes(digitos))) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversas, resolvidas, unidade, fila, busca, user?.id]);

  const aberta = conversas.find((c) => c.id === abertaId) ?? null;

  // A conversa na tela desempata quando duas atendentes da unidade estão logadas.
  useEffect(() => { avisarConversaAberta(abertaId); }, [abertaId]);
  useEffect(() => () => avisarConversaAberta(null), []);

  // Abrir a conversa é ler. Só conta com a aba visível.
  useEffect(() => {
    if (!aberta || aberta.unread_count === 0) return;
    if (document.visibilityState !== 'visible') return;
    atualizar.mutate({ id: aberta.id, unread_count: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta?.id, aberta?.unread_count]);

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

            {!isLoading && conversas.length === 0 && (
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
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">Nada nesta fila.</p>
            )}

            {lista.map((c) => {
              const nome = c.contact_name || formatarTelefone(c.phone);
              const ativa = c.id === abertaId;
              return (
                <button
                  key={c.id}
                  onClick={() => setAbertaId(c.id)}
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
                          {rotuloHora(c.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-sm text-muted-foreground truncate flex items-center gap-1">
                          {c.last_message_from_me && <CornerUpLeft className="w-3.5 h-3.5 shrink-0" />}
                          <span className="truncate">{c.last_message_preview}</span>
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
                        {unidades.length > 1 && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">
                            {c.unidade}
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground truncate">
                          {c.assigned_to ? nomes.get(c.assigned_to) ?? 'Equipe' : 'Sem responsável'}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
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
