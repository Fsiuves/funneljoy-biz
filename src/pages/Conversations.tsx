import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { mockActivities, mockLeads } from '@/data/mockData';
import { Phone, MessageCircle, Mail, FileText, StickyNote, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
  const getLeadById = (leadId: string) => {
    return mockLeads.find(lead => lead.id === leadId);
  };

  const sortedActivities = [...mockActivities].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  return (
    <MainLayout>
      <Header 
        title="Atendimentos" 
        subtitle="Histórico de todas as interações"
      />

      {/* Filter Buttons */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button className="btn-primary text-sm">Todos</button>
        {Object.entries(activityLabels).map(([key, label]) => {
          const Icon = activityIcons[key as keyof typeof activityIcons];
          return (
            <button key={key} className="btn-secondary text-sm whitespace-nowrap">
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Activity Timeline */}
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
    </MainLayout>
  );
}
