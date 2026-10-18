import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import {
  aplicarMarcaDoEndereco, buscarMarca, hostDaMarca, marcaGuardada, temaVemDaEmpresa,
  type Marca,
} from '@/lib/marca';
import { definirEmpresaDaAba } from '@/lib/empresaDaAba';

interface EstadoMarca {
  /** Empresa dona deste endereço. Nula no endereço padrão. */
  marca: Marca | null;
}

const Contexto = createContext<EstadoMarca>({ marca: null });

export function MarcaProvider({ children }: { children: ReactNode }) {
  const [host] = useState(hostDaMarca);
  // undefined = ainda não sabe; null = endereço padrão.
  const [marca, setMarca] = useState<Marca | null | undefined>(() => marcaGuardada(host));

  useEffect(() => {
    let vivo = true;
    buscarMarca(host)
      .then((m) => vivo && setMarca(m))
      .catch(() => vivo && setMarca((atual) => atual ?? null));
    return () => {
      vivo = false;
    };
  }, [host]);

  useEffect(() => {
    if (marca === undefined || temaVemDaEmpresa()) return;
    aplicarMarcaDoEndereco(marca);
  }, [marca]);

  // Primeira visita sem cópia guardada: espera a marca para não abrir a tela da
  // clínica com a cara do DOM e trocar na frente da pessoa.
  if (marca === undefined) return <div className="min-h-screen bg-background" />;

  // No endereço de uma empresa, a aba usa sempre ela, antes de qualquer consulta.
  if (marca) definirEmpresaDaAba(marca.tenantId);

  return <Contexto.Provider value={{ marca }}>{children}</Contexto.Provider>;
}

export const useMarca = () => useContext(Contexto);
