import { Bell, Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onAddClick?: () => void;
  addButtonLabel?: string;
  action?: React.ReactNode;
}

export function Header({ title, subtitle, onAddClick, addButtonLabel, action }: HeaderProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/leads?q=${encodeURIComponent(q)}` : '/leads');
  };

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
        <form onSubmit={handleSearch} className="relative">
          <button type="submit" className="absolute left-3 top-1/2 -translate-y-1/2" aria-label="Buscar">
            <Search className="w-4 h-4 text-muted-foreground" />
          </button>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar lead..."
            className="input-field pl-10 w-64"
          />
        </form>

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
