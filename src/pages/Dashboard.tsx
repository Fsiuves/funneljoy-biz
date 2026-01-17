import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { FunnelChart } from '@/components/dashboard/FunnelChart';
import { RecentLeads } from '@/components/dashboard/RecentLeads';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { useLeads } from '@/hooks/useLeads';
import { useActivities } from '@/hooks/useActivities';
import { Users, TrendingUp, Clock, DollarSign, UserPlus, Target, Loader2 } from 'lucide-react';

export default function Dashboard() {
  const { data: leads = [], isLoading: leadsLoading } = useLeads();
  const { data: activities = [], isLoading: activitiesLoading } = useActivities();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
    }).format(value);
  };

  // Calculate metrics from real data
  const totalLeads = leads.length;
  const now = new Date();
  const thisMonth = leads.filter(l => {
    const d = new Date(l.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const newLeadsThisMonth = thisMonth.length;
  
  const wonLeads = leads.filter(l => l.stage === 'won');
  const conversionRate = totalLeads > 0 ? Math.round((wonLeads.length / totalLeads) * 100) : 0;
  
  const totalRevenue = wonLeads.reduce((sum, l) => sum + (l.value || 0), 0);
  const revenueThisMonth = wonLeads
    .filter(l => {
      const d = new Date(l.updatedAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, l) => sum + (l.value || 0), 0);

  const isLoading = leadsLoading || activitiesLoading;

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
        title="Dashboard" 
        subtitle="Visão geral do seu CRM"
      />

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Total de Leads"
          value={totalLeads}
          icon={Users}
        />
        <MetricCard
          title="Novos este Mês"
          value={newLeadsThisMonth}
          icon={UserPlus}
          iconColor="text-success"
        />
        <MetricCard
          title="Taxa de Conversão"
          value={`${conversionRate}%`}
          icon={Target}
          iconColor="text-accent"
        />
        <MetricCard
          title="Receita do Mês"
          value={formatCurrency(revenueThisMonth)}
          icon={DollarSign}
          iconColor="text-warning"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <FunnelChart leads={leads} />
        <div className="grid grid-cols-2 gap-6">
          <MetricCard
            title="Leads Ativos"
            value={leads.filter(l => !['won', 'lost'].includes(l.stage)).length}
            icon={Clock}
            iconColor="text-primary"
          />
          <MetricCard
            title="Receita Total"
            value={formatCurrency(totalRevenue)}
            icon={TrendingUp}
            iconColor="text-success"
          />
        </div>
      </div>

      {/* Lists Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentLeads leads={leads.slice(0, 5)} />
        <ActivityFeed activities={activities.slice(0, 5)} />
      </div>
    </MainLayout>
  );
}
