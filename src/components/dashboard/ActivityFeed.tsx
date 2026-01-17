import { Activity } from '@/types/crm';
import { Phone, MessageCircle, Mail, FileText, StickyNote } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ActivityFeedProps {
  activities: Activity[];
}

const activityIcons = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: FileText,
  note: StickyNote,
};

const activityColors = {
  call: 'bg-success/10 text-success',
  whatsapp: 'bg-[#25D366]/10 text-[#25D366]',
  email: 'bg-primary/10 text-primary',
  meeting: 'bg-warning/10 text-warning',
  note: 'bg-muted text-muted-foreground',
};

export function ActivityFeed({ activities }: ActivityFeedProps) {
  const recentActivities = [...activities]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);

  return (
    <div className="bg-card rounded-xl p-6 shadow-card animate-fade-in">
      <h3 className="text-lg font-semibold text-foreground mb-6">Atividades Recentes</h3>
      <div className="space-y-4">
        {recentActivities.map((activity, index) => {
          const Icon = activityIcons[activity.type];
          const colorClass = activityColors[activity.type];
          return (
            <div
              key={activity.id}
              className="flex gap-4 animate-slide-up"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{activity.description}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {activity.createdBy} • {formatDistanceToNow(activity.createdAt, { addSuffix: true, locale: ptBR })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
