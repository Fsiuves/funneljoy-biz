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
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999);
    if (error) throw error;
    tudo.push(...(data ?? []));
    if (!data || data.length < 1000) return tudo;
  }
}
