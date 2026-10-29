import { useMemo, useState } from 'react';
import { addDays, addMonths, format, isToday, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEquipe } from '@/hooks/useAtendimento';
import { useEtapas } from '@/hooks/useEmpresa';
import { formatarTelefone } from '@/components/atendimento/PainelConversa';
import {
  FORMAS, ROTULO_TIPO, lerValor, reais, useAgendarAvaliacao, useAvaliacoes, useRegistrarFechamento, useRegistrarPresenca,
  type Avaliacao, type FormaFechamento, type TipoHorario,
} from '@/hooks/useAgenda';

type Periodo = 'dia' | 'semana' | 'mes';
const TODAS = '__todas__';
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** O paciente desta linha já tem esse horário marcado (a Agenda traz os horários dele). */
const marcou = (a: Avaliacao, tipo: TipoHorario) =>
  !!a.leads?.avaliacoes?.some((x) => x.tipo === tipo && x.status !== 'cancelada');

/**
 * Avaliações do dia. A recepção marca a chegada (compareceu ou faltou) e, na
 * saída, quando o paciente vem faturar, se fechou plano e o valor. O
 * quiropraxista não precisa de computador.
 *
 * Empresa com R2 no funil (Coluna Ajustada): a avaliação termina marcando o R2,
 * e o fechamento (plano, mês a mês ou avulso) sai no R2 ou no R3.
 */
