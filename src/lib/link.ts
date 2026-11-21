// Link que vem de dado (raspador do PIA, configuração da empresa) só vira link
// se for http(s) ou caminho do próprio site, como o guia em /guias/. Qualquer
// outro esquema, como "javascript:", rodaria script no endereço do CRM ao
// clicar (auditoria de 21/11/2026).
export function linkSeguro(url?: string | null): string | undefined {
  const u = url?.trim();
  if (!u) return undefined;
  return /^https?:\/\//i.test(u) || /^\/(?!\/)/.test(u) ? u : undefined;
}
