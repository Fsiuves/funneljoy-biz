import { Lead, LEAD_STAGES, LEAD_SOURCES } from '@/types/crm';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RecentLeadsProps {
  leads: Lead[];
}

export function RecentLeads({ leads }: RecentLeadsProps) {
  const recentLeads = [...leads]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);

  const getStageLabel = (stage: string) => {
    return LEAD_STAGES.find(s => s.value === stage)?.label || stage;
  };

  const getSourceLabel = (source: string) => {
    return LEAD_SOURCES.find(s => s.value === source)?.label || source;
  };

  const getStageBadgeClass = (stage: string) => {
    switch (stage) {
      case 'new': return 'badge-stage-new';
      case 'negotiation': return 'badge-stage-negotiation';
      case 'proposal': return 'badge-stage-proposal';
      case 'won': return 'badge-stage-won';
      case 'lost': return 'badge-stage-lost';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="bg-card rounded-xl p-6 shadow-card animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Leads Recentes</h3>
        <a href="/leads" className="text-sm text-primary hover:underline">Ver todos</a>
      </div>
      <div className="space-y-4">
        {recentLeads.map((lead, index) => (
          <div
            key={lead.id}
            className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors animate-slide-up"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary">
                {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{lead.name}</p>
              <p className="text-sm text-muted-foreground truncate">{lead.company}</p>
            </div>
            <div className="text-right">
              <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${getStageBadgeClass(lead.stage)}`}>
                {getStageLabel(lead.stage)}
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                {formatDistanceToNow(lead.createdAt, { addSuffix: true, locale: ptBR })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
