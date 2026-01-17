import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { useLeads } from '@/hooks/useLeads';
import { LEAD_SOURCES, LEAD_STAGES } from '@/types/crm';
import { Users, TrendingUp, Target, DollarSign, Loader2 } from 'lucide-react';

export default function Reports() {
  const { data: leads = [], isLoading } = useLeads();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const wonLeads = leads.filter(l => l.stage === 'won');
  const conversionRate = leads.length > 0 ? Math.round((wonLeads.length / leads.length) * 100) : 0;
  const totalRevenue = wonLeads.reduce((sum, l) => sum + (l.value || 0), 0);

  const getSourceStats = () => {
    return LEAD_SOURCES.map(source => ({
      ...source,
      count: leads.filter(lead => lead.source === source.value).length,
    }));
  };

  const getStageStats = () => {
    return LEAD_STAGES.map(stage => ({
      ...stage,
      count: leads.filter(lead => lead.stage === stage.value).length,
      totalValue: leads
        .filter(lead => lead.stage === stage.value)
        .reduce((sum, lead) => sum + (lead.value || 0), 0),
    }));
  };

  const sourceStats = getSourceStats();
  const stageStats = getStageStats();

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header 
        title="Relatórios" 
        subtitle="Análises e métricas do seu negócio"
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Taxa de Conversão"
          value={`${conversionRate}%`}
          icon={Target}
        />
        <MetricCard
          title="Leads Ativos"
          value={leads.filter(l => !['won', 'lost'].includes(l.stage)).length}
          icon={TrendingUp}
          iconColor="text-warning"
        />
        <MetricCard
          title="Total de Leads"
          value={leads.length}
          icon={Users}
          iconColor="text-primary"
        />
        <MetricCard
          title="Receita Total"
          value={formatCurrency(totalRevenue)}
          icon={DollarSign}
          iconColor="text-success"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Source Distribution */}
        <div className="bg-card rounded-xl p-6 shadow-card animate-fade-in">
          <h3 className="text-lg font-semibold text-foreground mb-6">Leads por Origem</h3>
          <div className="space-y-4">
            {sourceStats.map((source, index) => {
              const percentage = leads.length > 0 ? (source.count / leads.length) * 100 : 0;
              return (
                <div key={source.value} className="animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">{source.label}</span>
                    <span className="text-sm text-muted-foreground">{source.count} leads ({percentage.toFixed(0)}%)</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stage Distribution */}
        <div className="bg-card rounded-xl p-6 shadow-card animate-fade-in">
          <h3 className="text-lg font-semibold text-foreground mb-6">Leads por Etapa</h3>
          <div className="space-y-4">
            {stageStats.map((stage, index) => {
              const percentage = leads.length > 0 ? (stage.count / leads.length) * 100 : 0;
              const stageColor = stage.value === 'new' ? 'hsl(var(--stage-new))' :
                                 stage.value === 'negotiation' ? 'hsl(var(--stage-negotiation))' :
                                 stage.value === 'proposal' ? 'hsl(var(--stage-proposal))' :
                                 stage.value === 'won' ? 'hsl(var(--stage-won))' :
                                 'hsl(var(--stage-lost))';
              return (
                <div key={stage.value} className="animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">{stage.label}</span>
                    <div className="text-right">
                      <span className="text-sm text-muted-foreground">{stage.count} leads</span>
                      <span className="text-sm font-medium text-foreground ml-2">{formatCurrency(stage.totalValue)}</span>
                    </div>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%`, backgroundColor: stageColor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
