// Camada de dados: Supabase quando configurado, navegador (modo demonstração) quando não.
const cfg = window.CATALOGO_CONFIG || {};
export const MODO = cfg.supabaseUrl && cfg.supabaseAnonKey ? 'supabase' : 'demo';

let sb = null;
async function cliente() {
  if (!sb) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  }
  return sb;
}

export const CONFIG_PADRAO = {
  nome_loja: 'Essencialli',
  subtitulo: 'Brand Collection',
  titulo_hero: 'Perfumes que marcam presença',
  aviso: 'Atacado · pedido mínimo de 6 peças',
  pedido_minimo: 6,
  mostrar_precos: true,
  vendedoras: [],
  instagram: '',
  pixel_id: '',
  proxima_vendedora: 0,
  multiplicador_revenda: 2,
  mostrar_revenda: true,
  banner_ativo: true,
  banner_titulo: 'Perfume também é renda extra',
  banner_texto1: 'Já revende perfumes? Amplie seu catálogo com as nossas marcas e ofereça mais opções às suas clientes.',
  banner_texto2: 'Quer começar do zero? Com {minimo} peças você já monta seu primeiro estoque.',
  banner_botao: 'Quero revender',
  banner_mensagem: 'Olá! Vi o catálogo e quero saber como começar a revender.'
};

// Público (categoria) e tipo do produto são fixos para a equipe não criar variações.
export const CATEGORIAS = ['Masculino', 'Feminino', 'Infantil'];
export const TIPOS = ['Perfume', 'Body splash', 'Kit'];
// Quantos produtos cabem na vitrine "Mais vendidos" (escolhidos à mão pela equipe).
export const LIMITE_MAIS_VENDIDOS = 10;

const CAMPOS_CONFIG = ['nome_loja', 'subtitulo', 'titulo_hero', 'aviso', 'pedido_minimo',
  'mostrar_precos', 'vendedoras', 'instagram', 'pixel_id', 'multiplicador_revenda', 'mostrar_revenda',
  'banner_ativo', 'banner_titulo', 'banner_texto1', 'banner_texto2', 'banner_botao', 'banner_mensagem'];

const CAMPOS_PRODUTO = ['nome', 'categoria', 'tipo', 'volume', 'descricao', 'notas', 'preco',
  'preco_promocional', 'preco_revenda', 'foto_url', 'esgotado', 'visivel', 'destaque', 'novidade', 'ordem'];

// ---------- Modo demonstração (localStorage) ----------
const K = { prod: 'ess_demo_produtos', conf: 'ess_demo_config', ped: 'ess_demo_pedidos', sessao: 'ess_demo_sessao' };

function ler(k, padrao) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch { return padrao; }
}
function gravar(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); }
  catch { throw new Error('Sem espaço no navegador (modo demonstração). Use menos fotos ou fotos menores.'); }
}
function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
}

// No modo demonstração, a primeira abertura carrega o cadastro inicial (fotos da loja).
async function produtosDemo() {
  let p = ler(K.prod, null);
  if (!p) {
    try { p = await (await fetch('produtos-iniciais.json')).json(); } catch { p = []; }
    p = p.map(x => ({ id: uid(), criado_em: new Date().toISOString(), ...x }));
    gravar(K.prod, p);
  }
  return p;
}

function ordenar(lista) {
  return lista.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
function limparProduto(p) {
  const o = {};
  for (const c of CAMPOS_PRODUTO) if (c in p) o[c] = p[c];
  return o;
}

// ---------- Configurações ----------
export async function obterConfig() {
  if (MODO === 'demo') return { ...CONFIG_PADRAO, ...ler(K.conf, {}) };
  const c = await cliente();
  const { data, error } = await c.from('configuracoes').select('*').eq('id', 1).single();
  if (error) throw error;
  return { ...CONFIG_PADRAO, ...data };
}

export async function salvarConfig(v) {
  const dados = {};
  for (const k of CAMPOS_CONFIG) if (k in v) dados[k] = v[k];
  if (MODO === 'demo') { gravar(K.conf, { ...ler(K.conf, {}), ...dados }); return; }
  const c = await cliente();
  const { error } = await c.from('configuracoes').update({ ...dados, atualizado_em: new Date().toISOString() }).eq('id', 1);
  if (error) throw error;
}

// ---------- Produtos ----------
export async function listarProdutos({ todos = false } = {}) {
  if (MODO === 'demo') {
    const p = await produtosDemo();
    return ordenar(todos ? p : p.filter(x => x.visivel));
  }
  const c = await cliente();
  let q = c.from('produtos').select('*');
  if (!todos) q = q.eq('visivel', true);
  const { data, error } = await q.order('ordem').order('nome');
  if (error) throw error;
  return data;
}

export async function salvarProduto(p) {
  const dados = limparProduto(p);
  if (MODO === 'demo') {
    const lista = await produtosDemo();
    if (p.id) {
      const i = lista.findIndex(x => x.id === p.id);
      lista[i] = { ...lista[i], ...dados };
      gravar(K.prod, lista);
      return lista[i];
    }
    const novo = { id: uid(), criado_em: new Date().toISOString(), ...dados };
    lista.push(novo);
    gravar(K.prod, lista);
    return novo;
  }
  const c = await cliente();
  dados.atualizado_em = new Date().toISOString();
  const q = p.id ? c.from('produtos').update(dados).eq('id', p.id) : c.from('produtos').insert(dados);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data;
}

export async function excluirProduto(id) {
  if (MODO === 'demo') { gravar(K.prod, (await produtosDemo()).filter(x => x.id !== id)); return; }
  const c = await cliente();
  const { error } = await c.from('produtos').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Fotos ----------
function paraDataURL(blob) {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = erro;
    r.readAsDataURL(blob);
  });
}

