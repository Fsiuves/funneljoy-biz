import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { useLeads } from '@/hooks/useLeads';
import { Calendar, Clock, Phone, Mail, CheckCircle, Loader2 } from 'lucide-react';
import { format, isToday, isTomorrow, isPast, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Lead } from '@/types/crm';

export default function FollowUps() {
  const { data: leads = [], isLoading } = useLeads();
  const leadsWithFollowUp = leads.filter(lead => lead.nextFollowUp);

  const categorizeFollowUps = () => {
    const today: Lead[] = [];
    const tomorrow: Lead[] = [];
    const thisWeek: Lead[] = [];
    const overdue: Lead[] = [];

    leadsWithFollowUp.forEach(lead => {
      if (!lead.nextFollowUp) return;
      
      if (isPast(lead.nextFollowUp) && !isToday(lead.nextFollowUp)) {
        overdue.push(lead);
      } else if (isToday(lead.nextFollowUp)) {
        today.push(lead);
      } else if (isTomorrow(lead.nextFollowUp)) {
        tomorrow.push(lead);
      } else if (lead.nextFollowUp <= addDays(new Date(), 7)) {
        thisWeek.push(lead);
      }
    });

    return { today, tomorrow, thisWeek, overdue };
  };

  const { today, tomorrow, thisWeek, overdue } = categorizeFollowUps();

  const FollowUpCard = ({ lead, isOverdue = false }: { lead: Lead, isOverdue?: boolean }) => (
    <div className={`bg-card rounded-xl p-5 shadow-card hover:shadow-card-hover transition-all duration-300 ${isOverdue ? 'border-l-4 border-destructive' : ''}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-semibold text-primary">
              {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </span>
          </div>
          <div>
            <p className="font-semibold text-foreground">{lead.name}</p>
            <p className="text-sm text-muted-foreground">{lead.company}</p>
          </div>
        </div>
        {isOverdue && (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-destructive/10 text-destructive">
            Atrasado
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-4 mb-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4" />
          {lead.nextFollowUp && format(lead.nextFollowUp, "dd/MM/yyyy", { locale: ptBR })}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="w-4 h-4" />
          {lead.nextFollowUp && format(lead.nextFollowUp, "HH:mm", { locale: ptBR })}
        </span>
      </div>

      <div className="flex gap-2">
        <button className="flex-1 btn-primary text-sm py-2">
          <Phone className="w-4 h-4" />
          Ligar
        </button>
        <button className="flex-1 btn-secondary text-sm py-2">
          <Mail className="w-4 h-4" />
          E-mail
        </button>
        <button className="p-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors">
          <CheckCircle className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  const Section = ({ title, leads: sectionLeads, isOverdue = false }: { title: string, leads: Lead[], isOverdue?: boolean }) => (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        {title}
        <span className="text-sm font-normal px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          {sectionLeads.length}
        </span>
      </h2>
      {sectionLeads.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sectionLeads.map((lead, index) => (
            <div key={lead.id} className="animate-slide-up" style={{ animationDelay: `${index * 0.1}s` }}>
              <FollowUpCard lead={lead} isOverdue={isOverdue} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-center py-8 bg-muted/30 rounded-xl">
          Nenhum follow-up agendado
        </p>
      )}
    </div>
  );

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
        title="Follow-ups" 
        subtitle="Gerencie seus retornos e lembretes"
      />

      {overdue.length > 0 && (
        <Section title="Atrasados" leads={overdue} isOverdue />
      )}
      <Section title="Hoje" leads={today} />
      <Section title="Amanhã" leads={tomorrow} />
      <Section title="Esta Semana" leads={thisWeek} />
    </MainLayout>
  );
}
