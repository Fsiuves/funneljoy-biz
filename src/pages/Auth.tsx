import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMarca } from '@/hooks/useMarca';
import { aplicarMarcaDoEndereco, buscarMarca, hostDaMarca } from '@/lib/marca';
import { emailDoUsuario, pareceEmail } from '@/lib/usuario';
import { CHAVE_ERRO_LOGIN } from '@/components/auth/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Mail, Lock, User, Building2, Loader2, Eye, EyeOff } from 'lucide-react';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const { signIn, signUp, isAuthenticated, loading: authLoading } = useAuth();
  const { marca } = useMarca();
  const navigate = useNavigate();
  // No endereço de uma empresa só entra quem ela cadastrou: sem "cadastre sua empresa".
  const enderecoProprio = !!marca;

  // Quem saiu de uma empresa com outra cara volta para a do endereço.
  useEffect(() => {
    aplicarMarcaDoEndereco(marca);
    try {
      const recado = sessionStorage.getItem(CHAVE_ERRO_LOGIN);
      if (recado) {
        setError(recado);
        sessionStorage.removeItem(CHAVE_ERRO_LOGIN);
      }
    } catch {
      // Sem armazenamento não há recado.
    }
  }, [marca]);

  // Redirect authenticated users away from auth page
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (isLogin) {
        // No endereço de uma empresa entra-se também por usuário (nome.sobrenome):
        // vira o endereço interno daquela empresa. Fora dele, só email.
        let login = email.trim();
        if (!pareceEmail(login)) {
          const slug = marca?.slug ?? (marca ? (await buscarMarca(hostDaMarca()))?.slug : null);
          if (!slug) {
            setError('Aqui o acesso é pelo email. Para entrar com usuário, use o endereço da sua empresa.');
            return;
          }
          login = emailDoUsuario(login, slug);
        }
        const { error } = await signIn(login, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            setError(enderecoProprio ? 'Usuário ou senha inválidos' : 'Email ou senha inválidos');
          } else {
            setError(error.message);
          }
        } else {
          navigate('/');
        }
      } else {
        if (password.length < 6) {
          setError('A senha deve ter pelo menos 6 caracteres');
          setLoading(false);
          return;
        }

        if (!companyName.trim()) {
          setError('Nome da empresa é obrigatório');
          setLoading(false);
          return;
        }

        const result = await signUp(email, password, name, companyName);

        if (result.error) {
          if (result.error.message.includes('already registered')) {
            setError('Este email já está cadastrado');
          } else {
            setError(result.error.message);
          }
        } else if (result.needsEmailConfirmation) {
          setMessage('Conta criada! Confirme seu email e depois faça login para concluir o cadastro.');
          setIsLogin(true);
        } else if ('needsOnboarding' in result && result.needsOnboarding) {
          // Tenant/profile creation failed but user is authenticated
          // Redirect to onboarding to complete setup
          navigate('/onboarding');
        } else {
          navigate('/');
        }
      }
    } catch {
      setError('Ocorreu um erro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Marca */}
      <aside className="bg-sidebar text-sidebar-foreground lg:w-[44%] flex flex-col justify-between px-8 py-8 lg:px-14 lg:py-12">
        <div className="flex justify-center lg:justify-start">
          {marca?.logoUrl ? (
            <img src={marca.logoUrl} alt={marca.nome} className="h-16 lg:h-28 w-auto object-contain" />
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center">
                <span className="text-xl font-bold text-primary-foreground">C</span>
              </div>
              <span className="text-xl font-bold">
                CRM <span className="text-sidebar-primary">{marca?.nome ?? 'Dom Intelligence'}</span>
              </span>
            </div>
          )}
        </div>

        <div className="hidden lg:block max-w-md">
          <p className="text-3xl font-semibold leading-snug text-sidebar-accent-foreground">
            Atendimento, funil e resultados em um só lugar.
          </p>
          <div className="mt-5 h-1 w-16 rounded-full bg-sidebar-primary" />
        </div>

        {/* No endereço de uma empresa, nada da Dom: só a marca dela. */}
        <p className="hidden lg:block text-xs text-sidebar-foreground/50">
          {enderecoProprio ? marca?.nome : 'Dom Intelligence'}
        </p>
      </aside>

      {/* Formulário */}
      <main className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm animate-fade-in">
          <h1 className="text-2xl font-bold text-foreground">
            {isLogin ? 'Entrar' : 'Cadastre sua empresa'}
          </h1>
          <p className="text-muted-foreground mt-1 mb-8">
            {enderecoProprio
              ? `Acesso da equipe ${marca!.nome}`
              : isLogin ? 'Entre na sua conta' : 'Crie a conta da sua empresa'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Nome da Empresa *
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="input-field pl-10"
                      placeholder="Nome da sua empresa"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Seu Nome
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input-field pl-10"
                      placeholder="Seu nome completo"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {isLogin && enderecoProprio ? 'Usuário ou email' : 'Email'}
              </label>
              <div className="relative">
                {isLogin && enderecoProprio ? (
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                ) : (
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                )}
                <input
                  type={isLogin && enderecoProprio ? 'text' : 'email'}
                  required
                  autoComplete={isLogin && enderecoProprio ? 'username' : 'email'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-10"
                  placeholder={isLogin && enderecoProprio ? 'nome.sobrenome' : 'seu@email.com'}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  required
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-10 pr-10"
                  placeholder="••••••••"
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}
                  title={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}
                >
                  {mostrarSenha ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {message && (
              <div className="p-3 rounded-lg bg-primary/10 text-primary text-sm">
                {message}
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full btn-primary"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isLogin ? (
                'Entrar'
              ) : (
                'Criar Conta'
              )}
            </Button>
          </form>

          {!enderecoProprio && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                  setMessage('');
                }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {isLogin ? (
                  <>Não tem conta? <span className="text-primary font-medium">Cadastre sua empresa</span></>
                ) : (
                  <>Já tem conta? <span className="text-primary font-medium">Entre</span></>
                )}
              </button>
            </div>
          )}

          {enderecoProprio && (
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Esqueceu a senha? Peça para a direção redefinir.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
