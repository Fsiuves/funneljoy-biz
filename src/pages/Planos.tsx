import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, subDays, subMonths, endOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useEquipe } from '@/hooks/useAtendimento';
import { reais, usePlanos, type PlanoFechado } from '@/hooks/useAgenda';
import { formatarTelefone } from '@/components/atendimento/PainelConversa';

type Periodo = 'mes' | 'mes_passado' | '30d' | 'tudo';
const PERIODOS: { chave: Periodo; rotulo: string }[] = [
  { chave: 'mes', rotulo: 'Este mês' },
  { chave: 'mes_passado', rotulo: 'Mês passado' },
  { chave: '30d', rotulo: '30 dias' },
  { chave: 'tudo', rotulo: 'Tudo' },
];
const TODAS = '__todas__';

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
 * Entra aqui o que a recepção marca como Fechou plano na Agenda ou no funil.
 */
export default function Planos() {
  const navigate = useNavigate();
  const { data: planos = [], isLoading } = usePlanos();
  const { data: equipe = [] } = useEquipe();
  const nomes = useMemo(() => new Map(equipe.map((p) => [p.id, p.name])), [equipe]);
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [unidade, setUnidade] = useState(TODAS);
  const [busca, setBusca] = useState('');

  const unidades = useMemo(
    () => Array.from(new Set(planos.map((p) => p.unidade).filter(Boolean) as string[])).sort(),
    [planos],
  );
  const termo = busca.trim().toLowerCase();
  const digitos = busca.replace(/\D/g, '');
  const lista = planos.filter((p) =>
    noPeriodo(periodo, p.fechamento_em) &&
    (unidade === TODAS || p.unidade === unidade) &&
    (!termo ||
      (p.leads?.name ?? '').toLowerCase().includes(termo) ||
      (digitos.length >= 3 && (p.leads?.phone ?? '').includes(digitos))));
  const total = lista.reduce((s, p) => s + Number(p.valor_plano ?? 0), 0);

  const abrirConversa = async (p: PlanoFechado) => {
    const { data } = await (supabase as any)
      .from('conversations').select('id').eq('lead_id', p.lead_id)
      .order('last_message_at', { ascending: false }).limit(1).maybeSingle();
    if (data?.id) navigate(`/atendimento?conversa=${data.id}`);
    else toast.error('Esse paciente ainda não tem conversa no WhatsApp');
  };

  return (
    <MainLayout>
      <Header title="Planos" subtitle="Quem fechou plano, com valor, sessões e data" busca={{ valor: busca, mudar: setBusca }} />

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
        <p className="ml-auto text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{lista.length}</span> {lista.length === 1 ? 'plano' : 'planos'} ·{' '}
          <span className="font-semibold text-foreground">{reais(total)}</span>
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
            {!isLoading && lista.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-10 text-center text-muted-foreground">
                Nenhum plano fechado neste período. Quando a recepção marca Fechou plano na Agenda ou no funil, ele aparece aqui.
              </td></tr>
            )}
            {lista.map((p) => (
              <tr key={p.id} className="border-b last:border-b-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{p.leads?.name || formatarTelefone(p.leads?.phone ?? '')}</p>
                  <p className="text-xs text-muted-foreground">{formatarTelefone(p.leads?.phone ?? '')}</p>
                </td>
                <td className="px-3 py-3">{p.unidade ?? '-'}</td>
                <td className="px-3 py-3">{p.plano ?? '-'}</td>
                <td className="px-3 py-3 text-right tabular-nums">{p.sessoes ?? '-'}</td>
                <td className="px-3 py-3 text-right tabular-nums font-medium">{reais(Number(p.valor_plano ?? 0))}</td>
                <td className="px-3 py-3">{p.fechamento_em ? format(new Date(p.fechamento_em), 'dd/MM/yyyy') : '-'}</td>
                <td className="px-3 py-3 text-muted-foreground">{(p.fechamento_por && nomes.get(p.fechamento_por)) || 'Equipe'}</td>
                <td className="px-3 py-3 text-right">
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
