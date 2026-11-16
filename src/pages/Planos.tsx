import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, subDays, subMonths, endOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { ErroAoCarregar } from '@/components/ErroAoCarregar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, MessageCircle, Undo2 } from 'lucide-react';
import { useEquipe, conversaDoPaciente } from '@/hooks/useAtendimento';
import { FORMAS, reais, useDesfazerRenovacao, usePlanos, type PlanoFechado } from '@/hooks/useAgenda';
import { formatarTelefone } from '@/components/atendimento/PainelConversa';

type Periodo = 'mes' | 'mes_passado' | '30d' | 'tudo';
const PERIODOS: { chave: Periodo; rotulo: string }[] = [
  { chave: 'mes', rotulo: 'Este mês' },
  { chave: 'mes_passado', rotulo: 'Mês passado' },
  { chave: '30d', rotulo: '30 dias' },
  { chave: 'tudo', rotulo: 'Tudo' },
];
const TODAS = '__todas__';
/** Primeiro plano (fechado na Agenda ou no funil) ou renovação (52-renovacao.sql). */
type Tipo = 'todos' | 'primeiro' | 'renovacao';
const TIPOS: { chave: Tipo; rotulo: string }[] = [
  { chave: 'todos', rotulo: 'Todos os planos' },
  { chave: 'primeiro', rotulo: 'Primeiro plano' },
  { chave: 'renovacao', rotulo: 'Renovações' },
];

function noPeriodo(p: Periodo, quando: string | null) {
  if (p === 'tudo') return true;
  if (!quando) return false;
  const d = new Date(quando);
  const hoje = new Date();
  if (p === 'mes') return d >= startOfMonth(hoje);
  if (p === '30d') return d >= subDays(hoje, 30);
  const passado = subMonths(hoje, 1);
  return d >= startOfMonth(passado) && d <= endOfMonth(passado);
}

/**
 * Quem fechou plano: paciente, plano, sessões, valor, quando e quem registrou.
 * Entra aqui o que a recepção marca como Fechou plano na Agenda ou no funil, e a
 * renovação (etapa Renovou plano), que fica junto, marcada como renovação.
 */
