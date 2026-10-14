import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVocabulario } from '@/hooks/useEmpresa';
import { emailDoUsuario, normalizarUsuario, pareceEmail, rotuloDeLogin, sugerirUsuario, usuarioValido } from '@/lib/usuario';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Users, Plus, AtSign, User, Lock, Building2, KeyRound, UserX, UserCheck, Pencil } from 'lucide-react';
import { toast } from 'sonner';

type Papel = 'admin' | 'manager' | 'atendente' | 'sales';

/** Rótulo e explicação de cada papel, na linguagem de quem usa. */
const PAPEIS: { valor: Papel; rotulo: string; explica: string }[] = [
  { valor: 'admin', rotulo: 'Direção', explica: 'Enxerga todas as unidades e administra a conta' },
  { valor: 'manager', rotulo: 'Gerente', explica: 'Enxerga as unidades dela e cuida das atendentes: cadastra, edita, troca senha e desativa' },
  { valor: 'atendente', rotulo: 'Atendente', explica: 'Enxerga só a unidade dela e não apaga leads' },
  { valor: 'sales', rotulo: 'Vendedor', explica: 'Enxerga só os leads atribuídos a ele' },
];

const SEM_UNIDADE = '__todas__';

interface TeamSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  role?: string | null;
  unidade?: string | null;
  ativo?: boolean | null;
  /** Suporte da Dom dentro da empresa: tem acesso, mas não aparece na equipe. */
  oculto?: boolean;
}

interface Unidade {
  id: string;
  unidade: string;
}

const FORM_VAZIO = { usuario: '', name: '', password: '', role: 'atendente' as Papel, unidade: SEM_UNIDADE };

const ERROS_ACESSO: Record<string, string> = {
  senha_fraca: 'A senha precisa de 8 caracteres, com maiúscula, minúscula e número',
  pessoa_de_outra_empresa: 'Essa pessoa também acessa outra empresa. O acesso dela é cuidado pela Dom Intelligence.',
  so_atendente: 'A gerente cuida só das atendentes',
  outra_unidade: 'Essa atendente é de outra unidade',
  nao_em_si_mesmo: 'Para a sua própria senha, use a chave no rodapé do menu',
  not_authorized: 'Você não tem permissão para isso',
  bloqueio_parcial: 'O acesso aos dados caiu, mas o login não foi bloqueado. Tente de novo.',
  invalid_name: 'O nome precisa de pelo menos 2 letras',
  invalid_role: 'Função inválida',
  unidade_invalida: 'Unidade não encontrada',
  atendente_sem_unidade: 'Atendente precisa de uma unidade',
  usuario_em_uso: 'Esse usuário já existe. Escolha outro.',
  usuario_invalido: 'Usuário inválido: use nome.sobrenome, sem espaço nem acento',
  usuario_fixo: 'Essa pessoa entra por email, e o acesso dela não muda por aqui',
};

/** Quem entra por usuário (nome.sobrenome); o resto entra por email de verdade. */
const entraPorUsuario = (email: string) => !pareceEmail(rotuloDeLogin(email));

/**
 * Perfis, funções e unidades de uma vez. O RLS já devolve só a empresa atual,
 * então não precisa esperar o useTenant: antes eram quatro idas ao banco em fila
 * a cada abertura.
 */
async function buscarEquipe(): Promise<{ membros: TeamMember[]; unidades: Unidade[] }> {
  const db = supabase as any;
  const [perfis, papeis, contas] = await Promise.all([
    db.from('profiles').select('id, email, name, unidade, ativo'),
    db.from('user_roles').select('user_id, role, oculto'),
    db.from('wa_accounts').select('id, unidade').eq('ativo', true).order('unidade'),
  ]);
  const papel = new Map<string, { role: string; oculto: boolean }>((papeis.data ?? []).map((r: any) => [r.user_id, r]));
  const membros = ((perfis.data ?? []) as TeamMember[])
    .map((p) => ({ ...p, role: papel.get(p.id)?.role ?? null, oculto: !!papel.get(p.id)?.oculto }))
    // Quem está com acesso vem primeiro.
    .sort((a, b) => Number(b.ativo !== false) - Number(a.ativo !== false));
  return { membros, unidades: (contas.data ?? []) as Unidade[] };
}

async function codigoDeErro(data: any, error: any): Promise<string | null> {
  if (data?.error) return data.error;
  if (!error) return null;
  return (await error.context?.json?.().catch(() => null))?.error ?? error.message ?? 'falha';
}

