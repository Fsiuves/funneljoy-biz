// Marca por endereço: o mesmo front atende várias empresas, e o endereço diz
// qual é. colunaajustada.domintelligence.com abre com logo, cores, ícone e nome
// da clínica; crm.domintelligence.com continua com a cara padrão.
//
// As cores ficam na empresa (crm.tenants.primary_color e secondary_color, em
// hex) e viram as variáveis HSL do tema do Tailwind.

import { supabase } from '@/integrations/supabase/client';

export interface Marca {
  tenantId: string;
  nome: string;
  /** Identificador da empresa, usado no login por usuário. */
  slug: string | null;
  logoUrl: string | null;
  iconeUrl: string | null;
  corPrimaria: string | null;
  corDestaque: string | null;
  /** Título da aba (tenants.config.titulo); sem ele, vale o nome. */
  titulo?: string | null;
}

export interface Cores {
  primaria?: string | null;
  destaque?: string | null;
}

// ---------------------------------------------------------------- endereço

const HOST_DE_TESTE = /^(localhost|127\.0\.0\.1|.+\.vercel\.app)$/;
const CHAVE_TESTE = 'crm-marca-teste';

/**
 * O endereço que decide a marca. Em localhost e nas prévias da Vercel dá para
 * simular outro com ?marca=colunaajustada.domintelligence.com, para conferir a
 * tela antes do DNS existir. Nos endereços de verdade o parâmetro é ignorado.
 */
export function hostDaMarca(): string {
  const host = window.location.hostname.toLowerCase();
  if (!HOST_DE_TESTE.test(host)) return host;
  const pedido = new URLSearchParams(window.location.search).get('marca');
  try {
    if (pedido) sessionStorage.setItem(CHAVE_TESTE, pedido);
    return sessionStorage.getItem(CHAVE_TESTE) || host;
  } catch {
    return pedido || host;
  }
}

const chaveCache = (host: string) => `crm-marca:${host}`;

/** Última marca vista neste endereço, para a tela já abrir com a cara certa. */
export function marcaGuardada(host: string): Marca | null | undefined {
  try {
    const bruto = localStorage.getItem(chaveCache(host));
    if (bruto === null) return undefined;
    return JSON.parse(bruto) as Marca | null;
  } catch {
    return undefined;
  }
}

export async function buscarMarca(host: string): Promise<Marca | null> {
  const { data, error } = await (supabase as any).rpc('marca_do_dominio', { _host: host });
  if (error) throw error;
  const linha = Array.isArray(data) ? data[0] : null;
  const marca: Marca | null = linha
    ? {
        tenantId: linha.tenant_id,
        nome: linha.nome,
        slug: linha.slug ?? null,
        logoUrl: linha.logo_url,
        iconeUrl: linha.icone_url,
        corPrimaria: linha.cor_primaria,
        corDestaque: linha.cor_destaque,
        titulo: linha.titulo ?? null,
      }
    : null;
  try {
    localStorage.setItem(chaveCache(host), JSON.stringify(marca));
  } catch {
    // Sem armazenamento a marca só não abre instantânea na próxima vez.
  }
  return marca;
}

// ---------------------------------------------------------------- cores

interface Hsl { h: number; s: number; l: number }

function hexParaHsl(hex?: string | null): Hsl | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const emTexto = ({ h, s, l }: Hsl) => `${h} ${s}% ${l}%`;

/** Texto legível sobre a cor: escuro sobre cor clara, branco sobre cor escura. */
function textoSobre(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const canal = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
  return lum > 0.45 ? '0 0% 7%' : '0 0% 100%';
}

// Tudo o que a marca pode mudar. Apagar volta ao index.css.
const VARIAVEIS = [
  '--primary', '--primary-foreground', '--ring',
  '--accent', '--accent-foreground',
  '--sidebar-background', '--sidebar-foreground', '--sidebar-accent',
  '--sidebar-accent-foreground', '--sidebar-border',
  '--sidebar-primary', '--sidebar-primary-foreground', '--sidebar-ring',
];

export function aplicarTema(cores: Cores | null) {
  const raiz = document.documentElement.style;
  VARIAVEIS.forEach((v) => raiz.removeProperty(v));
  if (!cores) return;

  const p = hexParaHsl(cores.primaria);
  if (p && cores.primaria) {
    raiz.setProperty('--primary', emTexto(p));
    raiz.setProperty('--primary-foreground', textoSobre(cores.primaria));
    raiz.setProperty('--ring', emTexto(p));
    // Principal escura vira o menu lateral. Clara não: o texto do menu é claro.
    if (p.l <= 30) {
      const fundo = Math.min(p.l, 12);
      raiz.setProperty('--sidebar-background', emTexto({ ...p, l: fundo }));
      raiz.setProperty('--sidebar-accent', emTexto({ ...p, l: fundo + 8 }));
      raiz.setProperty('--sidebar-border', emTexto({ ...p, l: fundo + 12 }));
      raiz.setProperty('--sidebar-foreground', '0 0% 88%');
      raiz.setProperty('--sidebar-accent-foreground', '0 0% 96%');
    }
  }

  const d = hexParaHsl(cores.destaque);
  if (d && cores.destaque) {
    raiz.setProperty('--accent', emTexto(d));
    raiz.setProperty('--accent-foreground', textoSobre(cores.destaque));
    raiz.setProperty('--sidebar-primary', emTexto(d));
    raiz.setProperty('--sidebar-primary-foreground', textoSobre(cores.destaque));
    raiz.setProperty('--sidebar-ring', emTexto(d));
  }
}

// ---------------------------------------------------------------- quem manda no tema

// Antes do login vale a marca do endereço; depois, a da empresa de quem entrou.
// No endereço de uma empresa as duas são a mesma. No endereço padrão, quem é da
// clínica e entra por lá passa a ver a cara da clínica.
let temaDaEmpresaAtivo = false;

export function aplicarMarcaDoEndereco(marca: Marca | null) {
  temaDaEmpresaAtivo = false;
  aplicarTema(marca ? { primaria: marca.corPrimaria, destaque: marca.corDestaque } : null);
  aplicarIdentidade(marca?.titulo || marca?.nome, marca?.iconeUrl);
}

export function aplicarMarcaDaEmpresa(empresa: {
  name: string;
  dominio?: string | null;
  favicon_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  config?: { titulo?: string | null } | null;
}) {
  temaDaEmpresaAtivo = true;
  aplicarTema({ primaria: empresa.primary_color, destaque: empresa.secondary_color });
  // Nome e ícone próprios só para quem tem endereço próprio; o resto fica com a
  // aba padrão, como sempre foi.
  aplicarIdentidade(empresa.dominio ? empresa.config?.titulo || empresa.name : null, empresa.favicon_url);
}

export const temaVemDaEmpresa = () => temaDaEmpresaAtivo;

// ---------------------------------------------------------------- aba do navegador

const TITULO_PADRAO = 'CRM Dom Intelligence';
let iconePadrao: string | null = null;

export function aplicarIdentidade(nome?: string | null, icone?: string | null) {
  document.title = nome || TITULO_PADRAO;

  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (iconePadrao === null) iconePadrao = link.href;
  if (icone) {
    link.type = 'image/png';
    link.href = icone;
  } else if (iconePadrao) {
    link.removeAttribute('type');
    link.href = iconePadrao;
  }
}
