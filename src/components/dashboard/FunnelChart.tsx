import { Lead, LEAD_STAGES } from '@/types/crm';

interface FunnelChartProps {
  leads: Lead[];
}

export function FunnelChart({ leads }: FunnelChartProps) {
  const stageCounts = LEAD_STAGES.map(stage => ({
    ...stage,
    count: leads.filter(lead => lead.stage === stage.value).length,
  }));

  const maxCount = Math.max(...stageCounts.map(s => s.count), 1);

  return (
    <div className="bg-card rounded-xl p-6 shadow-card animate-fade-in">
      <h3 className="text-lg font-semibold text-foreground mb-6">Funil de Vendas</h3>
      <div className="space-y-4">
        {stageCounts.map((stage, index) => {
          const width = (stage.count / maxCount) * 100;
          return (
            <div key={stage.value} className="animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">{stage.label}</span>
                <span className="text-sm text-muted-foreground">{stage.count} leads</span>
              </div>
              <div className="h-8 bg-muted rounded-lg overflow-hidden">
                <div
                  className={`h-full rounded-lg transition-all duration-500 bg-${stage.color}`}
                  style={{ 
                    width: `${width}%`,
                    backgroundColor: stage.value === 'new' ? 'hsl(var(--stage-new))' :
                                    stage.value === 'negotiation' ? 'hsl(var(--stage-negotiation))' :
                                    stage.value === 'proposal' ? 'hsl(var(--stage-proposal))' :
                                    stage.value === 'won' ? 'hsl(var(--stage-won))' :
                                    'hsl(var(--stage-lost))'
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
