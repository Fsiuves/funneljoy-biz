import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface TrocarSenhaDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Primeiro acesso ou senha provisória dada pela direção: não fecha até a
   * pessoa criar a senha dela, e cancelar é sair do sistema. Senha que outra
   * pessoa conhece não é senha.
   */
  obrigatoria?: boolean;
}

function problemaNaSenha(s: string): string | null {
  if (s.length < 8) return 'A senha precisa de pelo menos 8 caracteres';
  if (!/[A-Z]/.test(s)) return 'A senha precisa de uma letra maiúscula';
  if (!/[a-z]/.test(s)) return 'A senha precisa de uma letra minúscula';
  if (!/[0-9]/.test(s)) return 'A senha precisa de um número';
  return null;
}

export function TrocarSenhaDialog({ open, onOpenChange, obrigatoria = false }: TrocarSenhaDialogProps) {
  const navigate = useNavigate();
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [saindo, setSaindo] = useState(false);

  // Na obrigatória, cancelar é sair sem trocar: quem entrou só para testar o
  // acesso de outra pessoa não cria a senha dela. A provisória continua valendo.
  const sairSemTrocar = async () => {
    setSaindo(true);
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const problema = problemaNaSenha(senha);
    if (problema) {
      toast.error(problema);
      return;
    }
    if (senha !== confirma) {
      toast.error('As duas senhas não são iguais');
      return;
    }
    setSalvando(true);
    // A marca de provisória sai junto: é o que libera a tela para quem estava obrigado.
    const { error } = await supabase.auth.updateUser({ password: senha, data: { senha_provisoria: false } });
    setSalvando(false);
    if (error) {
      const m = error.message.toLowerCase();
      toast.error(
        m.includes('reauth')
          ? 'Por segurança, saia e entre de novo antes de trocar a senha.'
          : m.includes('different') || m.includes('same')
            ? 'A senha nova precisa ser diferente da atual.'
            : 'Não foi possível trocar a senha.',
      );
      return;
    }
    toast.success('Senha trocada');
    setSenha('');
    setConfirma('');
    onOpenChange?.(false);
  };

  return (
    <Dialog open={open} onOpenChange={obrigatoria ? () => undefined : onOpenChange}>
      <DialogContent
        className={`sm:max-w-md ${obrigatoria ? '[&>button]:hidden' : ''}`}
        onInteractOutside={(e) => obrigatoria && e.preventDefault()}
        onEscapeKeyDown={(e) => obrigatoria && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            {obrigatoria ? 'Crie a sua senha' : 'Trocar minha senha'}
          </DialogTitle>
          <DialogDescription>
            {obrigatoria
              ? 'Você entrou com uma senha provisória. Antes de continuar, crie uma senha que só você saiba.'
              : 'A senha nova vale a partir do próximo acesso, em qualquer aparelho.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={salvar} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label htmlFor="senha-nova">Senha nova</Label>
            <Input
              id="senha-nova"
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Mínimo 8 caracteres, com maiúscula, minúscula e número
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha-confirma">Repita a senha nova</Label>
            <Input
              id="senha-confirma"
              type="password"
              autoComplete="new-password"
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              disabled={salvando || saindo}
              onClick={obrigatoria ? sairSemTrocar : () => onOpenChange?.(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando || saindo}>
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar senha'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
