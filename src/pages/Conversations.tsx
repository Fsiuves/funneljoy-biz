import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { useActivities } from '@/hooks/useActivities';
import { useLeads } from '@/hooks/useLeads';
import { ActivityType } from '@/types/crm';
import { Phone, MessageCircle, Mail, FileText, StickyNote, User, Loader2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AddActivityModal } from '@/components/activities/AddActivityModal';

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

export default function Conversations() {
  const [filter, setFilter] = useState<ActivityType | 'all'>('all');
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const { data: activities = [], isLoading: activitiesLoading } = useActivities();
  const { data: leads = [], isLoading: leadsLoading } = useLeads();

  const getLeadById = (leadId: string) => {
    return leads.find(lead => lead.id === leadId);
  };

  const filteredActivities = filter === 'all' 
    ? activities 
    : activities.filter(a => a.type === filter);

  const sortedActivities = [...filteredActivities].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  const isLoading = activitiesLoading || leadsLoading;

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
        title="Atendimentos" 
        subtitle="Histórico de todas as interações"
        action={
          <Button onClick={() => setActivityModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Atividade
          </Button>
        }
      />

      {/* Filter Buttons */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button 
          onClick={() => setFilter('all')}
          className={filter === 'all' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
        >
          Todos
        </button>
        {(Object.entries(activityLabels) as [ActivityType, string][]).map(([key, label]) => {
          const Icon = activityIcons[key];
          return (
            <button 
              key={key} 
              onClick={() => setFilter(key)}
              className={`${filter === key ? 'btn-primary' : 'btn-secondary'} text-sm whitespace-nowrap`}
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
          <Button onClick={() => setActivityModalOpen(true)}>
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
                      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
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
                    )}

                    <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                      <User className="w-4 h-4" />
                      <span>{activity.createdBy}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddActivityModal
        open={activityModalOpen}
        onOpenChange={setActivityModalOpen}
      />
    </MainLayout>
  );
}
