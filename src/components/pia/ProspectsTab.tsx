import { useState, useEffect } from 'react';
import { Phone, MessageSquare, CheckCircle2, Clock, XCircle, Loader2, ChevronDown, ChevronUp, Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const SUPABASE_PIA_URL = 'https://sjspfkzxyfipuamvbswd.supabase.co';
const SUPABASE_PIA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqc3Bma3p4eWZpcHVhbXZic3dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODE4MzUsImV4cCI6MjA4NDI1NzgzNX0.UtQNcAlgxuVndCfeay2nRQW9xi4MbblzKGXwXED5xpQ';

interface Prospect {
  id: string;
  nome: string;
  telefone: string;
  nicho: string;
  cidade: string;
  status: string;
  analise_lead: string;
  msg_abordagem: string;
  msg_follow1: string;
  msg_follow2: string;
  ultima_resposta: string;
  qualificacao: string;
  data_criacao: string;
  data_ultimo_contato: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: any; class: string }> = {
  novo: { label: 'Novo', icon: Clock, class: 'bg-muted text-muted-foreground' },
  pronto_para_envio: { label: 'Pronto', icon: Clock, class: 'bg-primary/10 text-primary' },
  abordado: { label: 'Abordado', icon: MessageSquare, class: 'bg-blue-500/10 text-blue-500' },
  follow_up_1: { label: 'Follow-up 1', icon: MessageSquare, class: 'bg-warning/10 text-warning' },
  follow_up_2: { label: 'Follow-up 2', icon: MessageSquare, class: 'bg-orange-500/10 text-orange-500' },
  respondeu: { label: 'Respondeu', icon: MessageSquare, class: 'bg-purple-500/10 text-purple-500' },
  qualificado: { label: 'Qualificado', icon: CheckCircle2, class: 'bg-success/10 text-success' },
  frio: { label: 'Frio', icon: XCircle, class: 'bg-destructive/10 text-destructive' },
};

export function ProspectsTab() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const { toast } = useToast();

  const carregar = async () => {
    try {
      const res = await fetch(
        `${SUPABASE_PIA_URL}/rest/v1/prospects?select=*&order=data_criacao.desc&limit=200`,
        { headers: { apikey: SUPABASE_PIA_KEY, Authorization: `Bearer ${SUPABASE_PIA_KEY}` } }
      );
      const data = await res.json();
      setProspects(data || []);
    } catch {
      toast({ title: 'Erro ao carregar prospects', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const filtrados = prospects.filter(p => {
    const matchStatus = filtroStatus === 'todos' || p.status === filtroStatus;
    const matchBusca = !busca ||
      p.nome?.toLowerCase().includes(busca.toLowerCase()) ||
      p.nicho?.toLowerCase().includes(busca.toLowerCase()) ||
      p.cidade?.toLowerCase().includes(busca.toLowerCase());
    return matchStatus && matchBusca;
  });

  const contadores = Object.keys(STATUS_CONFIG).reduce((acc, key) => {
    acc[key] = prospects.filter(p => p.status === key).length;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      {/* Contadores por status */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2 mb-6">
        <button
          onClick={() => setFiltroStatus('todos')}
          className={`p-3 rounded-lg border text-center transition-all ${filtroStatus === 'todos' ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50'}`}
        >
          <p className="text-lg font-bold text-foreground">{prospects.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Todos</p>
        </button>
        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
          <button
            key={key}
            onClick={() => setFiltroStatus(filtroStatus === key ? 'todos' : key)}
            className={`p-3 rounded-lg border text-center transition-all ${filtroStatus === key ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50'}`}
          >
            <p className="text-lg font-bold text-foreground">{contadores[key] || 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{config.label}</p>
          </button>
        ))}
      </div>

      {/* Busca */}
      <div className="mb-4">
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome, nicho ou cidade..."
          className="input-field w-full max-w-md"
        />
      </div>

      {/* Tabela */}
      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        {filtrados.length === 0 ? (
          <div className="p-12 text-center">
            <Target className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhum prospect encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Empresa</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Contato</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Nicho</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Status</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Última resposta</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-foreground">Ver</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => {
                  const sc = STATUS_CONFIG[p.status] || STATUS_CONFIG.novo;
                  const isExpanded = expandedId === p.id;
                  return (
                    <>
                      <tr key={p.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-xs font-semibold text-primary">
                                {p.nome?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-foreground text-sm">{p.nome}</p>
                              <p className="text-xs text-muted-foreground">{p.cidade}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-sm text-foreground">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                            {p.telefone}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-foreground">{p.nicho}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${sc.class}`}>
                            <sc.icon className="w-3 h-3" />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-foreground max-w-xs truncate">
                            {p.ultima_resposta || <span className="text-muted-foreground">—</span>}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : p.id)}
                            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${p.id}-exp`} className="bg-muted/20 border-b border-border">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="bg-card rounded-lg p-4 border border-border">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Análise do Negócio</p>
                                <p className="text-sm text-foreground">{p.analise_lead || '—'}</p>
                              </div>
                              <div className="bg-card rounded-lg p-4 border border-border">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Mensagens Geradas</p>
                                <div className="space-y-2">
                                  <div>
                                    <span className="text-xs text-primary font-medium">MSG 1 (Abordagem):</span>
                                    <p className="text-xs text-foreground mt-0.5 line-clamp-2">{p.msg_abordagem || '—'}</p>
                                  </div>
                                  <div>
                                    <span className="text-xs text-warning font-medium">MSG 2 (Follow-up):</span>
                                    <p className="text-xs text-foreground mt-0.5 line-clamp-2">{p.msg_follow1 || '—'}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="bg-card rounded-lg p-4 border border-border">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Qualificação SDR</p>
                                {p.qualificacao ? (
                                  <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                                    p.qualificacao === 'INTERESSE' ? 'bg-success/10 text-success' :
                                    p.qualificacao === 'REJEICAO' ? 'bg-destructive/10 text-destructive' :
                                    'bg-warning/10 text-warning'
                                  }`}>{p.qualificacao}</span>
                                ) : (
                                  <p className="text-sm text-muted-foreground">Aguardando resposta</p>
                                )}
                                {p.ultima_resposta && (
                                  <p className="text-xs text-foreground mt-2 italic">"{p.ultima_resposta}"</p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
