import { useEffect, useState } from 'react';
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
  MessageCircle,
  Building2,
  KeyRound,
  CalendarCheck,
  TrendingUp,
  Monitor,
} from 'lucide-react';
import { TrocarSenhaDialog } from '@/components/auth/TrocarSenhaDialog';
import { rotuloDeLogin } from '@/lib/usuario';
import { toast } from 'sonner';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import {
  trocarEmpresa, useConversas, useConversasTempoReal, useMinhasEmpresas, useModulosAtivos,
} from '@/hooks/useAtendimento';
import { useMarca } from '@/hooks/useMarca';
import { aplicarMarcaDaEmpresa } from '@/lib/marca';
import { useMenu, useVocabulario } from '@/hooks/useEmpresa';

const menuItems = [
  // Atendimento e Agenda juntos no alto: só aparecem para quem tem o módulo.
  { icon: MessageCircle, label: 'Atendimento', path: '/atendimento', modulo: 'atendimento' },
  { icon: CalendarCheck, label: 'Agenda', path: '/agenda', modulo: 'atendimento' },
  { icon: Monitor, label: 'Painel da recepção', path: '/painel', modulo: 'atendimento' },
  { icon: TrendingUp, label: 'Resultados', path: '/resultados' },
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
  const { data: modulos } = useModulosAtivos();
  const temAtendimento = !!modulos?.has('atendimento');
  useConversasTempoReal(temAtendimento);
  const { data: conversas = [] } = useConversas(temAtendimento);
  const esperando = conversas.filter((c) => c.status === 'aberta' && c.unread_count > 0).length;
  const { data: empresas = [] } = useMinhasEmpresas();
  const empresaAtual = empresas.find((e) => e.atual);
  const { marca } = useMarca();
  const [trocarSenha, setTrocarSenha] = useState(false);
  const v = useVocabulario();
  const menu = useMenu();
  const itens = menuItems
    .filter((item) => (!item.modulo || modulos?.has(item.modulo)) && menu.permitido(item.path))
    .sort((a, b) => Number(b.path === menu.primeiro) - Number(a.path === menu.primeiro));

  const trocar = async (tenantId: string) => {
    if (tenantId === empresaAtual?.tenant_id) return;
    const erro = await trocarEmpresa(tenantId);
    if (erro) {
      toast.error(erro);
      return;
    }
    // Recarrega tudo: cache, tema e módulos são da empresa.
    window.location.href = '/';
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  const logoUrl = tenant?.system_logo_url || tenant?.logo_url;

  // Depois do login manda a cara da empresa de quem entrou.
  useEffect(() => {
    if (tenant) aplicarMarcaDaEmpresa(tenant);
  }, [tenant]);

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar flex flex-col z-50">
      {/* Logo: o da empresa sozinho, porque já traz o nome; sem logo, o nome */}
      <div className="px-6 py-5 border-b border-sidebar-border">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={tenant?.name || 'Logo'}
            className="h-14 w-auto max-w-[200px] object-contain"
          />
        ) : (
          <h1 className="text-xl font-bold text-sidebar-foreground">
            <span className="text-sidebar-primary">CRM</span> {tenant?.name || 'Dom Intelligence'}
          </h1>
        )}
      </div>

      {/* Troca de empresa: só para quem tem papel em mais de uma, e nunca no
          endereço de uma empresa, que já prende a pessoa nela */}
      {empresas.length > 1 && !marca && (
        <div className="px-4 pt-4">
          <Select value={empresaAtual?.tenant_id} onValueChange={trocar}>
            <SelectTrigger className="h-9 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm">
              <Building2 className="w-4 h-4 mr-2 shrink-0 opacity-70" />
              <SelectValue placeholder="Empresa" />
            </SelectTrigger>
            <SelectContent>
              {empresas.map((e) => (
                <SelectItem key={e.tenant_id} value={e.tenant_id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {itens.map(item => {
          const isActive = location.pathname === item.path;
          const contador = item.path === '/atendimento' ? esperando : 0;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`sidebar-item ${isActive ? 'sidebar-item-active' : ''}`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.path === '/leads' ? v.Leads : item.path === '/funnel' ? v.funil : item.label}</span>
              {contador > 0 && (
                <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-[11px] font-semibold flex items-center justify-center">
                  {contador}
                </span>
              )}
            </Link>
          );
        })}

        {/* P.I.A. — só aparece se tenant tiver pia_ativo = true */}
        {(tenant as any)?.pia_ativo && menu.permitido('/pia') && (
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

      {/* User Profile: nome com a largura toda; trocar senha e sair na linha de baixo. */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-10 h-10 shrink-0 rounded-full bg-sidebar-accent flex items-center justify-center">
            <UserCircle className="w-6 h-6 text-sidebar-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground leading-snug break-words">
              {user?.user_metadata?.name || 'Usuário'}
            </p>
            <p className="text-xs text-sidebar-foreground/60 break-all">
              {rotuloDeLogin(user?.email)}
            </p>
          </div>
        </div>
        <div className="flex gap-1 px-1">
          <button
            onClick={() => setTrocarSenha(true)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent transition-colors"
            title="Trocar minha senha"
          >
            <KeyRound className="w-3.5 h-3.5" />
            Trocar senha
          </button>
          <button
            onClick={handleLogout}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent transition-colors"
            title="Sair"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      </div>
      <TrocarSenhaDialog open={trocarSenha} onOpenChange={setTrocarSenha} />
    </aside>
  );
}