export async function enviarFoto(blob) {
  if (MODO === 'demo') return paraDataURL(blob);
  const c = await cliente();
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const caminho = `${uid()}.${ext}`;
  const { error } = await c.storage.from('fotos').upload(caminho, blob, { contentType: blob.type, cacheControl: '31536000' });
  if (error) throw error;
  return c.storage.from('fotos').getPublicUrl(caminho).data.publicUrl;
}

function carregarImagem(file) {
  return new Promise((ok, erro) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Arquivo de imagem inválido.')); };
    img.src = url;
  });
}

// Reduz a foto antes de subir: carrega rápido no celular e economiza o espaço gratuito.
export async function comprimirImagem(file, max = MODO === 'demo' ? 700 : 1200, qualidade = 0.85) {
  const img = await carregarImagem(file);
  const escala = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * escala);
  canvas.height = Math.round(img.naturalHeight * escala);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let blob = await new Promise(r => canvas.toBlob(r, 'image/webp', qualidade));
  if (!blob || blob.type !== 'image/webp') {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', qualidade));
  }
  return blob;
}

// ---------- Pedidos ----------
function vendedorasAtivas(conf) {
  return (conf.vendedoras || []).filter(v => v.ativa && String(v.telefone || '').replace(/\D/g, ''));
}

// Registra o pedido e devolve a vendedora da vez (alternância exata, uma para cada).
export async function registrarPedido({ itens, nome, cidade, pecas, valor, fbp = null, fbc = null }) {
  if (MODO === 'demo') {
    const conf = { ...CONFIG_PADRAO, ...ler(K.conf, {}) };
    const ativas = vendedorasAtivas(conf);
    if (!ativas.length) throw new Error('Nenhuma vendedora ativa.');
    const v = ativas[(conf.proxima_vendedora || 0) % ativas.length];
    gravar(K.conf, { ...ler(K.conf, {}), proxima_vendedora: (conf.proxima_vendedora || 0) + 1 });
    const pedidos = ler(K.ped, []);
    pedidos.unshift({
      id: pedidos.length + 1, criado_em: new Date().toISOString(), cliente_nome: nome, cliente_cidade: cidade,
      itens, total_pecas: pecas, total_valor: valor, vendedora_nome: v.nome, vendedora_telefone: v.telefone,
      status: 'enviado', valor_venda: null, fechado_em: null, fbp, fbc
    });
    gravar(K.ped, pedidos.slice(0, 300));
    return { nome: v.nome, telefone: v.telefone, pedido: pedidos[0].id };
  }
  const c = await cliente();
  const { data, error } = await c.rpc('registrar_pedido', {
    p_itens: itens, p_nome: nome, p_cidade: cidade, p_pecas: pecas, p_valor: valor, p_fbp: fbp, p_fbc: fbc
  });
  if (error) throw error;
  return data;
}