export default function Planos() {
  const navigate = useNavigate();
  const { data: planos = [], isLoading, isError, isFetching, refetch } = usePlanos();
  const { data: equipe = [] } = useEquipe();
  const nomes = useMemo(() => new Map(equipe.map((p) => [p.id, p.name])), [equipe]);
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [unidade, setUnidade] = useState(TODAS);
  const [tipo, setTipo] = useState<Tipo>('todos');
  const [busca, setBusca] = useState('');
  const desfazer = useDesfazerRenovacao();

  const unidades = useMemo(
    () => Array.from(new Set(planos.map((p) => p.unidade).filter(Boolean) as string[])).sort(),
    [planos],
  );
  const termo = busca.trim().toLowerCase();
  const digitos = busca.replace(/\D/g, '');
  const lista = planos.filter((p) =>
    noPeriodo(periodo, p.fechamento_em) &&
    (unidade === TODAS || p.unidade === unidade) &&
    (tipo === 'todos' || (tipo === 'renovacao') === !!p.renovacao) &&
    (!termo ||
      (p.leads?.name ?? '').toLowerCase().includes(termo) ||
      (digitos.length >= 3 && (p.leads?.phone ?? '').includes(digitos))));
  const total = lista.reduce((s, p) => s + Number(p.valor_plano ?? 0), 0);
  const renovacoes = lista.filter((p) => p.renovacao).length;

  const desfazerRenovacao = (p: PlanoFechado) => {
    const nome = p.leads?.name || formatarTelefone(p.leads?.phone ?? '');
    if (!confirm(`Desfazer a renovação de ${nome} (${reais(Number(p.valor_plano ?? 0))})? O paciente volta para a etapa em que estava.`)) return;
    desfazer.mutate(p.id, {
      onSuccess: () => toast.success('Renovação desfeita'),
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível desfazer'),
    });
  };

  const abrirConversa = async (p: PlanoFechado) => {
    try {
      const id = await conversaDoPaciente({ id: p.lead_id, phone: p.leads?.phone });
      if (id) navigate(`/atendimento?conversa=${id}`);
      else toast.error('Esse paciente ainda não tem conversa no WhatsApp');
    } catch {
      toast.error('Sem conexão com o servidor. Tente de novo.');
    }
  };

  return (
    <MainLayout>
      <Header title="Planos" subtitle="Quem fechou ou renovou plano, com valor, sessões e data" busca={{ valor: busca, mudar: setBusca }} />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex rounded-lg bg-muted p-1">
          {PERIODOS.map((p) => (
            <button key={p.chave} onClick={() => setPeriodo(p.chave)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${periodo === p.chave ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>
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
        <Select value={tipo} onValueChange={(v) => setTipo(v as Tipo)}>
          <SelectTrigger className="h-9 w-44" aria-label="Tipo de plano"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TIPOS.map((t) => <SelectItem key={t.chave} value={t.chave}>{t.rotulo}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="ml-auto text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{lista.length}</span> {lista.length === 1 ? 'plano' : 'planos'} ·{' '}
          <span className="font-semibold text-foreground">{reais(total)}</span>
          {tipo === 'todos' && renovacoes > 0 && <> · {renovacoes} {renovacoes === 1 ? 'renovação' : 'renovações'}</>}
        </p>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="text-left font-medium px-4 py-3">Paciente</th>
              <th className="text-left font-medium px-3 py-3">Unidade</th>
              <th className="text-left font-medium px-3 py-3">Plano</th>
              <th className="text-right font-medium px-3 py-3">Sessões</th>
              <th className="text-right font-medium px-3 py-3">Valor</th>
              <th className="text-left font-medium px-3 py-3">Fechado em</th>
              <th className="text-left font-medium px-3 py-3">Registrado por</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8} className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary inline" /></td></tr>
            )}
            {!isLoading && isError && planos.length === 0 && (
              <tr><td colSpan={8}><ErroAoCarregar oQue="os planos" tentar={() => void refetch()} tentando={isFetching} /></td></tr>
            )}
            {!isLoading && !isError && lista.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-10 text-center text-muted-foreground">
                Nenhum plano neste período. Quando a recepção marca Fechou plano na Agenda ou no funil, ou Renovou plano no funil
                ou em Pacientes, ele aparece aqui.
              </td></tr>
            )}
            {lista.map((p) => (
              <tr key={p.id} className="border-b last:border-b-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{p.leads?.name || formatarTelefone(p.leads?.phone ?? '')}</p>
                  <p className="text-xs text-muted-foreground">{formatarTelefone(p.leads?.phone ?? '')}</p>
                </td>
                <td className="px-3 py-3">{p.unidade ?? '-'}</td>
                <td className="px-3 py-3">
                  {p.renovacao && (
                    <span className="mr-1.5 inline-block rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                      Renovação
                    </span>
                  )}
                  {[p.forma_fechamento && p.forma_fechamento !== 'plano' ? FORMAS[p.forma_fechamento].rotulo : null, p.plano]
                    .filter(Boolean).join(' · ') || (p.renovacao ? '' : '-')}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{p.sessoes ?? '-'}</td>
                <td className="px-3 py-3 text-right tabular-nums font-medium">{p.valor_plano == null ? '-' : reais(Number(p.valor_plano))}</td>
                <td className="px-3 py-3">{p.fechamento_em ? format(new Date(p.fechamento_em), 'dd/MM/yyyy') : '-'}</td>
                <td className="px-3 py-3 text-muted-foreground">{(p.fechamento_por && nomes.get(p.fechamento_por)) || 'Equipe'}</td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  {p.renovacao && (
                    <Button size="icon" variant="ghost" title="Desfazer renovação" disabled={desfazer.isPending}
                      onClick={() => desfazerRenovacao(p)}>
                      <Undo2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" title="Abrir conversa" onClick={() => abrirConversa(p)}>
                    <MessageCircle className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MainLayout>
  );
}
