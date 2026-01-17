import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { mockLeads, mockMetrics, mockTeamMembers } from '@/data/mockData';
import { LEAD_SOURCES, LEAD_STAGES } from '@/types/crm';
import { Users, TrendingUp, Target, DollarSign, Award, UserCheck } from 'lucide-react';

export default function Reports() {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getSourceStats = () => {
    return LEAD_SOURCES.map(source => ({
      ...source,
      count: mockLeads.filter(lead => lead.source === source.value).length,
    }));
  };

  const getStageStats = () => {
    return LEAD_STAGES.map(stage => ({
      ...stage,
      count: mockLeads.filter(lead => lead.stage === stage.value).length,
      totalValue: mockLeads
        .filter(lead => lead.stage === stage.value)
        .reduce((sum, lead) => sum + (lead.value || 0), 0),
    }));
  };

  const sourceStats = getSourceStats();
  const stageStats = getStageStats();

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
          value={`${mockMetrics.conversionRate}%`}
          change={{ value: 3.2, isPositive: true }}
          icon={Target}
        />
        <MetricCard
          title="Tempo Médio de Fechamento"
          value={`${mockMetrics.avgClosingDays} dias`}
          change={{ value: 2, isPositive: false }}
          icon={TrendingUp}
          iconColor="text-warning"
        />
        <MetricCard
          title="Total de Leads"
          value={mockMetrics.totalLeads}
          change={{ value: 12, isPositive: true }}
          icon={Users}
          iconColor="text-primary"
        />
        <MetricCard
          title="Receita Total"
          value={formatCurrency(mockMetrics.totalRevenue)}
          change={{ value: 18, isPositive: true }}
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
              const percentage = (source.count / mockLeads.length) * 100;
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
              const percentage = (stage.count / mockLeads.length) * 100;
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

      {/* Team Performance */}
      <div className="bg-card rounded-xl p-6 shadow-card animate-fade-in">
        <h3 className="text-lg font-semibold text-foreground mb-6">Desempenho da Equipe</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 text-sm font-semibold text-foreground">Vendedor</th>
                <th className="text-center py-3 text-sm font-semibold text-foreground">Leads</th>
                <th className="text-center py-3 text-sm font-semibold text-foreground">Conversões</th>
                <th className="text-center py-3 text-sm font-semibold text-foreground">Taxa</th>
                <th className="text-right py-3 text-sm font-semibold text-foreground">Performance</th>
              </tr>
            </thead>
            <tbody>
              {mockTeamMembers.map((member, index) => {
                const rate = ((member.conversions / member.leadsCount) * 100).toFixed(1);
                const isTopPerformer = index === 0;
                return (
                  <tr key={member.id} className="border-b border-border animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-semibold text-primary">
                            {member.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground flex items-center gap-2">
                            {member.name}
                            {isTopPerformer && <Award className="w-4 h-4 text-warning" />}
                          </p>
                          <p className="text-sm text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-center py-4">
                      <span className="text-foreground font-medium">{member.leadsCount}</span>
                    </td>
                    <td className="text-center py-4">
                      <span className="text-success font-medium">{member.conversions}</span>
                    </td>
                    <td className="text-center py-4">
                      <span className="text-foreground font-medium">{rate}%</span>
                    </td>
                    <td className="text-right py-4">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden ml-auto">
                        <div
                          className="h-full rounded-full bg-success transition-all duration-500"
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
