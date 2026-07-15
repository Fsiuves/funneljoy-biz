import { useState } from 'react';
import { Lead, LEAD_SOURCES } from '@/types/crm';
import { Phone, Mail, Building2, Calendar, CalendarPlus } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScheduleFollowUpModal } from '@/components/activities/ScheduleFollowUpModal';
import { useLeadSteps } from '@/hooks/useLeadSteps';

interface LeadCardProps {
  lead: Lead;
  onClick?: () => void;
}

const TOTAL_STEPS = 7;

export function LeadCard({ lead, onClick }: LeadCardProps) {
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const { data: steps = [] } = useLeadSteps(lead.id);

  const doneCount = steps.filter(s => s.done).length;
  const progress = Math.round((doneCount / TOTAL_STEPS) * 100);

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

  const handleScheduleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScheduleModalOpen(true);
  };

  return (
    <>
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
          
          {/* Schedule Follow-up Button */}
          <button
            onClick={handleScheduleClick}
            className="p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
            title="Agendar follow-up"
          >
            <CalendarPlus className="w-4 h-4" />
          </button>
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

        {/* Progresso da sequência de contato */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">Sequência de contato</span>
            <span className="text-xs font-semibold text-foreground">{doneCount}/{TOTAL_STEPS}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
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
          <button 
            onClick={handleScheduleClick}
            className="flex items-center gap-1.5 mt-3 text-xs text-warning hover:text-warning/80 transition-colors"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Follow-up: {format(lead.nextFollowUp, "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
          </button>
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

      <ScheduleFollowUpModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
        lead={lead}
      />
    </>
  );
}
