import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { endOfMonth, format, startOfMonth, subDays, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, ChevronDown, ChevronRight, Info, Loader2, RefreshCw } from 'lucide-react';
import { reais } from '@/hooks/useAgenda';
import {
  useResultados, useSincronizacao, useSincronizar, type LinhaResultado,
} from '@/hooks/useResultados';

type Periodo = '7d' | '30d' | 'mes' | 'mes_passado';
const PERIODOS: { chave: Periodo; rotulo: string }[] = [
  { chave: '7d', rotulo: '7 dias' },
  { chave: '30d', rotulo: '30 dias' },
  { chave: 'mes', rotulo: 'Este mês' },
  { chave: 'mes_passado', rotulo: 'Mês passado' },
];
const TODAS = '__todas__';
const SEM_GOOGLE = 'O Google ainda não marca de qual campanha veio cada conversa';
const dia = (d: Date) => format(d, 'yyyy-MM-dd');

function intervalo(p: Periodo): [string, string] {
  const hoje = new Date();
  if (p === '7d') return [dia(subDays(hoje, 6)), dia(hoje)];
  if (p === '30d') return [dia(subDays(hoje, 29)), dia(hoje)];
  if (p === 'mes') return [dia(startOfMonth(hoje)), dia(hoje)];
  const passado = subMonths(hoje, 1);
  return [dia(startOfMonth(passado)), dia(endOfMonth(passado))];
}

interface Soma {
  gasto: number; contatos: number; agendaram: number; compareceram: number; fecharam: number; valor: number;
  conversasPlataforma: number;
}
const vazia = (): Soma => ({ gasto: 0, contatos: 0, agendaram: 0, compareceram: 0, fecharam: 0, valor: 0, conversasPlataforma: 0 });
function somar(s: Soma, l: LinhaResultado) {
  s.gasto += l.gasto; s.contatos += l.contatos; s.agendaram += l.agendaram;
  s.compareceram += l.compareceram; s.fecharam += l.fecharam; s.valor += l.valor;
  s.conversasPlataforma += l.conversas_plataforma ?? 0;
  return s;
}

interface Campanha {
  chave: string;
  plataforma: 'meta' | 'google';
  nome: string;
  unidade: string | null;
  total: Soma;
  anuncios: { nome: string; soma: Soma }[];
}

// "[CA] [LAPA] [Q] [F] [ENGAJAMENTO] - Lapa Agosto/26" vira "Lapa Agosto/26": as
// etiquetas são iguais em todas; o que diferencia vem depois do traço.
const nomeCurto = (nome: string) => {
  const i = nome.indexOf(' - ');
  return i > 0 && i < nome.length - 3 ? nome.slice(i + 3) : nome;
};
const custo = (gasto: number, n: number) => (gasto > 0 && n > 0 ? reais(gasto / n) : '-');
const numero = (n: number) => n.toLocaleString('pt-BR');

/**
 * Bloco 4: qual anúncio traz paciente e quanto custa cada conversa, agendamento
 * e plano fechado. Contagem por coorte: quem chegou no período e, dessas
 * pessoas, quantas agendaram, compareceram e fecharam até hoje.
 */
