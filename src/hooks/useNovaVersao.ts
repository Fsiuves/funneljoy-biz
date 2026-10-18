import { useEffect, useState } from 'react';

// Quem abre o CRM depois de uma publicação já pega a versão nova (a Vercel serve o
// HTML com must-revalidate). O caso que sobra é a aba que ficou aberta: o JavaScript
// antigo segue rodando até alguém recarregar. Aqui o app pergunta qual build está
// publicado (version.json, gerado no build) e compara com o que ele carregou.
// Mesmo esquema do ColenSystem.

const BUILD_ATUAL = __BUILD_ID__;

// A cada 5 minutos e sempre que a pessoa volta para a aba.
const INTERVALO_MS = 5 * 60 * 1000;

async function buscarBuildPublicado(): Promise<string | null> {
  try {
    // Caminho absoluto: relativo resolveria contra a rota atual e cairia no HTML do app.
    const resp = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!resp.ok) return null;
    const dados = await resp.json();
    return typeof dados?.build === 'string' ? dados.build : null;
  } catch {
    // Sem internet ou arquivo ausente: não há o que avisar.
    return null;
  }
}

/** O build publicado, quando é diferente do que esta aba carregou; senão null. */
export function useNovaVersao(): string | null {
  const [novo, setNovo] = useState<string | null>(null);

  useEffect(() => {
    // Em desenvolvimento não existe version.json.
    if (import.meta.env.DEV || novo) return;
    let cancelado = false;

    async function verificar() {
      const publicado = await buscarBuildPublicado();
      if (!cancelado && publicado && publicado !== BUILD_ATUAL) setNovo(publicado);
    }

    verificar();
    const timer = setInterval(verificar, INTERVALO_MS);
    const aoVoltar = () => { if (document.visibilityState === 'visible') verificar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      cancelado = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [novo]);

  return novo;
}
