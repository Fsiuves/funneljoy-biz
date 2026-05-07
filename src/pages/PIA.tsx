import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { CampanhasTab } from '@/components/pia/CampanhasTab';
import { ProspectsTab } from '@/components/pia/ProspectsTab';
import { Target, Users, BarChart3 } from 'lucide-react';

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
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[
        { label: 'Total de Leads', valor: '—', cor: 'text-primary', desc: 'Gerados pelo P.I.A.' },
        { label: 'Abordados', valor: '—', cor: 'text-blue-500', desc: 'Mensagem enviada' },
        { label: 'Responderam', valor: '—', cor: 'text-purple-500', desc: 'Interagiram com o SDR' },
        { label: 'Qualificados', valor: '—', cor: 'text-success', desc: 'Enviados para o CRM' },
      ].map((m, i) => (
        <div key={i} className="bg-card rounded-xl shadow-card p-6">
          <p className="text-sm text-muted-foreground mb-1">{m.label}</p>
          <p className={`text-3xl font-bold ${m.cor}`}>{m.valor}</p>
          <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
        </div>
      ))}
    </div>
  );
}
