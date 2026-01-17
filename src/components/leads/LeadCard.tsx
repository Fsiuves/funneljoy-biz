import { Lead, LEAD_SOURCES } from '@/types/crm';
import { Phone, Mail, Building2, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface LeadCardProps {
  lead: Lead;
  onClick?: () => void;
}

export function LeadCard({ lead, onClick }: LeadCardProps) {
  const getSourceLabel = (source: string) => {
    return LEAD_SOURCES.find(s => s.value === source)?.label || source;
  };

  const formatCurrency = (value?: number) => {
    if (!value) return null;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div 
      className="kanban-card group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-semibold text-primary">
              {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </span>
          </div>
          <div>
            <p className="font-medium text-foreground group-hover:text-primary transition-colors">
              {lead.name}
            </p>
            {lead.company && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {lead.company}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2 text-sm text-muted-foreground">
        <p className="flex items-center gap-2">
          <Phone className="w-3.5 h-3.5" />
          {lead.phone}
        </p>
        <p className="flex items-center gap-2">
          <Mail className="w-3.5 h-3.5" />
          {lead.email}
        </p>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
        <span className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground">
          {getSourceLabel(lead.source)}
        </span>
        {lead.value && (
          <span className="text-sm font-semibold text-success">
            {formatCurrency(lead.value)}
          </span>
        )}
      </div>

      {lead.nextFollowUp && (
        <div className="flex items-center gap-1.5 mt-3 text-xs text-warning">
          <Calendar className="w-3.5 h-3.5" />
          <span>Follow-up: {format(lead.nextFollowUp, "dd/MM", { locale: ptBR })}</span>
        </div>
      )}

      {lead.tags && lead.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {lead.tags.map(tag => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
