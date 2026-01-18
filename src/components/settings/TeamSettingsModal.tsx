import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTenant } from '@/hooks/useTenant';
import { Loader2, Users, Plus, Mail, User, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface TeamSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TeamMember {
  id: string;
  email: string;
  name: string | null;
}

export function TeamSettingsModal({ open, onOpenChange }: TeamSettingsModalProps) {
  const { getTeamMembers, inviteTeamMember, loading } = useTenant();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMember, setNewMember] = useState({ email: '', name: '', password: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      fetchMembers();
    }
  }, [open]);

  const fetchMembers = async () => {
    setLoadingMembers(true);
    const data = await getTeamMembers();
    setMembers(data);
    setLoadingMembers(false);
  };

  const handleInvite = async () => {
    if (!newMember.email || !newMember.password) {
      toast.error('Email e senha são obrigatórios');
      return;
    }

    if (newMember.password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setSaving(true);
    const { error } = await inviteTeamMember(newMember.email, newMember.name, newMember.password);

    if (error) {
      toast.error(error);
    } else {
      toast.success('Membro adicionado com sucesso!');
      setNewMember({ email: '', name: '', password: '' });
      setShowAddForm(false);
      fetchMembers();
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Equipe
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Lista de membros */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Membros da equipe</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Adicionar
              </Button>
            </div>

            {loadingMembers ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">
                        {member.name || 'Sem nome'}
                      </p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Formulário de adicionar */}
          {showAddForm && (
            <div className="space-y-3 p-4 rounded-lg bg-muted/50 border border-border">
              <h4 className="font-medium text-foreground">Novo membro</h4>
              
              <div className="space-y-2">
                <Label htmlFor="member-name">Nome</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="member-name"
                    value={newMember.name}
                    onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                    placeholder="Nome do membro"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="member-email">Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="member-email"
                    type="email"
                    value={newMember.email}
                    onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                    placeholder="email@empresa.com"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="member-password">Senha *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="member-password"
                    type="password"
                    value={newMember.password}
                    onChange={(e) => setNewMember({ ...newMember, password: e.target.value })}
                    placeholder="Mínimo 6 caracteres"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewMember({ email: '', name: '', password: '' });
                  }}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
