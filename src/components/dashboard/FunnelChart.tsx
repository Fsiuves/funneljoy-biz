import { Lead } from '@/types/crm';
import { useEtapas, useVocabulario } from '@/hooks/useEmpresa';

interface FunnelChartProps {
  leads: Lead[];
}

export function FunnelChart({ leads }: FunnelChartProps) {
  const { etapas } = useEtapas();
  const v = useVocabulario();
  const stageCounts = etapas.map(stage => ({
    ...stage,
    count: leads.filter(lead => lead.stage === stage.value).length,
  }));

  const maxCount = Math.max(...stageCounts.map(s => s.count), 1);

  return (
    <div className="bg-card rounded-xl p-6 shadow-card animate-fade-in">
      <h3 className="text-lg font-semibold text-foreground mb-6">{v.funil}</h3>
      <div className="space-y-4">
        {stageCounts.map((stage, index) => {
          const width = (stage.count / maxCount) * 100;
          return (
            <div key={stage.value} className="animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">{stage.label}</span>
                <span className="text-sm text-muted-foreground">
                  {stage.count} {stage.count === 1 ? v.lead : v.leads}
                </span>
              </div>
              <div className="h-8 bg-muted rounded-lg overflow-hidden">
                <div
                  className="h-full rounded-lg transition-all duration-500"
                  style={{ width: `${width}%`, backgroundColor: stage.cor }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
