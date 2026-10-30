import { Component, type ReactNode } from 'react';

/**
 * Erro inesperado ao desenhar uma tela deixava a página inteira em branco, sem
 * saída (inclusive a TV do Painel). Aqui a pessoa vê o aviso e recarrega; a TV
 * recarrega sozinha em 30 s.
 */
export class ErroNaTela extends Component<{ children: ReactNode }, { erro: boolean }> {
  state = { erro: false };

  static getDerivedStateFromError() {
    return { erro: true };
  }

  componentDidCatch(erro: unknown) {
    console.error('Erro na tela', erro);
    if (window.location.pathname.startsWith('/painel')) window.setTimeout(() => window.location.reload(), 30_000);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-medium text-foreground">Algo deu errado nesta tela.</p>
        <p className="text-sm text-muted-foreground">Recarregue a página. Se continuar, avise o suporte.</p>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={() => window.location.reload()}
        >
          Recarregar
        </button>
      </div>
    );
  }
}
