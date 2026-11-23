import { useState } from 'react';
import { formatarTelefone, iniciais } from '@/components/atendimento/PainelConversa';
import { Lead, LEAD_SOURCES } from '@/types/crm';
import { useConfig, useEtapas } from '@/hooks/useEmpresa';
import { Phone, Mail, Building2, Calendar, CalendarPlus } from 'lucide-react';
import { differenceInCalendarDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScheduleFollowUpModal } from '@/components/activities/ScheduleFollowUpModal';
import { usePassosFeitos } from '@/hooks/useLeadSteps';

interface LeadCardProps {
  lead: Lead;
  onClick?: () => void;
}

const TOTAL_STEPS = 7;

export function LeadCard({ lead, onClick }: LeadCardProps) {
  const mostrarSequencia = useConfig().config.funil?.sequencia !== false;
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const { data: feitos } = usePassosFeitos(mostrarSequencia);

  const { estaAberta } = useEtapas();

  const doneCount = feitos?.get(lead.id) ?? 0;
  // "Esfriando" (pedido de 21/11/2026): o banco não guarda quando o paciente mudou
  // de etapa, então vale a última alteração do cadastro. Só nas etapas em aberto.
  const diasParado = differenceInCalendarDays(new Date(), lead.updatedAt);
  const corParado = diasParado >= 15 ? 'text-destructive font-medium' : diasParado >= 7 ? 'text-warning font-medium' : 'text-muted-foreground';
  const followUpAtrasado = !!lead.nextFollowUp && lead.nextFollowUp.getTime() < Date.now();
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
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">{iniciais(lead.name)}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                {lead.name}
              </p>
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <Phone className="w-3 h-3 shrink-0" />
                {/* Sem o +55 no cartão, para a unidade caber na linha. */}
                {formatarTelefone(lead.phone).replace(/^\+55 /, '')}{lead.unidade ? ` · ${lead.unidade}` : ''}
              </p>
            </div>
          </div>

          {/* Schedule Follow-up Button */}
          <button
            onClick={handleScheduleClick}
            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
            title="Agendar follow-up"
          >
            <CalendarPlus className="w-4 h-4" />
          </button>
        </div>

        {/* Empresa e e-mail só quando existem: a linha vazia ocupava o cartão. */}
        {(lead.company || lead.email) && (
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {lead.company && (
              <p className="flex items-center gap-1.5 truncate"><Building2 className="w-3 h-3 shrink-0" />{lead.company}</p>
            )}
            {lead.email && (
              <p className="flex items-center gap-1.5 truncate"><Mail className="w-3 h-3 shrink-0" />{lead.email}</p>
            )}
          </div>
        )}

        {/* Progresso da sequência de contato (a Dom usa; a clínica desligou) */}
        <div className={mostrarSequencia ? 'mt-3' : 'hidden'}>
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

        {lead.nextFollowUp && (
          <button
            onClick={handleScheduleClick}
            className={`flex items-center gap-1.5 mt-2.5 text-xs transition-colors ${
              followUpAtrasado ? 'text-destructive font-medium hover:text-destructive/80' : 'text-warning hover:text-warning/80'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>
              {followUpAtrasado ? 'Follow-up atrasado: ' : 'Follow-up: '}
              {format(lead.nextFollowUp, "dd/MM 'às' HH:mm", { locale: ptBR })}
            </span>
          </button>
        )}

        <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-border">
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground truncate">
            {getSourceLabel(lead.source)}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {lead.value && (
              <span className="text-xs font-semibold text-success">
                {formatCurrency(lead.value)}
              </span>
            )}
            {estaAberta(lead.stage) && (
              <span
                className={`text-[11px] ${corParado}`}
                title={`Última alteração no cadastro: ${format(lead.updatedAt, 'dd/MM/yyyy', { locale: ptBR })}`}
              >
                {diasParado <= 0 ? 'mudou hoje' : `${diasParado} d sem mudança`}
              </span>
            )}
          </div>
        </div>

        {lead.tags && lead.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5">
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
