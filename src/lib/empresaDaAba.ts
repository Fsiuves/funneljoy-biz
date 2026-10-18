// A empresa que esta aba usa. Vai no cabeçalho x-tenant-id das consultas ao
// banco, e o crm.get_user_tenant_id (23-ajustes-reuniao.sql) usa ela quando a
// pessoa tem papel lá. Quem tem acesso a duas empresas (a Dom e a clínica) pode
// ter cada uma numa aba sem uma trocar a outra. Sem nada aqui, vale a do perfil.
//
// Só nas consultas ao banco (/rest/v1/): as funções do Supabase não aceitam
// cabeçalho fora da lista delas e recusariam a chamada.
const CHAVE = 'empresa-da-aba';

let atual: string | null = (() => {
  try {
    return sessionStorage.getItem(CHAVE);
  } catch {
    return null;
  }
})();

export const empresaDaAba = () => atual;

export function definirEmpresaDaAba(id: string | null) {
  if (id === atual) return;
  atual = id;
  try {
    if (id) sessionStorage.setItem(CHAVE, id);
    else sessionStorage.removeItem(CHAVE);
  } catch {
    // Sem armazenamento a escolha vale até recarregar.
  }
}

export function comEmpresaDaAba(input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!atual || !url.includes('/rest/v1/')) return init;
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set('x-tenant-id', atual);
  return { ...init, headers };
}
