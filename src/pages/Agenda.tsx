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
import { formatarTelefone } from '@/components/atendimento/PainelConversa';
import {
  lerValor, reais, useAvaliacoes, useRegistrarFechamento, useRegistrarPresenca, type Avaliacao,
} from '@/hooks/useAgenda';

type Periodo = 'dia' | 'semana' | 'mes';
const TODAS = '__todas__';
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Avaliações do dia. A recepção marca a chegada (compareceu ou faltou) e, na
 * saída, quando o paciente vem faturar, se fechou plano e o valor. O
 * quiropraxista não precisa de computador.
 */
export default function Agenda() {
  const { user } = useAuth();
  const { data: equipe = [] } = useEquipe();
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

  const numeros = useMemo(() => {
    const p = doPeriodo.filter(naUnidade);
    const compareceram = p.filter((a) => a.status === 'compareceu').length;
    const faltaram = p.filter((a) => a.status === 'faltou').length;
    const fechadas = p.filter((a) => a.fechou_plano);
    return {
      avaliacoes: p.length,
      compareceram,
      faltaram,
      fecharam: fechadas.length,
      valor: fechadas.reduce((s, a) => s + Number(a.valor_plano ?? 0), 0),
      taxaComparecimento: compareceram + faltaram ? Math.round((compareceram / (compareceram + faltaram)) * 100) : null,
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
      <Header title="Agenda" subtitle="Avaliações do dia: a recepção marca a chegada e, na saída, se fechou plano" />

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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Numero rotulo="Avaliações" valor={numeros.avaliacoes} />
          <Numero rotulo="Compareceram" valor={numeros.compareceram} extra={numeros.taxaComparecimento !== null ? `${numeros.taxaComparecimento}% de quem tinha horário` : undefined} />
          <Numero rotulo="Faltaram" valor={numeros.faltaram} />
          <Numero rotulo="Fecharam plano" valor={numeros.fecharam} extra={numeros.taxaFechamento !== null ? `${numeros.taxaFechamento}% de quem compareceu` : undefined} />
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
            Nenhuma avaliação neste dia. Para marcar, abra a conversa do paciente no Atendimento e use o calendário no topo.
          </p>
        )}
        {lista.map((a) => <Linha key={a.id} a={a} mostrarUnidade={unidades.length > 1} />)}
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

function Linha({ a, mostrarUnidade }: { a: Avaliacao; mostrarUnidade: boolean }) {
  const presenca = useRegistrarPresenca();
  const fechamento = useRegistrarFechamento();
  const [pedindoValor, setPedindoValor] = useState(false);
  const [corrigindo, setCorrigindo] = useState(false);
  const [valor, setValor] = useState('');
  const [plano, setPlano] = useState('');
  const [sessoes, setSessoes] = useState('');
  const ocupado = presenca.isPending || fechamento.isPending;
  const erro = (e: Error) => toast.error(e.message);
  const nome = a.leads?.name || formatarTelefone(a.leads?.phone ?? '');

  const marcarPresenca = (compareceu: boolean) => {
    setCorrigindo(false);
    presenca.mutate({ id: a.id, compareceu }, { onError: erro });
  };
  const fechar = (fechou: boolean) => {
    const v = fechou ? lerValor(valor) : null;
    if (fechou && !v) {
      toast.error('Informe o valor do plano');
      return;
    }
    fechamento.mutate(
      { id: a.id, fechou, valor: v, plano: fechou ? plano.trim() || null : null, sessoes: fechou && Number(sessoes) > 0 ? Math.round(Number(sessoes)) : null },
      {
        onSuccess: () => {
          setPedindoValor(false);
          setCorrigindo(false);
          setValor('');
          if (fechou) toast.success(`Plano de ${nome} registrado: ${reais(v!)}`);
        },
        onError: erro,
      },
    );
  };

  const situacao =
    a.status === 'agendada' ? { texto: 'Aguardando', cor: 'bg-muted text-muted-foreground' }
    : a.status === 'faltou' ? { texto: 'Faltou', cor: 'bg-red-100 text-red-700' }
    : a.fechou_plano === true ? { texto: `Fechou plano · ${reais(Number(a.valor_plano ?? 0))}`, cor: 'bg-green-100 text-green-800' }
    : a.fechou_plano === false ? { texto: 'Compareceu, não fechou', cor: 'bg-amber-100 text-amber-800' }
    : { texto: 'Compareceu', cor: 'bg-primary/10 text-primary' };

  const decidido = a.status === 'faltou' || (a.status === 'compareceu' && a.fechou_plano !== null);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 border-b last:border-b-0">
      <span className="w-12 text-sm font-semibold text-foreground tabular-nums">{format(new Date(a.marcada_para), 'HH:mm')}</span>
      <div className="flex-1 min-w-48">
        <p className="font-medium text-foreground">{nome}</p>
        <p className="text-xs text-muted-foreground">
          {formatarTelefone(a.leads?.phone ?? '')}{mostrarUnidade && a.unidade ? ` · ${a.unidade}` : ''}
        </p>
      </div>
      <span className={`text-xs font-medium px-2 py-1 rounded-md ${situacao.cor}`}>{situacao.texto}</span>

      <div className="flex items-center gap-2">
        {ocupado && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}

        {(a.status === 'agendada' || corrigindo) && !pedindoValor && (
          <>
            <Button size="sm" disabled={ocupado} onClick={() => marcarPresenca(true)}>Compareceu</Button>
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => marcarPresenca(false)}>Faltou</Button>
          </>
        )}

        {a.status === 'compareceu' && (a.fechou_plano === null || corrigindo) && !pedindoValor && (
          <>
            <Button size="sm" disabled={ocupado} onClick={() => setPedindoValor(true)}>Fechou plano</Button>
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => fechar(false)}>Não fechou</Button>
          </>
        )}

        {pedindoValor && (
          <>
            <Input
              autoFocus
              inputMode="decimal"
              placeholder="Valor do plano"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fechar(true)}
              className="h-9 w-36"
            />
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
            <Button size="sm" disabled={ocupado} onClick={() => fechar(true)}>Salvar</Button>
            <Button size="sm" variant="ghost" onClick={() => { setPedindoValor(false); setValor(''); }}>Cancelar</Button>
          </>
        )}

        {decidido && !corrigindo && !pedindoValor && (
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setCorrigindo(true)}>Corrigir</Button>
        )}
      </div>
    </div>
  );
}
