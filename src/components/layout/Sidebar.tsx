import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Kanban,
  Calendar,
  BarChart3,
  Settings,
  UserCircle,
  LogOut,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Users, label: 'Leads', path: '/leads' },
  { icon: Kanban, label: 'Funil de Vendas', path: '/funnel' },
  { icon: Calendar, label: 'Follow-Up', path: '/followups' },
  { icon: BarChart3, label: 'Relatórios', path: '/reports' },
  { icon: Settings, label: 'Configurações', path: '/settings' },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { tenant } = useTenant();

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  const logoUrl = tenant?.system_logo_url || tenant?.logo_url;

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar flex flex-col z-50">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        {logoUrl ? (
          <div className="flex items-center gap-3">
            <img
              src={logoUrl}
              alt={tenant?.name || 'Logo'}
              className="h-10 w-auto max-w-[100px] object-contain"
            />
            <span className="text-lg font-bold text-sidebar-foreground">
              <span className="text-sidebar-primary">CRM</span> Dom Intelligence
            </span>
          </div>
        ) : (
          <h1 className="text-xl font-bold text-sidebar-foreground">
            <span className="text-sidebar-primary">CRM</span> {tenant?.name || 'Dom Intelligence'}
          </h1>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {menuItems.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`sidebar-item ${isActive ? 'sidebar-item-active' : ''}`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* P.I.A. — só aparece se tenant tiver pia_ativo = true */}
        {(tenant as any)?.pia_ativo && (
          <Link
            to="/pia"
            className={`sidebar-item mt-2 border border-sidebar-border ${
              location.pathname === '/pia' ? 'sidebar-item-active' : ''
            }`}
          >
            <Zap className="w-5 h-5 text-sidebar-primary" />
            <span className="font-semibold">P.I.A.</span>
            <span className="ml-auto text-xs bg-sidebar-primary/20 text-sidebar-primary px-1.5 py-0.5 rounded font-medium">
              IA
            </span>
          </Link>
        )}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center">
            <UserCircle className="w-6 h-6 text-sidebar-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.user_metadata?.name || 'Usuário'}
            </p>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {user?.email || ''}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors"
            title="Sair"
          >
            <LogOut className="w-4 h-4 text-sidebar-foreground/60" />
          </button>
        </div>
      </div>
    </aside>
  );
}
