// Página própria por endereço: título, descrição, ícone e imagem da prévia do
// link. O robô do WhatsApp (e o do Google) não roda o JavaScript, lê só o HTML;
// sem isto, o link da clínica aparecia como "CRM Dom Intelligence". A tela é a
// mesma, só o cabeçalho do HTML muda.
//
// Gera dist/marcas/<arquivo>.html a partir do dist/index.html. Na Vercel
// (VERCEL=1), o index.html vira app.html: a Vercel serve o arquivo que existe
// antes de olhar as regras, e "/" cairia no index.html em qualquer endereço. O
// vercel.json escolhe o HTML pelo endereço. Na máquina, o index.html fica e o
// vite preview segue funcionando.
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');

const MARCAS = [
  {
    arquivo: 'colunaajustada.html',
    host: 'colunaajustada.domintelligence.com',
    titulo: 'CRM Coluna Ajustada - Lapa/Osasco',
    descricao: 'Acesso da equipe Coluna Ajustada, unidades Lapa e Osasco.',
    imagem: 'https://colunaajustada.domintelligence.com/marcas/colunaajustada-og.png',
    icone: 'https://ygxlplfdrpkxqszesmtn.supabase.co/storage/v1/object/public/logos/ea1e83f4-0fdc-41c4-903d-f51b5bfa25b4/favicon-marca.png',
  },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function trocar(html, re, novo) {
  if (!re.test(html)) throw new Error(`paginas-por-marca: não achei ${re} no index.html`);
  return html.replace(re, novo);
}

const base = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
fs.mkdirSync(path.join(DIST, 'marcas'), { recursive: true });

for (const m of MARCAS) {
  let h = base;
  h = trocar(h, /<html lang="[^"]*">/, '<html lang="pt-BR">');
  h = trocar(h, /<title>[^<]*<\/title>/, `<title>${esc(m.titulo)}</title>`);
  h = trocar(h, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(m.descricao)}">`);
  h = trocar(h, /<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${m.imagem}">`);
  h = trocar(h, /<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${m.imagem}">`);
  h = trocar(h, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(m.titulo)}">`);
  h = trocar(h, /<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(m.titulo)}">`);
  h = trocar(h, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(m.descricao)}">`);
  h = trocar(h, /<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(m.descricao)}">`);
  h = trocar(h, /<link rel="icon"[^>]*>/, `<link rel="icon" type="image/png" href="${m.icone}">`);
  h = h.replace(/\s*<meta name="twitter:site" content="@Lovable" \/>/, '');
  fs.writeFileSync(path.join(DIST, 'marcas', m.arquivo), h);
}

if (process.env.VERCEL) fs.renameSync(path.join(DIST, 'index.html'), path.join(DIST, 'app.html'));
console.log(`paginas-por-marca: ${MARCAS.map((m) => m.host).join(', ')}${process.env.VERCEL ? ' (index.html virou app.html)' : ''}`);