export default function Agenda() {
  const { user } = useAuth();
  const { data: equipe = [] } = useEquipe();
  const { etapas } = useEtapas();
  const temEtapa = (chave: string) => etapas.some((e) => e.value === chave);
  const comRetorno = temEtapa('agendou_r2');
  const eu = equipe.find((p) => p.id === user?.id);
  const [dia, setDia] = useState(() => startOfDay(new Date()));
  const [periodo, setPeriodo] = useState<Periodo>('dia');
  const [unidade, setUnidade] = useState(TODAS);

  const [de, ate] = useMemo<[Date, Date]>(() => {
    if (periodo === 'semana') {
      const inicio = startOfWeek(dia, { weekStartsOn: 1 });
      return [inicio, addDays(inicio, 7)];
    }
    if (periodo === 'mes') return [startOfMonth(dia), startOfMonth(addMonths(dia, 1))];
    return [dia, addDays(dia, 1)];
  }, [dia, periodo]);

  const { data: doDia = [], isLoading } = useAvaliacoes(dia, addDays(dia, 1));
  const { data: doPeriodo = [] } = useAvaliacoes(de, ate);

  const unidades = useMemo(
    () => Array.from(new Set([...doDia, ...doPeriodo].map((a) => a.unidade).filter(Boolean) as string[])).sort(),
    [doDia, doPeriodo],
  );
  const escolheUnidade = !eu?.unidade && unidades.length > 1;
  const naUnidade = (a: Avaliacao) => unidade === TODAS || a.unidade === unidade;
  const lista = doDia.filter(naUnidade);

  // Comparecimento e retorno contam a avaliação; fechamento conta de qualquer
  // horário, que na clínica ele sai no R2 ou no R3.
  const numeros = useMemo(() => {
    const p = doPeriodo.filter(naUnidade);
    const av = p.filter((a) => a.tipo === 'avaliacao');
    const vieram = av.filter((a) => a.status === 'compareceu');
    const compareceram = vieram.length;
    const faltaram = av.filter((a) => a.status === 'faltou').length;
    const marcaramR2 = vieram.filter((a) => marcou(a, 'r2')).length;
    const fechadas = p.filter((a) => a.fechou_plano);
    return {
      avaliacoes: av.length,
      compareceram,
      faltaram,
      marcaramR2,
      fecharam: fechadas.length,
      valor: fechadas.reduce((s, a) => s + Number(a.valor_plano ?? 0), 0),
      taxaComparecimento: compareceram + faltaram ? Math.round((compareceram / (compareceram + faltaram)) * 100) : null,
      taxaR2: compareceram ? Math.round((marcaramR2 / compareceram) * 100) : null,
      taxaFechamento: compareceram ? Math.round((fechadas.length / compareceram) * 100) : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doPeriodo, unidade]);

  const rotuloPeriodo =
    periodo === 'dia' ? (isToday(dia) ? 'Hoje' : format(dia, "d 'de' MMMM", { locale: ptBR }))
    : periodo === 'semana' ? `Semana de ${format(de, 'd/MM')} a ${format(addDays(ate, -1), 'd/MM')}`
    : format(dia, "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <MainLayout>
      <Header
        title="Agenda"
        subtitle={comRetorno
          ? 'Avaliação, R2 e R3: a recepção marca a chegada e, na saída, o retorno ou o fechamento'
          : 'Avaliações do dia: a recepção marca a chegada e, na saída, se fechou plano'}
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setDia(addDays(dia, -1))} title="Dia anterior">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-card min-w-52 justify-center">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{maiuscula(format(dia, "EEEE, d 'de' MMMM", { locale: ptBR }))}</span>
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setDia(addDays(dia, 1))} title="Próximo dia">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        {!isToday(dia) && (
          <Button variant="ghost" size="sm" onClick={() => setDia(startOfDay(new Date()))}>Hoje</Button>
        )}
        {escolheUnidade && (
          <Select value={unidade} onValueChange={setUnidade}>
            <SelectTrigger className="h-9 w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas as unidades</SelectItem>
              {unidades.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Números do período */}
      <div className="rounded-xl border bg-card p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <p className="text-sm font-medium text-foreground">{maiuscula(rotuloPeriodo)}</p>
          <div className="flex rounded-lg bg-muted p-1">
            {(['dia', 'semana', 'mes'] as Periodo[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`px-3 py-1 rounded-md text-xs font-medium ${periodo === p ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                {p === 'dia' ? 'Dia' : p === 'semana' ? 'Semana' : 'Mês'}
              </button>
            ))}
          </div>
        </div>
        <div className={`grid grid-cols-2 gap-3 ${comRetorno ? 'md:grid-cols-3 xl:grid-cols-6' : 'md:grid-cols-5'}`}>
          <Numero rotulo="Avaliações" valor={numeros.avaliacoes} />
          <Numero rotulo="Compareceram" valor={numeros.compareceram} extra={numeros.taxaComparecimento !== null ? `${numeros.taxaComparecimento}% de quem tinha horário` : undefined} />
          <Numero rotulo="Faltaram" valor={numeros.faltaram} />
          {comRetorno && (
            <Numero rotulo="Marcaram R2" valor={numeros.marcaramR2} extra={numeros.taxaR2 !== null ? `${numeros.taxaR2}% de quem compareceu` : undefined} />
          )}
          <Numero rotulo={comRetorno ? 'Fecharam' : 'Fecharam plano'} valor={numeros.fecharam} extra={numeros.taxaFechamento !== null ? `${numeros.taxaFechamento}% de quem compareceu` : undefined} />
          <Numero rotulo="Valor fechado" valor={reais(numeros.valor)} />
        </div>
      </div>

      {/* Lista do dia */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading && (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        )}
        {!isLoading && lista.length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            Nenhum horário neste dia. Para marcar uma avaliação, abra a conversa do paciente no Atendimento e use o calendário no topo.
          </p>
        )}
        {lista.map((a) => (
          <Linha key={a.id} a={a} mostrarUnidade={unidades.length > 1} comRetorno={comRetorno} temEtapa={temEtapa} />
        ))}
      </div>
    </MainLayout>
  );
}

function Numero({ rotulo, valor, extra }: { rotulo: string; valor: number | string; extra?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-4 py-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-2xl font-semibold text-foreground mt-0.5">{valor}</p>
      {extra && <p className="text-[11px] text-muted-foreground mt-0.5">{extra}</p>}
    </div>
  );
}

function Linha({ a, mostrarUnidade, comRetorno, temEtapa }: {
  a: Avaliacao; mostrarUnidade: boolean; comRetorno: boolean; temEtapa: (chave: string) => boolean;
}) {
  const presenca = useRegistrarPresenca();
  const fechamento = useRegistrarFechamento();
  const agendar = useAgendarAvaliacao();
  const [forma, setForma] = useState<FormaFechamento | null>(null);
  const [corrigindo, setCorrigindo] = useState(false);
  const [valor, setValor] = useState('');
  const [plano, setPlano] = useState('');
  const [sessoes, setSessoes] = useState('');
  const [marcando, setMarcando] = useState(false);
  const [diaR, setDiaR] = useState('');
  const [horaR, setHoraR] = useState('');
  const ocupado = presenca.isPending || fechamento.isPending || agendar.isPending;
  const erro = (e: Error) => toast.error(e.message);
  const nome = a.leads?.name || formatarTelefone(a.leads?.phone ?? '');

  // Da avaliação sai o R2; do R2, o R3.
  const proximo: TipoHorario | null = !comRetorno ? null
    : a.tipo === 'avaliacao' ? 'r2'
    : a.tipo === 'r2' && temEtapa('agendou_r3') ? 'r3'
    : null;
  const proximoMarcado = proximo !== null && marcou(a, proximo);
  // Fecha no R2 e no R3. Na avaliação, só em empresa sem R2 ou para corrigir um fechamento de antes.
  const fechaAqui = a.tipo !== 'avaliacao' || !comRetorno || a.fechou_plano !== null;
  const formas = (Object.keys(FORMAS) as FormaFechamento[]).filter((f) => f === 'plano' || temEtapa(f));
  const emEdicao = forma !== null || marcando;

  const marcarPresenca = (compareceu: boolean) => {
    setCorrigindo(false);
    presenca.mutate({ id: a.id, compareceu }, { onError: erro });
  };
  const fechar = (fechou: boolean) => {
    const f = forma ?? 'plano';
    const v = fechou ? lerValor(valor) : null;
    if (fechou && !v) {
      toast.error(`Informe o ${FORMAS[f].valor.toLowerCase()}`);
      return;
    }
    fechamento.mutate(
      {
        id: a.id, fechou, forma: fechou ? f : null, valor: v, plano: fechou ? plano.trim() || null : null,
        sessoes: fechou && f === 'plano' && Number(sessoes) > 0 ? Math.round(Number(sessoes)) : null,
      },
      {
        onSuccess: () => {
          setForma(null);
          setCorrigindo(false);
          setValor('');
          if (fechou) toast.success(`${FORMAS[f].rotulo}: ${nome}, ${reais(v!)}`);
          else if (temEtapa('nao_fechou')) toast.success(`${nome} volta no Follow-up em 30 dias para um novo contato`);
        },
        onError: erro,
      },
    );
  };
  const abrirMarcacao = () => {
    setMarcando(true);
    setDiaR(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
    setHoraR('');
  };
  const salvarMarcacao = () => {
    if (!proximo || !diaR || !horaR) {
      toast.error('Escolha o dia e a hora');
      return;
    }
    const quando = new Date(`${diaR}T${horaR}`);
    agendar.mutate(
      { leadId: a.lead_id, quando, tipo: proximo },
      {
        onSuccess: () => {
          setMarcando(false);
          setCorrigindo(false);
          toast.success(`${ROTULO_TIPO[proximo]} de ${nome} marcado para ${format(quando, "EEEE, d/MM 'às' HH:mm", { locale: ptBR })}`);
        },
        onError: erro,
      },
    );
  };

  const situacao =
    a.status === 'agendada' ? { texto: 'Aguardando', cor: 'bg-muted text-muted-foreground' }
    : a.status === 'faltou' ? { texto: 'Faltou', cor: 'bg-red-100 text-red-700' }
    : a.fechou_plano === true ? { texto: `${FORMAS[a.forma_fechamento ?? 'plano'].rotulo} · ${reais(Number(a.valor_plano ?? 0))}`, cor: 'bg-green-100 text-green-800' }
    : a.fechou_plano === false ? { texto: temEtapa('nao_fechou') ? 'Não fechou plano' : 'Compareceu, não fechou', cor: 'bg-amber-100 text-amber-800' }
    : proximoMarcado ? { texto: `Compareceu · ${ROTULO_TIPO[proximo]} marcado`, cor: 'bg-primary/10 text-primary' }
    : { texto: 'Compareceu', cor: 'bg-primary/10 text-primary' };

  const decidido = a.status === 'faltou' || (a.status === 'compareceu' && (a.fechou_plano !== null || proximoMarcado));
  const aberto = a.status === 'compareceu' && (corrigindo || (a.fechou_plano === null && !proximoMarcado));

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 border-b last:border-b-0">
      <span className="w-12 text-sm font-semibold text-foreground tabular-nums">{format(new Date(a.marcada_para), 'HH:mm')}</span>
      <div className="flex-1 min-w-48">
        <p className="font-medium text-foreground">
          {nome}
          {a.tipo !== 'avaliacao' && (
            <span className="ml-2 align-middle text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold">{ROTULO_TIPO[a.tipo]}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatarTelefone(a.leads?.phone ?? '')}{mostrarUnidade && a.unidade ? ` · ${a.unidade}` : ''}
        </p>
      </div>
      <span className={`text-xs font-medium px-2 py-1 rounded-md ${situacao.cor}`}>{situacao.texto}</span>

      <div className="flex flex-wrap items-center gap-2">
        {ocupado && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}

        {(a.status === 'agendada' || corrigindo) && !emEdicao && (
          <>
            <Button size="sm" disabled={ocupado} onClick={() => marcarPresenca(true)}>Compareceu</Button>
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => marcarPresenca(false)}>Faltou</Button>
          </>
        )}

        {aberto && !emEdicao && (
          <>
            {fechaAqui && formas.map((f) => (
              <Button key={f} size="sm" disabled={ocupado} onClick={() => setForma(f)}>{FORMAS[f].rotulo}</Button>
            ))}
            {fechaAqui && (
              <Button size="sm" variant="outline" disabled={ocupado} onClick={() => fechar(false)}>
                {temEtapa('nao_fechou') ? 'Não fechou plano' : 'Não fechou'}
              </Button>
            )}
            {proximo && !proximoMarcado && (
              <Button size="sm" variant={fechaAqui ? 'outline' : 'default'} disabled={ocupado} onClick={abrirMarcacao}>
                Marcar {ROTULO_TIPO[proximo]}
              </Button>
            )}
          </>
        )}

        {forma && (
          <>
            <span className="text-xs font-medium text-muted-foreground">{FORMAS[forma].rotulo}</span>
            <Input
              autoFocus
              inputMode="decimal"
              placeholder={FORMAS[forma].valor}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fechar(true)}
              className="h-9 w-44"
            />
            {forma === 'plano' && (
              <>
                <Input
                  placeholder="Plano (opcional)"
                  value={plano}
                  onChange={(e) => setPlano(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fechar(true)}
                  className="h-9 w-44"
                />
                <Input
                  type="number"
                  min={1}
                  placeholder="Sessões"
                  value={sessoes}
                  onChange={(e) => setSessoes(e.target.value)}
                  className="h-9 w-24"
                />
              </>
            )}
            <Button size="sm" disabled={ocupado} onClick={() => fechar(true)}>Salvar</Button>
            <Button size="sm" variant="ghost" onClick={() => { setForma(null); setValor(''); }}>Cancelar</Button>
          </>
        )}

        {marcando && proximo && (
          <>
            <Input type="date" aria-label={`Dia do ${ROTULO_TIPO[proximo]}`} value={diaR} onChange={(e) => setDiaR(e.target.value)} className="h-9 w-40" />
            <Input type="time" aria-label={`Hora do ${ROTULO_TIPO[proximo]}`} value={horaR} step={300} onChange={(e) => setHoraR(e.target.value)} className="h-9 w-28" />
            <Button size="sm" disabled={ocupado} onClick={salvarMarcacao}>Salvar</Button>
            <Button size="sm" variant="ghost" onClick={() => setMarcando(false)}>Cancelar</Button>
          </>
        )}

        {decidido && !corrigindo && !emEdicao && (
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setCorrigindo(true)}>Corrigir</Button>
        )}
      </div>
    </div>
  );
}
