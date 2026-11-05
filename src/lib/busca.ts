/**
 * Nome na forma de comparar da busca: sem acento e sem maiúscula, com as grafias
 * que soam igual juntas (Souza e Sousa, Thiago e Tiago, Luiz e Luis, Anna e Ana).
 * A clínica procurava "Empreiteira Souza" e o contato era "empreiteira Sousa".
 * Mesma regra de crm.nome_busca (Radar/fase3-inbox/42-busca-e-conversa-nova.sql).
 */
export function chaveNome(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/y/g, 'i')
    .replace(/z/g, 's')
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/(.)\1+/g, '$1');
}
