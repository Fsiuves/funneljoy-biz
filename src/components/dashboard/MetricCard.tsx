import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    isPositive: boolean;
  };
  icon: LucideIcon;
  iconColor?: string;
}

export function MetricCard({ title, value, change, icon: Icon, iconColor = 'text-primary' }: MetricCardProps) {
  return (
    <div className="metric-card animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground mt-2">{value}</p>
          {change && (
            <p className={`text-sm mt-2 flex items-center gap-1 ${
              change.isPositive ? 'text-success' : 'text-destructive'
            }`}>
              <span>{change.isPositive ? '↑' : '↓'}</span>
              <span>{Math.abs(change.value)}% vs mês anterior</span>
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl bg-primary/10 ${iconColor}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
