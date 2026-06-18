import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { CampanhasTab } from '@/components/pia/CampanhasTab';
import { ProspectsTab } from '@/components/pia/ProspectsTab';
import { Target, Users, BarChart3, Loader2 } from 'lucide-react';

const SUPABASE_PIA_URL = 'https://sjspfkzxyfipuamvbswd.supabase.co';
const SUPABASE_PIA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqc3Bma3p4eWZpcHVhbXZic3dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODE4MzUsImV4cCI6MjA4NDI1NzgzNX0.UtQNcAlgxuVndCfeay2nRQW9xi4MbblzKGXwXED5xpQ';

type Tab = 'campanhas' | 'prospects' | 'metricas';

export default function PIA() {
  const [activeTab, setActiveTab] = useState<Tab>('campanhas');

  const tabs = [
    { id: 'campanhas' as Tab, label: 'Campanhas', icon: Target },
    { id: 'prospects' as Tab, label: 'Prospects', icon: Users },
    { id: 'metricas' as Tab, label: 'Métricas', icon: BarChart3 },
  ];

  return (
    <MainLayout>
      <Header
        title="P.I.A. — Prospecção Inteligente"
        subtitle="Automação completa de prospecção via WhatsApp com IA"
      />

      <div className="flex gap-1 mb-6 bg-muted p-1 rounded-lg w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'campanhas' && <CampanhasTab />}
      {activeTab === 'prospects' && <ProspectsTab />}
      {activeTab === 'metricas' && <MetricasTab />}
    </MainLayout>
  );
}

function MetricasTab() {
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ total: 0, abordados: 0, responderam: 0, qualificados: 0 });

  useEffect(() => {
    const headers = { apikey: SUPABASE_PIA_KEY, Authorization: `Bearer ${SUPABASE_PIA_KEY}`, Prefer: 'count=exact' };
    const countQuery = async (filter: string) => {
      const res = await fetch(`${SUPABASE_PIA_URL}/rest/v1/prospects?select=id${filter ? '&' + filter : ''}&limit=1`, { headers });
      const range = res.headers.get('content-range') || '';
      const total = parseInt(range.split('/')[1] || '0', 10);
      return isNaN(total) ? 0 : total;
    };
    Promise.all([
      countQuery(''),
      countQuery('status=in.(abordado,follow_up_1,follow_up_2,respondeu,qualificado,frio,em_diagnostico)'),
      countQuery('or=(status.in.(respondeu,qualificado,em_diagnostico),ultima_resposta.not.is.null)'),
      countQuery('or=(status.eq.qualificado,qualificacao.eq.INTERESSE)'),
    ]).then(([total, abordados, responderam, qualificados]) => {
      setCounts({ total, abordados, responderam, qualificados });
    }).finally(() => setLoading(false));
  }, []);

  const metrics = [
    { label: 'Total de Leads', valor: counts.total, cor: 'text-primary', desc: 'Gerados pelo P.I.A.' },
    { label: 'Abordados', valor: counts.abordados, cor: 'text-blue-500', desc: 'Mensagem enviada' },
    { label: 'Responderam', valor: counts.responderam, cor: 'text-purple-500', desc: 'Interagiram com o SDR' },
    { label: 'Qualificados', valor: counts.qualificados, cor: 'text-success', desc: 'Enviados para o CRM' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((m, i) => (
        <div key={i} className="bg-card rounded-xl shadow-card p-6">
          <p className="text-sm text-muted-foreground mb-1">{m.label}</p>
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground my-1" />
          ) : (
            <p className={`text-3xl font-bold ${m.cor}`}>{m.valor.toLocaleString('pt-BR')}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
        </div>
      ))}
    </div>
  );
}
