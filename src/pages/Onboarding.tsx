import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('Você precisa estar logado');
      navigate('/auth');
      return;
    }

    if (!companyName.trim()) {
      toast.error('Nome da empresa é obrigatório');
      return;
    }

    setLoading(true);

    try {
      // Generate unique slug
      const baseSlug = companyName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 40);

      const slug = `${baseSlug || 'empresa'}-${Date.now().toString(36)}`;

      // Create tenant
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: companyName.trim(),
          slug,
        })
        .select()
        .single();

      if (tenantError) {
        console.error('Tenant error:', tenantError);
        toast.error('Erro ao criar empresa: ' + tenantError.message);
        setLoading(false);
        return;
      }

      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (existingProfile) {
        // Update existing profile with tenant_id
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ tenant_id: tenant.id })
          .eq('id', user.id);

        if (updateError) {
          console.error('Profile update error:', updateError);
          toast.error('Erro ao vincular perfil: ' + updateError.message);
          setLoading(false);
          return;
        }
      } else {
        // Create new profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            email: user.email || '',
            name: user.user_metadata?.name || null,
            tenant_id: tenant.id,
          });

        if (profileError) {
          console.error('Profile error:', profileError);
          toast.error('Erro ao criar perfil: ' + profileError.message);
          setLoading(false);
          return;
        }
      }

      toast.success('Empresa criada com sucesso!');
      
      // Force page reload to refresh all contexts
      window.location.href = '/';
    } catch (error) {
      console.error('Onboarding error:', error);
      toast.error('Erro inesperado. Tente novamente.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-2xl mb-4">
            <Sparkles className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Bem-vindo ao CRM!</h1>
          <p className="text-muted-foreground mt-2">
            Para começar, cadastre sua empresa
          </p>
        </div>

        {/* Form */}
        <div className="bg-card rounded-2xl shadow-card p-8 animate-fade-in">
          <form onSubmit={handleCreateCompany} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Nome da Empresa *
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="pl-10"
                  placeholder="Nome da sua empresa"
                  disabled={loading}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Você poderá alterar isso depois nas configurações
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Criando empresa...
                </>
              ) : (
                'Criar Empresa e Continuar'
              )}
            </Button>
          </form>
        </div>

        {/* Info */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>Logado como: {user?.email}</p>
        </div>
      </div>
    </div>
  );
}
