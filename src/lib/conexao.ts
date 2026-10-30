// A conexão com o Supabase vista pela tela (vídeo da clínica de 29/10: a conversa
// ficava girando e depois mostrava "Sem mensagens", e o CRM parecia travado).
//
// 1. Pedido que não responde falha no prazo, em vez de prender a aba: a
//    renovação do login pendurada numa rede que oscila segurava todas as
//    consultas da aba atrás dela.
// 2. Consulta não sai sem o login de quem está logado: quando a renovação do
//    login falha, o supabase-js manda a consulta com a chave pública, e o banco
//    devolve vazio em vez de erro (as mensagens de public.messages). Aqui ela
//    falha, o React Query tenta de novo e a tela avisa.
// 3. A tela mostra "Reconectando" enquanto a conexão está ruim
//    (src/components/AvisoConexao.tsx).

const CHAVE_SESSAO = 'sb-ygxlplfdrpkxqszesmtn-auth-token';
const PRAZO_MS = 20_000;
// O envio pelo painel leva foto, áudio e documento.
const PRAZO_ENVIO_MS = 120_000;
// Renovação do login: curto. Se a resposta se perde, o supabase-js tenta de novo
// com o mesmo token, e o servidor só aceita o mesmo token por 10 s; passou disso,
// ele derruba a sessão em todas as abas.
const PRAZO_LOGIN_MS = 8_000;

let ruim = false;
const ouvintes = new Set<() => void>();

function marcar(valor: boolean) {
  if (ruim === valor) return;
  ruim = valor;
  ouvintes.forEach((ouvir) => ouvir());
}

export const conexao = {
  assinar(ouvir: () => void) {
    ouvintes.add(ouvir);
    return () => {
      ouvintes.delete(ouvir);
    };
  },
  ruim: () => ruim,
  /** O login foi renovado: a conexão voltou. */
  voltou: () => marcar(false),
};

/** Consulta barrada por estar sem o login; o React Query tenta de novo. */
export class SemLoginError extends Error {
  constructor() {
    super('Reconectando ao servidor');
    this.name = 'SemLoginError';
  }
}

function temLoginGuardado(): boolean {
  try {
    return !!localStorage.getItem(CHAVE_SESSAO);
  } catch {
    return false;
  }
}

const enderecoDe = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/**
 * O fetch que o supabase-js usa. aoFicarSemLogin pede uma nova renovação do
 * login (no máximo uma a cada 10 s); quem chama é o client.ts.
 */
export function criarFetch(chavePublica: string, base: typeof fetch, aoFicarSemLogin: () => void): typeof fetch {
  let ultimoPedido = 0;
  return async (input, init) => {
    const url = enderecoDe(input);
    const dados = url.includes('/rest/v1/') || url.includes('/functions/v1/');

    if (dados && !url.endsWith('/rpc/marca_do_dominio') && temLoginGuardado()) {
      const autorizacao = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get('Authorization');
      if (autorizacao === `Bearer ${chavePublica}`) {
        marcar(true);
        if (Date.now() - ultimoPedido > 10_000) {
          ultimoPedido = Date.now();
          aoFicarSemLogin();
        }
        throw new SemLoginError();
      }
    }

    const controle = new AbortController();
    const prazo = url.includes('/functions/v1/wa-enviar') ? PRAZO_ENVIO_MS
      : url.includes('/auth/v1/token') ? PRAZO_LOGIN_MS
      : PRAZO_MS;
    const relogio = setTimeout(() => controle.abort(new DOMException('Tempo esgotado', 'TimeoutError')), prazo);
    const externo = init?.signal;
    if (externo) {
      if (externo.aborted) controle.abort(externo.reason);
      else externo.addEventListener('abort', () => controle.abort(externo.reason), { once: true });
    }
    try {
      const resposta = await base(input, { ...init, signal: controle.signal });
      if (dados || url.includes('/auth/v1/token')) marcar(false);
      return resposta;
    } catch (erro) {
      if (!externo?.aborted) marcar(true);
      throw erro;
    } finally {
      clearTimeout(relogio);
    }
  };
}
