import { Bell, Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onAddClick?: () => void;
  addButtonLabel?: string;
  action?: React.ReactNode;
}

export function Header({ title, subtitle, onAddClick, addButtonLabel, action }: HeaderProps) {
  return (
    <header className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && (
          <p className="text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar..."
            className="input-field pl-10 w-64"
          />
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-secondary transition-colors">
          <Bell className="w-5 h-5 text-muted-foreground" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
        </button>

        {/* Custom Action */}
        {action}

        {/* Add Button */}
        {onAddClick && (
          <Button onClick={onAddClick} className="btn-primary">
            <Plus className="w-4 h-4" />
            {addButtonLabel || 'Adicionar'}
          </Button>
        )}
      </div>
    </header>
  );
}
