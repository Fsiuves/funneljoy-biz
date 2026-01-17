import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { FunnelChart } from '@/components/dashboard/FunnelChart';
import { RecentLeads } from '@/components/dashboard/RecentLeads';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { mockLeads, mockActivities, mockMetrics } from '@/data/mockData';
import { Users, TrendingUp, Clock, DollarSign, UserPlus, Target } from 'lucide-react';

export default function Dashboard() {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
    }).format(value);
  };

  return (
    <MainLayout>
      <Header 
        title="Dashboard" 
        subtitle="Visão geral do seu CRM"
      />

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Total de Leads"
          value={mockMetrics.totalLeads}
          change={{ value: 12, isPositive: true }}
          icon={Users}
        />
        <MetricCard
          title="Novos este Mês"
          value={mockMetrics.newLeadsThisMonth}
          change={{ value: 8, isPositive: true }}
          icon={UserPlus}
          iconColor="text-success"
        />
        <MetricCard
          title="Taxa de Conversão"
          value={`${mockMetrics.conversionRate}%`}
          change={{ value: 3.2, isPositive: true }}
          icon={Target}
          iconColor="text-accent"
        />
        <MetricCard
          title="Receita do Mês"
          value={formatCurrency(mockMetrics.revenueThisMonth)}
          change={{ value: 15, isPositive: true }}
          icon={DollarSign}
          iconColor="text-warning"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <FunnelChart leads={mockLeads} />
        <div className="grid grid-cols-2 gap-6">
          <MetricCard
            title="Tempo Médio de Fechamento"
            value={`${mockMetrics.avgClosingDays} dias`}
            icon={Clock}
            iconColor="text-primary"
          />
          <MetricCard
            title="Receita Total"
            value={formatCurrency(mockMetrics.totalRevenue)}
            icon={TrendingUp}
            iconColor="text-success"
          />
        </div>
      </div>

      {/* Lists Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentLeads leads={mockLeads} />
        <ActivityFeed activities={mockActivities} />
      </div>
    </MainLayout>
  );
}
