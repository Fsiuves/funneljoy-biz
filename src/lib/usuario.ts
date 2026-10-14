// Login por usuário (nome.sobrenome) para quem não tem email próprio.
//
// O Supabase Auth só entende email, e exige um por pessoa. Quem entra por
// usuário ganha um endereço interno, que nunca recebe mensagem:
//     ana.silva@coluna-ajustada.usuarios.domintelligence.com
// O slug da empresa no meio deixa o mesmo usuário existir em duas empresas.
// Ninguém vê esse endereço: a tela mostra só o usuário.

const DOMINIO_INTERNO = 'usuarios.domintelligence.com';

/** Minúsculas, números, ponto, hífen e sublinhado; começa e termina em letra ou número. */
const FORMATO_USUARIO = /^[a-z0-9](?:[a-z0-9._-]{1,38})[a-z0-9]$/;

export const pareceEmail = (texto: string) => texto.includes('@');

/** "Ana.Silva " vira "ana.silva"; acento some. */
export function normalizarUsuario(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.');
}

export const usuarioValido = (usuario: string) => FORMATO_USUARIO.test(usuario);

export function emailDoUsuario(usuario: string, slugEmpresa: string): string {
  return `${normalizarUsuario(usuario)}@${slugEmpresa}.${DOMINIO_INTERNO}`;
}

/** O que mostrar na tela: o usuário, para endereço interno; o email, para o resto. */
export function rotuloDeLogin(email?: string | null): string {
  if (!email) return '';
  return email.endsWith(`.${DOMINIO_INTERNO}`) ? email.split('@')[0] : email;
}

/** "Ana Paula da Silva" vira "ana.silva": primeiro e último nome. */
export function sugerirUsuario(nome: string): string {
  const partes = normalizarUsuario(nome)
    .split('.')
    .map((p) => p.replace(/[^a-z0-9]/g, ''))
    .filter((p) => p.length > 1 && !['da', 'de', 'do', 'das', 'dos', 'e'].includes(p));
  if (partes.length === 0) return '';
  return partes.length === 1 ? partes[0] : `${partes[0]}.${partes[partes.length - 1]}`;
}