export default function Resultados() {
  const [periodo, setPeriodo] = useState<Periodo>('30d');
  const [unidade, setUnidade] = useState(TODAS);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [de, ate] = useMemo(() => intervalo(periodo), [periodo]);

  const { data: linhas = [], isLoading } = useResultados(de, ate);
  const { data: sync } = useSincronizacao();
  const sincronizar = useSincronizar();

  // Dados com mais de uma hora: busca de novo no Vigia, uma vez por abertura da tela.
  const jaPediu = useRef(false);
  useEffect(() => {
    if (!sync?.configurado || jaPediu.current) return;
    const velho = !sync.concluido_em || Date.now() - new Date(sync.concluido_em).getTime() > 3_600_000;
    if (!velho) return;
    jaPediu.current = true;
    sincronizar.mutate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync?.configurado, sync?.concluido_em]);

  const unidades = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.unidade).filter(Boolean) as string[])).sort(),
    [linhas],
  );
  const visiveis = useMemo(
    () => linhas.filter((l) => unidade === TODAS || l.unidade === unidade),
    [linhas, unidade],
  );

  const { campanhas, organico, total, meta, google } = useMemo(() => {
    const porCampanha = new Map<string, Campanha>();
    const organico = vazia();
    const total = vazia();
    const meta = vazia();
    const google = vazia();
    for (const l of visiveis) {
      somar(total, l);
      if (!l.plataforma) {
        somar(organico, l);
        continue;
      }
      somar(l.plataforma === 'meta' ? meta : google, l);
      const chave = `${l.plataforma}:${l.campanha_id ?? l.campanha}:${l.unidade ?? ''}`;
      let c = porCampanha.get(chave);
      if (!c) {
        c = { chave, plataforma: l.plataforma, nome: l.campanha ?? 'Campanha sem nome', unidade: l.unidade, total: vazia(), anuncios: [] };
        porCampanha.set(chave, c);
      }
      somar(c.total, l);
      if (l.plataforma === 'meta') {
        // Anúncios com o mesmo nome (um por conjunto) aparecem juntos.
        const nome = l.anuncio ?? 'Anúncio sem nome';
        let a = c.anuncios.find((x) => x.nome === nome);
        if (!a) c.anuncios.push((a = { nome, soma: vazia() }));
        somar(a.soma, l);
      }
    }
    const campanhas = [...porCampanha.values()]
      .filter((c) => c.total.gasto > 0 || c.total.contatos > 0)
      .sort((a, b) => b.total.gasto - a.total.gasto);
    for (const c of campanhas) c.anuncios.sort((a, b) => b.soma.gasto - a.soma.gasto || b.soma.contatos - a.soma.contatos);
    return { campanhas, organico, total, meta, google };
  }, [visiveis]);

  const deAnuncio = meta.contatos + google.contatos;
  const naoIdentificadas = meta.conversasPlataforma - meta.contatos;
  const alternar = (chave: string) =>
    setAbertas((s) => {
      const n = new Set(s);
      if (n.has(chave)) n.delete(chave); else n.add(chave);
      return n;
    });

  return (
    <MainLayout>
      <Header title="Resultados" subtitle="Quanto custa cada conversa, agendamento e plano fechado, por anúncio" />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex rounded-lg bg-muted p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.chave}
              onClick={() => setPeriodo(p.chave)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${periodo === p.chave ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
        {unidades.length > 1 && (
          <Select value={unidade} onValueChange={setUnidade}>
            <SelectTrigger className="h-9 w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas as unidades</SelectItem>
              {unidades.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <span className="text-sm text-muted-foreground">
          {format(new Date(`${de}T12:00:00`), "d 'de' MMM", { locale: ptBR })} a {format(new Date(`${ate}T12:00:00`), "d 'de' MMM", { locale: ptBR })}
        </span>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {sincronizar.isPending ? (
            <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando os anúncios</span>
          ) : sync?.concluido_em ? (
            <span>Anúncios atualizados em {format(new Date(sync.concluido_em), "d/MM 'às' HH:mm")}</span>
          ) : null}
          {sync?.configurado && (
            <Button
              size="icon" variant="ghost" className="h-8 w-8" title="Atualizar agora" disabled={sincronizar.isPending}
              onClick={() => sincronizar.mutate(true, { onError: () => toast.error('Não foi possível atualizar os anúncios agora') })}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {sync && !sync.configurado && (
        <Aviso icone={Info}>Nenhuma conta de anúncios ligada a esta empresa. Os números abaixo contam só as conversas.</Aviso>
      )}
      {naoIdentificadas >= 5 && naoIdentificadas > meta.contatos * 0.15 && (
        <Aviso icone={AlertTriangle} cor="amber">
          A Meta contou {numero(meta.conversasPlataforma)} conversas iniciadas pelos anúncios no período, e o CRM identificou o
          anúncio de {numero(meta.contatos)}. As outras estão em "Sem anúncio identificado", então o custo por conversa aparece maior do que é.
        </Aviso>
      )}
      {total.contatos > 0 && total.agendaram === 0 && (
        <Aviso icone={Info}>
          Nenhuma avaliação agendada pela Agenda entre essas conversas. Agendamentos, comparecimentos e planos fechados aparecem
          aqui conforme a recepção registra no calendário da conversa e na Agenda.
        </Aviso>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <Numero rotulo="Investido" valor={reais(total.gasto)}
          extra={google.gasto > 0 ? `Meta ${reais(meta.gasto)} · Google ${reais(google.gasto)}` : undefined} />
        <Numero rotulo="Conversas novas" valor={numero(total.contatos)} extra={`${numero(deAnuncio)} de anúncio`} />
        <Numero rotulo="Agendaram" valor={numero(total.agendaram)} extra={`${numero(meta.agendaram + google.agendaram)} de anúncio`} />
        <Numero rotulo="Compareceram" valor={numero(total.compareceram)} />
        <Numero rotulo="Fecharam plano" valor={numero(total.fecharam)} extra={total.valor > 0 ? reais(total.valor) : undefined} />
        <Numero rotulo="Custo por agendamento" valor={custo(meta.gasto, meta.agendaram)} extra="anúncios da Meta" />
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="text-left font-medium px-4 py-3">Campanha e anúncio</th>
              <th className="text-right font-medium px-2.5 py-3">Investido</th>
              <th className="text-right font-medium px-2.5 py-3">Conversas</th>
              <th className="text-right font-medium px-2.5 py-3">Custo por conversa</th>
              <th className="text-right font-medium px-2.5 py-3">Agendaram</th>
              <th className="text-right font-medium px-2.5 py-3">Custo por agendamento</th>
              <th className="text-right font-medium px-2.5 py-3">Compareceram</th>
              <th className="text-right font-medium px-2.5 py-3">Fecharam</th>
              <th className="text-right font-medium px-4 py-3">Valor fechado</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9} className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary inline" /></td></tr>
            )}
            {campanhas.map((c) => {
              const aberta = abertas.has(c.chave);
              return (
                <Fragment key={c.chave}>
                  <tr
                    className={`border-b font-medium ${c.anuncios.length ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                    onClick={() => c.anuncios.length && alternar(c.chave)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {c.anuncios.length ? (aberta ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />) : <span className="w-4" />}
                        <span className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded ${c.plataforma === 'meta' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                          {c.plataforma === 'meta' ? 'Meta' : 'Google'}
                        </span>
                        {unidade === TODAS && c.unidade && (
                          <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">{c.unidade}</span>
                        )}
                        <span className="truncate max-w-[16rem] 2xl:max-w-md" title={c.nome}>{nomeCurto(c.nome)}</span>
                      </div>
                    </td>
                    <Colunas soma={c.total} semConversas={c.plataforma === 'google'} />
                  </tr>
                  {aberta && c.anuncios.map((a) => (
                    <tr key={a.nome} className="border-b bg-muted/20 text-muted-foreground">
                      <td className="pl-14 pr-4 py-2"><span className="truncate block max-w-[18rem] 2xl:max-w-md" title={a.nome}>{a.nome}</span></td>
                      <Colunas soma={a.soma} />
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            {!isLoading && (
              <tr className="border-b">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-4" />
                    <span className="font-medium" title="Orgânico, indicação ou anúncio não marcado">Sem anúncio identificado</span>
                  </div>
                </td>
                <Colunas soma={organico} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </MainLayout>
  );
}

function Colunas({ soma, semConversas = false }: { soma: Soma; semConversas?: boolean }) {
  const n = (v: number) => <td className="px-2.5 py-3 text-right tabular-nums">{numero(v)}</td>;
  return (
    <>
      <td className="px-2.5 py-3 text-right tabular-nums">{soma.gasto > 0 ? reais(soma.gasto) : '-'}</td>
      {semConversas ? (
        <td className="px-2.5 py-3 text-right text-muted-foreground" title={SEM_GOOGLE}>-</td>
      ) : n(soma.contatos)}
      <td className="px-2.5 py-3 text-right tabular-nums">{semConversas ? '-' : custo(soma.gasto, soma.contatos)}</td>
      {n(soma.agendaram)}
      <td className="px-2.5 py-3 text-right tabular-nums">{custo(soma.gasto, soma.agendaram)}</td>
      {n(soma.compareceram)}
      {n(soma.fecharam)}
      <td className="px-4 py-3 text-right tabular-nums">{soma.valor > 0 ? reais(soma.valor) : '-'}</td>
    </>
  );
}

function Numero({ rotulo, valor, extra }: { rotulo: string; valor: string; extra?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-2xl font-semibold text-foreground mt-0.5">{valor}</p>
      {extra && <p className="text-xs text-muted-foreground mt-0.5">{extra}</p>}
    </div>
  );
}

function Aviso({ icone: Icone, cor = 'muted', children }: { icone: typeof Info; cor?: 'muted' | 'amber'; children: React.ReactNode }) {
  return (
    <div className={`flex gap-2.5 rounded-lg border px-4 py-3 mb-4 text-sm ${cor === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-muted/40 text-muted-foreground'}`}>
      <Icone className="w-4 h-4 shrink-0 mt-0.5" />
      <p>{children}</p>
    </div>
  );
}