export function TeamSettingsModal({ open, onOpenChange }: TeamSettingsModalProps) {
  const { tenant, inviteTeamMember } = useTenant();
  const qc = useQueryClient();
  const { user } = useAuth();
  const v = useVocabulario();
  const [senhaDe, setSenhaDe] = useState<string | null>(null);
  const [novaSenha, setNovaSenha] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMember, setNewMember] = useState(FORM_VAZIO);
  const [saving, setSaving] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [edicao, setEdicao] = useState({ name: '', usuario: '', role: 'atendente' as Papel, unidade: SEM_UNIDADE });

  // Guardada entre uma abertura e outra; reabrir mostra na hora e atualiza por trás.
  const { data: equipe, isLoading: loadingMembers } = useQuery({
    queryKey: ['equipe-cadastro', user?.id],
    queryFn: buscarEquipe,
    enabled: open && !!user,
    staleTime: 30_000,
  });
  const members = equipe?.membros ?? [];
  const unidades = equipe?.unidades ?? [];
  // O suporte oculto fica fora da lista, até para ele mesmo.
  const visiveis = members.filter((m) => !m.oculto);

  const fetchMembers = () => {
    qc.invalidateQueries({ queryKey: ['equipe-cadastro'] });
    qc.invalidateQueries({ queryKey: ['equipe'] });
  };

  // ------------------------------------------------------------ quem sou eu aqui
  const eu = members.find((m) => m.id === user?.id);
  const souDirecao = eu?.role === 'admin';
  const souGerente = eu?.role === 'manager';
  const minhaUnidade = eu?.unidade ?? null;

  // Espelho das regras do servidor (_shared/equipe.ts): esconde o que ele recusaria.
  const podeGerir = (m: TeamMember) =>
    m.id !== user?.id &&
    (souDirecao || (souGerente && m.role === 'atendente' && (!minhaUnidade || m.unidade === minhaUnidade)));

  const papeisPermitidos = souDirecao ? PAPEIS : PAPEIS.filter((p) => p.valor === 'atendente');

  // Atendente sempre tem unidade; gerente de unidade só cadastra na dela.
  const unidadesPermitidas = unidades.filter((u) => !souGerente || !minhaUnidade || u.unidade === minhaUnidade);
  const podeTodas = newMember.role !== 'atendente';

  const abrirCadastro = () => {
    const unica = unidadesPermitidas.length === 1 ? unidadesPermitidas[0].unidade : SEM_UNIDADE;
    setNewMember({ ...FORM_VAZIO, unidade: unica });
    setShowAddForm(!showAddForm);
  };

  const validatePassword = (password: string): { valid: boolean; error: string | null } => {
    if (password.length < 8) return { valid: false, error: 'A senha deve ter pelo menos 8 caracteres' };
    if (!/[A-Z]/.test(password)) return { valid: false, error: 'A senha deve conter pelo menos uma letra maiúscula' };
    if (!/[a-z]/.test(password)) return { valid: false, error: 'A senha deve conter pelo menos uma letra minúscula' };
    if (!/[0-9]/.test(password)) return { valid: false, error: 'A senha deve conter pelo menos um número' };
    return { valid: true, error: null };
  };

  const handleInvite = async () => {
    const usuario = normalizarUsuario(newMember.usuario);
    if (!newMember.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    if (!usuarioValido(usuario)) {
      toast.error('Usuário inválido: use nome.sobrenome, sem espaço nem acento');
      return;
    }
    if (!tenant?.slug) {
      toast.error('Empresa ainda carregando, tente de novo');
      return;
    }
    const passwordValidation = validatePassword(newMember.password);
    if (!passwordValidation.valid) {
      toast.error(passwordValidation.error);
      return;
    }
    if (newMember.role === 'atendente' && newMember.unidade === SEM_UNIDADE) {
      toast.error('Atendente precisa de uma unidade. Sem ela, enxergaria todas.');
      return;
    }

    setSaving(true);
    const { error } = await inviteTeamMember(
      emailDoUsuario(usuario, tenant.slug),
      newMember.name,
      newMember.password,
      newMember.role,
      newMember.unidade === SEM_UNIDADE ? null : newMember.unidade,
    );

    if (error) {
      toast.error(error);
    } else {
      toast.success(`Pronto. Acesso: ${usuario} e a senha provisória. No primeiro acesso a pessoa cria a dela.`, { duration: 8000 });
      setNewMember(FORM_VAZIO);
      setShowAddForm(false);
      fetchMembers();
    }
    setSaving(false);
  };

  const trocarSenha = async (m: TeamMember) => {
    const validacao = validatePassword(novaSenha);
    if (!validacao.valid) {
      toast.error(validacao.error);
      return;
    }
    setOcupado(m.id);
    const { data, error } = await supabase.functions.invoke('redefinir-senha', {
      body: { user_id: m.id, password: novaSenha },
    });
    const codigo = await codigoDeErro(data, error);
    setOcupado(null);
    if (codigo) {
      toast.error(ERROS_ACESSO[codigo] ?? 'Não foi possível trocar a senha');
      return;
    }
    toast.success(`Senha trocada. Passe a senha nova para ${m.name || 'a pessoa'}.`);
    setSenhaDe(null);
    setNovaSenha('');
  };

  const mudarAcesso = async (m: TeamMember, ativo: boolean) => {
    const nome = m.name || rotuloDeLogin(m.email);
    if (!ativo && !confirm(`Desativar o acesso de ${nome}? Ela deixa de entrar na hora, e as conversas dela voltam para "Sem responsável".`)) return;
    setOcupado(m.id);
    const { data, error } = await supabase.functions.invoke('acesso-equipe', {
      body: { user_id: m.id, ativo },
    });
    const codigo = await codigoDeErro(data, error);
    setOcupado(null);
    if (codigo) {
      toast.error(ERROS_ACESSO[codigo] ?? 'Não foi possível mudar o acesso');
      return;
    }
    const liberadas = data?.conversas_liberadas ?? 0;
    toast.success(
      ativo
        ? `${nome} voltou a ter acesso`
        : `Acesso de ${nome} desativado${liberadas ? `. ${liberadas} conversa${liberadas > 1 ? 's voltaram' : ' voltou'} para "Sem responsável"` : ''}`,
    );
    fetchMembers();
  };

  // ------------------------------------------------------------ editar
  const abrirEdicao = (m: TeamMember) => {
    setSenhaDe(null);
    if (editando === m.id) {
      setEditando(null);
      return;
    }
    setEditando(m.id);
    setEdicao({
      name: m.name ?? '',
      usuario: entraPorUsuario(m.email) ? rotuloDeLogin(m.email) : '',
      role: (PAPEIS.find((p) => p.valor === m.role)?.valor ?? 'atendente') as Papel,
      unidade: m.unidade ?? SEM_UNIDADE,
    });
  };

  const salvarEdicao = async (m: TeamMember) => {
    const nome = edicao.name.trim();
    if (nome.length < 2) {
      toast.error(ERROS_ACESSO.invalid_name);
      return;
    }
    // Quem entra por email de verdade continua com ele: só o usuário interno muda.
    let email: string | null = null;
    const usuario = normalizarUsuario(edicao.usuario);
    if (entraPorUsuario(m.email)) {
      if (!usuarioValido(usuario)) {
        toast.error(ERROS_ACESSO.usuario_invalido);
        return;
      }
      if (!tenant?.slug) {
        toast.error('Empresa ainda carregando, tente de novo');
        return;
      }
      email = emailDoUsuario(usuario, tenant.slug);
    }
    if (edicao.role === 'atendente' && edicao.unidade === SEM_UNIDADE) {
      toast.error('Atendente precisa de uma unidade. Sem ela, enxergaria todas.');
      return;
    }

    setOcupado(m.id);
    const { data, error } = await supabase.functions.invoke('editar-equipe', {
      body: {
        user_id: m.id,
        name: nome,
        email,
        role: edicao.role,
        unidade: edicao.unidade === SEM_UNIDADE ? null : edicao.unidade,
      },
    });
    const codigo = await codigoDeErro(data, error);
    setOcupado(null);
    if (codigo) {
      toast.error(ERROS_ACESSO[codigo] ?? 'Não foi possível salvar');
      return;
    }
    const liberadas = data?.conversas_liberadas ?? 0;
    toast.success(
      [
        'Alterações salvas',
        data?.usuario_mudou ? `O acesso agora é ${usuario}` : '',
        liberadas ? `${liberadas} conversa${liberadas > 1 ? 's voltaram' : ' voltou'} para "Sem responsável"` : '',
      ].filter(Boolean).join('. '),
      { duration: data?.usuario_mudou ? 8000 : 4000 },
    );
    setEditando(null);
    fetchMembers();
  };

  const podeTodasNaEdicao = edicao.role !== 'atendente';

  const rotuloPapel = (r?: string | null) =>
    PAPEIS.find((p) => p.valor === r)?.rotulo ?? 'Sem função';

  const papelSelecionado = PAPEIS.find((p) => p.valor === newMember.role);
  const podeCadastrar = souDirecao || souGerente;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-none sm:max-w-none h-[calc(100vh-2rem)] content-start overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Equipe
          </DialogTitle>
          <DialogDescription>Quem acessa o painel, com qual função e de qual unidade</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">
                {loadingMembers ? 'Carregando...' : `${visiveis.length} ${visiveis.length === 1 ? 'pessoa' : 'pessoas'}`}
              </Label>
              {podeCadastrar && (
                <Button variant="outline" size="sm" onClick={abrirCadastro}>
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar
                </Button>
              )}
            </div>

            {loadingMembers ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visiveis.map((member) => {
                  const desativado = member.ativo === false;
                  return (
                    <div
                      key={member.id}
                      className={`rounded-lg border bg-card ${desativado ? 'opacity-60' : ''} ${
                        editando === member.id || senhaDe === member.id ? 'md:col-span-2 xl:col-span-3' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 p-3">
                        <div className="w-9 h-9 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{member.name || 'Sem nome'}</p>
                          <p className="text-xs text-muted-foreground truncate">{rotuloDeLogin(member.email)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {desativado ? (
                            <Badge variant="outline" className="text-xs">Acesso desativado</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">{rotuloPapel(member.role)}</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {member.unidade || 'Todas as unidades'}
                          </span>
                        </div>
                        {podeGerir(member) && (
                          <div className="flex shrink-0">
                            {!desativado && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                title="Editar"
                                onClick={() => abrirEdicao(member)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                            {!desativado && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                title="Nova senha provisória"
                                onClick={() => {
                                  setEditando(null);
                                  setSenhaDe(senhaDe === member.id ? null : member.id);
                                  setNovaSenha('');
                                }}
                              >
                                <KeyRound className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 ${desativado ? 'text-muted-foreground' : 'text-destructive'}`}
                              title={desativado ? 'Reativar acesso' : 'Desativar acesso'}
                              disabled={ocupado === member.id}
                              onClick={() => mudarAcesso(member, desativado)}
                            >
                              {ocupado === member.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : desativado ? (
                                <UserCheck className="w-4 h-4" />
                              ) : (
                                <UserX className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                      {senhaDe === member.id && (
                        <div className="flex gap-2 border-t px-3 py-2.5">
                          <Input
                            type="text"
                            value={novaSenha}
                            onChange={(e) => setNovaSenha(e.target.value)}
                            placeholder="Nova senha provisória"
                            className="h-9"
                            autoFocus
                          />
                          <Button size="sm" onClick={() => trocarSenha(member)} disabled={ocupado === member.id}>
                            {ocupado === member.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                          </Button>
                        </div>
                      )}
                      {editando === member.id && (
                        <div className="space-y-3 border-t px-3 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="editar-nome" className="text-xs">Nome</Label>
                              <Input
                                id="editar-nome"
                                value={edicao.name}
                                onChange={(e) => setEdicao({ ...edicao, name: e.target.value })}
                                className="h-9"
                                autoFocus
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="editar-usuario" className="text-xs">Usuário</Label>
                              {entraPorUsuario(member.email) ? (
                                <Input
                                  id="editar-usuario"
                                  value={edicao.usuario}
                                  onChange={(e) => setEdicao({ ...edicao, usuario: e.target.value })}
                                  autoCapitalize="none"
                                  autoCorrect="off"
                                  spellCheck={false}
                                  className="h-9"
                                />
                              ) : (
                                <p className="h-9 flex items-center text-sm text-muted-foreground truncate" title="Entra por email">
                                  {member.email}
                                </p>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Função</Label>
                              <Select
                                value={edicao.role}
                                disabled={papeisPermitidos.length === 1}
                                onValueChange={(valor) => {
                                  const role = valor as Papel;
                                  const unidade =
                                    role === 'atendente' && edicao.unidade === SEM_UNIDADE && unidadesPermitidas.length === 1
                                      ? unidadesPermitidas[0].unidade
                                      : edicao.unidade;
                                  setEdicao({ ...edicao, role, unidade });
                                }}
                              >
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {papeisPermitidos.map((p) => (
                                    <SelectItem key={p.valor} value={p.valor}>{p.rotulo}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Unidade</Label>
                              <Select
                                value={edicao.unidade === SEM_UNIDADE && !podeTodasNaEdicao ? '' : edicao.unidade}
                                onValueChange={(valor) => setEdicao({ ...edicao, unidade: valor })}
                              >
                                <SelectTrigger className="h-9"><SelectValue placeholder="Escolha" /></SelectTrigger>
                                <SelectContent>
                                  {podeTodasNaEdicao && !(souGerente && minhaUnidade) && (
                                    <SelectItem value={SEM_UNIDADE}>Todas as unidades</SelectItem>
                                  )}
                                  {unidadesPermitidas.map((u) => (
                                    <SelectItem key={u.id} value={u.unidade}>{u.unidade}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          {member.unidade && edicao.unidade !== SEM_UNIDADE && edicao.unidade !== member.unidade && (
                            <p className="text-xs text-muted-foreground">
                              As conversas dela na {member.unidade} voltam para "Sem responsável".
                            </p>
                          )}
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setEditando(null)}>
                              Cancelar
                            </Button>
                            <Button size="sm" onClick={() => salvarEdicao(member)} disabled={ocupado === member.id}>
                              {ocupado === member.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {showAddForm && podeCadastrar && (
            <div className="space-y-4 p-4 rounded-lg border bg-muted/40">
              <h4 className="font-medium text-foreground">Nova pessoa</h4>

              {/* Duas colunas: na janela larga o formulário cabe sem rolar. */}
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-4 items-start">
              <div className="space-y-2">
                <Label htmlFor="member-name">Nome</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="member-name"
                    value={newMember.name}
                    onChange={(e) => {
                      // O usuário acompanha o nome até alguém mexer nele.
                      const name = e.target.value;
                      const sugeridoAntes = sugerirUsuario(newMember.name);
                      const usuario =
                        !newMember.usuario || newMember.usuario === sugeridoAntes ? sugerirUsuario(name) : newMember.usuario;
                      setNewMember({ ...newMember, name, usuario });
                    }}
                    placeholder="Nome de quem vai usar"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="member-usuario">Usuário</Label>
                <div className="relative">
                  <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="member-usuario"
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={newMember.usuario}
                    onChange={(e) => setNewMember({ ...newMember, usuario: e.target.value })}
                    placeholder="nome.sobrenome"
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  É com ele que a pessoa entra, no endereço da empresa. Se houver dois nomes iguais, mude um.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="member-password">Senha provisória</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  {/* À vista, como a de redefinir: é senha para passar adiante, e errar um caractere tranca a pessoa. */}
                  <Input
                    id="member-password"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={newMember.password}
                    onChange={(e) => setNewMember({ ...newMember, password: e.target.value })}
                    placeholder="Mínimo 8 caracteres"
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Mínimo 8 caracteres, com maiúscula, minúscula e número. No primeiro acesso a pessoa cria a dela.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Função</Label>
                  <Select
                    value={newMember.role}
                    disabled={papeisPermitidos.length === 1}
                    onValueChange={(valor) => {
                      const role = valor as Papel;
                      // Atendente não pode ficar em "Todas as unidades".
                      const unidade =
                        role === 'atendente' && newMember.unidade === SEM_UNIDADE && unidadesPermitidas.length === 1
                          ? unidadesPermitidas[0].unidade
                          : newMember.unidade;
                      setNewMember({ ...newMember, role, unidade });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {papeisPermitidos.map((p) => (
                        <SelectItem key={p.valor} value={p.valor}>{p.rotulo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Unidade</Label>
                  <Select
                    value={newMember.unidade === SEM_UNIDADE && !podeTodas ? '' : newMember.unidade}
                    onValueChange={(valor) => setNewMember({ ...newMember, unidade: valor })}
                  >
                    <SelectTrigger>
                      <Building2 className="w-4 h-4 mr-1 text-muted-foreground shrink-0" />
                      <SelectValue placeholder="Escolha" />
                    </SelectTrigger>
                    <SelectContent>
                      {podeTodas && !(souGerente && minhaUnidade) && (
                        <SelectItem value={SEM_UNIDADE}>Todas as unidades</SelectItem>
                      )}
                      {unidadesPermitidas.map((u) => (
                        <SelectItem key={u.id} value={u.unidade}>{u.unidade}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              </div>

              {papelSelecionado && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {papelSelecionado.explica.replace('leads', v.leads)}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowAddForm(false); setNewMember(FORM_VAZIO); }}
                >
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleInvite} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adicionar'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
