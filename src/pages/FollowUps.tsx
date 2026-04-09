import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLeads, useUpdateLead } from '@/hooks/useLeads';
import { useActivities, useCreateActivity } from '@/hooks/useActivities';
import { Calendar, Clock, Phone, Mail, CheckCircle, Loader2, Plus, MessageCircle, FileText, StickyNote, Search } from 'lucide-react';
import { format, isToday, isTomorrow, isPast, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Lead, ActivityType } from '@/types/crm';
import { AddActivityModal } from '@/components/activities/AddActivityModal';
import { toast } from '@/hooks/use-toast';

const activityIcons = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: FileText,
  note: StickyNote,
};

const activityColors = {
  call: 'bg-success/10 text-success border-success/20',
  whatsapp: 'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/20',
  email: 'bg-primary/10 text-primary border-primary/20',
  meeting: 'bg-warning/10 text-warning border-warning/20',
  note: 'bg-muted text-muted-foreground border-muted-foreground/20',
};

const activityLabels = {
  call: 'Ligação',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  meeting: 'Reunião',
  note: 'Anotação',
};

export default function FollowUps() {
  const { data: leads = [], isLoading: leadsLoading } = useLeads();
  const { data: activities = [], isLoading: activitiesLoading } = useActivities();
  const updateLead = useUpdateLead();
  const createActivity = useCreateActivity();
  const leadsWithFollowUp = leads.filter(lead => lead.nextFollowUp);

  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | undefined>();
  const [selectedActivityType, setSelectedActivityType] = useState<ActivityType>('call');
  const [historyFilter, setHistoryFilter] = useState<ActivityType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const categorizeFollowUps = () => {
    const today: Lead[] = [];
    const tomorrow: Lead[] = [];
    const thisWeek: Lead[] = [];
    const upcoming: Lead[] = [];
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
      } else {
        upcoming.push(lead);
      }
    });

    // Sort upcoming by date
    upcoming.sort((a, b) => {
      if (!a.nextFollowUp || !b.nextFollowUp) return 0;
      return a.nextFollowUp.getTime() - b.nextFollowUp.getTime();
    });

    return { today, tomorrow, thisWeek, upcoming, overdue };
  };

  const { today, tomorrow, thisWeek, upcoming, overdue } = categorizeFollowUps();

  const getLeadById = (leadId: string) => {
    return leads.find(lead => lead.id === leadId);
  };

  const filteredActivities = activities.filter(activity => {
    // Filter by type
    if (historyFilter !== 'all' && activity.type !== historyFilter) return false;
    
    // Filter by search query
    if (searchQuery.trim()) {
      const lead = getLeadById(activity.leadId);
      const searchLower = searchQuery.toLowerCase();
      const matchesDescription = activity.description.toLowerCase().includes(searchLower);
      const matchesLeadName = lead?.name.toLowerCase().includes(searchLower);
      const matchesCompany = lead?.company?.toLowerCase().includes(searchLower);
      
      if (!matchesDescription && !matchesLeadName && !matchesCompany) return false;
    }
    
    return true;
  });

  const sortedActivities = [...filteredActivities].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  const handleOpenActivityModal = (lead?: Lead, type?: ActivityType) => {
    setSelectedLead(lead);
    setSelectedActivityType(type || 'call');
    setActivityModalOpen(true);
  };

  const handleMarkComplete = async (lead: Lead) => {
    // Validate: cannot complete a follow-up scheduled for a future date
    if (lead.nextFollowUp && !isToday(lead.nextFollowUp) && !isPast(lead.nextFollowUp)) {
      toast({ 
        title: 'Não é possível concluir', 
        description: `Este follow-up está agendado para ${format(lead.nextFollowUp, "dd/MM/yyyy", { locale: ptBR })}. Aguarde a data ou reagende.`,
        variant: 'destructive'
      });
      return;
    }

    try {
      // Register activity in history
      const followUpDate = lead.nextFollowUp 
        ? format(lead.nextFollowUp, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
        : '';
      await createActivity.mutateAsync({
        leadId: lead.id,
        type: 'note',
        description: `Follow-up concluído${followUpDate ? ` (agendado para ${followUpDate})` : ''}`,
      });
      
      // Clear the follow-up
      await updateLead.mutateAsync({ id: lead.id, nextFollowUp: null });
      toast({ title: 'Follow-up concluído!', description: `Retorno de ${lead.name} marcado como realizado.` });
    } catch (error) {
      // Error handled by mutation hook
    }
  };

  const isFutureFollowUp = (lead: Lead) => {
    return lead.nextFollowUp && !isToday(lead.nextFollowUp) && !isPast(lead.nextFollowUp);
  };

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
        <div className="flex flex-col items-end gap-1">
          {isOverdue && (
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-destructive/10 text-destructive">
              Atrasado
            </span>
          )}
          {(lead.assignedToName || lead.createdByName) && (
            <span className="text-xs text-muted-foreground">
              {lead.assignedToName || lead.createdByName}
            </span>
          )}
        </div>
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
        <button 
          className="flex-1 btn-primary text-sm py-2"
          onClick={() => handleOpenActivityModal(lead, 'call')}
        >
          <Phone className="w-4 h-4" />
          Ligar
        </button>
        <button 
          className="flex-1 btn-secondary text-sm py-2"
          onClick={() => handleOpenActivityModal(lead, 'email')}
        >
          <Mail className="w-4 h-4" />
          E-mail
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button 
              className={`p-2 rounded-lg transition-colors ${
                isFutureFollowUp(lead) 
                  ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                  : 'bg-success/10 text-success hover:bg-success/20'
              }`}
              onClick={() => handleMarkComplete(lead)}
              disabled={updateLead.isPending || createActivity.isPending}
            >
              {(updateLead.isPending || createActivity.isPending) ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <CheckCircle className="w-5 h-5" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isFutureFollowUp(lead) ? 'Aguarde a data do follow-up' : 'Concluir follow-up'}</p>
          </TooltipContent>
        </Tooltip>
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
        title="Follow-Up" 
        subtitle="Gerencie seus retornos e histórico de atividades"
        action={
          <Button onClick={() => handleOpenActivityModal()}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Atividade
          </Button>
        }
      />

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {overdue.length > 0 && (
            <Section title="Atrasados" leads={overdue} isOverdue />
          )}
          <Section title="Hoje" leads={today} />
          <Section title="Amanhã" leads={tomorrow} />
          <Section title="Esta Semana" leads={thisWeek} />
          {upcoming.length > 0 && (
            <Section title="Próximas Semanas" leads={upcoming} />
          )}
        </TabsContent>

        <TabsContent value="history">
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por lead, empresa ou descrição..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-10 w-full"
              />
            </div>
          </div>
          
          {/* Filter Buttons */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            <button 
              onClick={() => setHistoryFilter('all')}
              className={historyFilter === 'all' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
            >
              Todos
            </button>
            {(Object.entries(activityLabels) as [ActivityType, string][]).map(([key, label]) => {
              const Icon = activityIcons[key];
              return (
                <button 
                  key={key} 
                  onClick={() => setHistoryFilter(key)}
                  className={`${historyFilter === key ? 'btn-primary' : 'btn-secondary'} text-sm whitespace-nowrap`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Activity Timeline */}
          {sortedActivities.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-xl">
              <p className="text-muted-foreground mb-4">Nenhuma atividade registrada ainda.</p>
              <Button onClick={() => handleOpenActivityModal()}>
                <Plus className="w-4 h-4 mr-2" />
                Registrar primeira atividade
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedActivities.map((activity, index) => {
                const Icon = activityIcons[activity.type];
                const colorClass = activityColors[activity.type];
                const lead = getLeadById(activity.leadId);

                return (
                  <div
                    key={activity.id}
                    className="bg-card rounded-xl p-6 shadow-card hover:shadow-card-hover transition-all duration-300 animate-slide-up"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="flex gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${colorClass}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full mb-2 ${colorClass}`}>
                              {activityLabels[activity.type]}
                            </span>
                            <p className="text-foreground">{activity.description}</p>
                          </div>
                          <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {format(activity.createdAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        
                        {lead && (
                          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-xs font-semibold text-primary">
                                  {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{lead.name}</p>
                                <p className="text-xs text-muted-foreground">{lead.company}</p>
                              </div>
                            </div>
                            {lead.nextFollowUp && (
                              <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 px-2 py-1 rounded-full">
                                <Calendar className="w-3 h-3" />
                                <span>Próximo: {format(lead.nextFollowUp, "dd/MM/yyyy", { locale: ptBR })}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AddActivityModal
        open={activityModalOpen}
        onOpenChange={setActivityModalOpen}
        preSelectedLead={selectedLead}
        preSelectedType={selectedActivityType}
      />
    </MainLayout>
  );
}
