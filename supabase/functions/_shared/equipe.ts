// Quem pode mexer no acesso de quem: senha e desativação.
//
//   • Direção: qualquer pessoa da empresa, menos ela mesma.
//   • Gerente: só atendente; se a gerente tem unidade, só atendente dela.
//   • Ninguém mexe em quem também tem papel em outra empresa. Quando alguém da
//     Dom está dentro da clínica, o perfil dele aparece na equipe dela; sem esta
//     trava, a direção da clínica tomaria a conta e entraria nas outras empresas.
//
// Recebe um cliente com a chave de serviço no schema crm: as regras estão aqui,
// não no RLS.

// deno-lint-ignore no-explicit-any
type Cliente = any;

export type Negado = { ok: false; erro: string; status: number };
export type Liberado = { ok: true; empresa: string };

export async function podeGerirAcesso(crm: Cliente, quemPede: string, alvo: string): Promise<Liberado | Negado> {
  const negar = (erro: string, status = 403): Negado => ({ ok: false, erro, status });

  if (quemPede === alvo) return negar("nao_em_si_mesmo");

  const { data: eu } = await crm
    .from("profiles").select("tenant_id, unidade, ativo").eq("id", quemPede).maybeSingle();
  if (!eu?.tenant_id || eu.ativo === false) return negar("not_authorized");
  const empresa: string = eu.tenant_id;

  const { data: meuPapel } = await crm
    .from("user_roles").select("role").eq("user_id", quemPede).eq("tenant_id", empresa).maybeSingle();
  if (meuPapel?.role !== "admin" && meuPapel?.role !== "manager") return negar("not_authorized");

  const { data: dele } = await crm
    .from("profiles").select("tenant_id, unidade").eq("id", alvo).maybeSingle();
  if (dele?.tenant_id !== empresa) return negar("not_authorized");

  const { data: outras } = await crm
    .from("user_roles").select("tenant_id").eq("user_id", alvo).neq("tenant_id", empresa);
  if (outras && outras.length > 0) return negar("pessoa_de_outra_empresa");

  if (meuPapel.role === "manager") {
    const { data: papelDele } = await crm
      .from("user_roles").select("role").eq("user_id", alvo).eq("tenant_id", empresa).maybeSingle();
    if (papelDele?.role !== "atendente") return negar("so_atendente");
    if (eu.unidade && dele.unidade !== eu.unidade) return negar("outra_unidade");
  }

  return { ok: true, empresa };
}
