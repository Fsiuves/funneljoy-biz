/**
 * O servidor devolve no máximo 1.000 linhas por pedido. Lista que pode passar
 * disso busca de 1.000 em 1.000 (a gerente vê os 1.273 pacientes das duas
 * unidades; sem isso, os 273 mais antigos sumiam do funil e da busca).
 * A consulta precisa de ordem estável, para uma página não repetir a outra.
 */
export async function buscarTudo<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const tudo: T[] = [];
  const vistos = new Set<unknown>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999);
    if (error) throw error;
    // Linha nova criada entre uma página e outra empurra a lista: sem isso a
    // mesma linha viria duas vezes.
    for (const linha of data ?? []) {
      const id = (linha as { id?: unknown }).id;
      if (id !== undefined && vistos.has(id)) continue;
      if (id !== undefined) vistos.add(id);
      tudo.push(linha);
    }
    if (!data || data.length < 1000) return tudo;
  }
}