// Equipe marca o pedido como vendido (com o valor final) ou como não fechado.
export async function atualizarPedido(id, dados) {
  const campos = {};
  for (const k of ['status', 'valor_venda', 'fechado_em']) if (k in dados) campos[k] = dados[k];
  if (MODO === 'demo') {
    const pedidos = ler(K.ped, []);
    const i = pedidos.findIndex(p => p.id === id);
    pedidos[i] = { ...pedidos[i], ...campos };
    gravar(K.ped, pedidos);
    return pedidos[i];
  }
  const c = await cliente();
  const { data, error } = await c.from('pedidos').update(campos).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// Avisa a Meta (API de Conversões) que o pedido virou venda. Só no modo real.
export async function enviarCompraMeta(id) {
  if (MODO === 'demo') return { ok: true, demo: true };
  const c = await cliente();
  const { data, error } = await c.functions.invoke('enviar-compra', { body: { pedido: id } });
  if (error) {
    let detalhe = error.message;
    try { const j = await error.context.json(); detalhe = j.detalhe || j.erro || detalhe; } catch { /* sem corpo */ }
    throw new Error(detalhe);
  }
  return data;
}

export async function listarPedidos() {
  if (MODO === 'demo') return ler(K.ped, []);
  const c = await cliente();
  const { data, error } = await c.from('pedidos').select('*').order('criado_em', { ascending: false }).limit(2000);
  if (error) throw error;
  return data;
}

// ---------- Acesso da equipe ----------
export async function entrar(email, senha) {
  if (MODO === 'demo') { gravar(K.sessao, { email }); return; }
  const c = await cliente();
  const { error } = await c.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
}
export async function sair() {
  if (MODO === 'demo') { localStorage.removeItem(K.sessao); return; }
  const c = await cliente();
  await c.auth.signOut();
}
export async function sessaoAtual() {
  if (MODO === 'demo') return ler(K.sessao, null);
  const c = await cliente();
  const { data } = await c.auth.getSession();
  return data.session ? { email: data.session.user.email } : null;
}

// ---------- Utilidades compartilhadas ----------
export function moeda(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
export function temPreco(p) {
  return p.preco != null && p.preco !== '' && Number(p.preco) > 0;
}
export function temPromo(p) {
  return temPreco(p) && p.preco_promocional != null && Number(p.preco_promocional) > 0
    && Number(p.preco_promocional) < Number(p.preco);
}
export function precoFinal(p) {
  if (!temPreco(p)) return null;
  return Number(temPromo(p) ? p.preco_promocional : p.preco);
}
// Sugestão de revenda: valor próprio do item, ou preço do catálogo × multiplicador das configurações.
export function precoRevenda(p, conf) {
  if (p.preco_revenda != null && Number(p.preco_revenda) > 0) return Number(p.preco_revenda);
  const custo = precoFinal(p);
  const mult = Number(conf?.multiplicador_revenda) || 0;
  return custo && mult > 1 ? Math.round(custo * mult * 100) / 100 : null;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Frasco desenhado para produto sem foto.
const PALETAS = [
  ['#f3e6d8', '#d9b48f', '#8a5a3c'], ['#e9e4ef', '#b9a7cf', '#5d4a7a'], ['#e3ece6', '#9fc2ab', '#3f6b52'],
  ['#efe3e3', '#d4a3a3', '#7d3f45'], ['#e6e9ee', '#a9b6c8', '#3e4c63'], ['#f1ead9', '#d8c08a', '#7a6232']
];
export function frasco(nome = '', categoria = '') {
  let h = 0;
  for (const ch of nome + categoria) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [fundo, vidro, tinta] = PALETAS[h % PALETAS.length];
  const letra = esc((nome.trim()[0] || 'E').toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
  <defs><radialGradient id="g" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#fffdf9"/><stop offset="1" stop-color="${fundo}"/></radialGradient>
  <linearGradient id="v" x1="0" x2="1"><stop offset="0" stop-color="${vidro}" stop-opacity=".95"/><stop offset=".55" stop-color="${vidro}" stop-opacity=".7"/><stop offset="1" stop-color="${tinta}" stop-opacity=".55"/></linearGradient>
  <linearGradient id="o" x1="0" x2="1"><stop offset="0" stop-color="#8a6a3a"/><stop offset=".5" stop-color="#e2c48f"/><stop offset="1" stop-color="#8a6a3a"/></linearGradient></defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <ellipse cx="300" cy="500" rx="130" ry="14" fill="${tinta}" opacity=".12"/>
  <rect x="268" y="150" width="64" height="58" rx="6" fill="url(#o)"/>
  <rect x="282" y="204" width="36" height="26" fill="${tinta}" opacity=".35"/>
  <rect x="190" y="226" width="220" height="270" rx="34" fill="url(#v)"/>
  <rect x="206" y="242" width="22" height="236" rx="11" fill="#fff" opacity=".35"/>
  <rect x="236" y="318" width="128" height="96" rx="4" fill="#fffdf9" opacity=".92"/>
  <text x="300" y="384" text-anchor="middle" font-family="Georgia,serif" font-size="54" fill="${tinta}">${letra}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
export function fotoDe(p) {
  return p.foto_url || frasco(p.nome, p.categoria);
}
