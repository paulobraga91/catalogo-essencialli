import * as db from './data.js?v=202610041909';

const $ = s => document.querySelector(s);
const { esc, moeda, temPreco, temPromo, precoFinal, fotoDe } = db;
const revenda = p => db.precoRevenda(p, st.cfg);
const CHAVE_SACOLA = 'ess_sacola';
const CHAVE_CLIENTE = 'ess_cliente';

const st = { produtos: [], porId: new Map(), cfg: { ...db.CONFIG_PADRAO }, sacola: lerJSON(CHAVE_SACOLA, {}), cat: 'Todos', tipo: 'Todos', busca: '', aberto: null };

function lerJSON(k, padrao) { try { return JSON.parse(localStorage.getItem(k)) || padrao; } catch { return padrao; } }
function gravarJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* navegador sem armazenamento */ } }

// Identificadores da Meta: _fbp (cookie do pixel) e fbclid (quem chegou por anúncio).
function guardarClique() {
  const fbclid = new URLSearchParams(location.search).get('fbclid');
  if (fbclid) gravarJSON('ess_fbc', `fb.1.${Date.now()}.${fbclid}`);
}
function cookie(nome) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + nome + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function idsMeta() {
  return { fbp: cookie('_fbp'), fbc: cookie('_fbc') || lerJSON('ess_fbc', null) };
}

async function iniciar() {
  guardarClique();
  if (db.MODO === 'demo') $('#demo').hidden = false;
  ligarEventos();
  try {
    [st.cfg, st.produtos] = await Promise.all([db.obterConfig(), db.listarProdutos()]);
  } catch (e) {
    console.error(e);
    $('#grade').innerHTML = '<p class="erro">Não foi possível carregar o catálogo agora. Tente de novo em instantes.</p>';
    return;
  }
  st.porId = new Map(st.produtos.map(p => [p.id, p]));
  for (const id of Object.keys(st.sacola)) {
    const p = st.porId.get(id);
    if (!p || p.esgotado) delete st.sacola[id];
  }
  gravarJSON(CHAVE_SACOLA, st.sacola);
  const cli = lerJSON(CHAVE_CLIENTE, {});
  $('#clienteNome').value = cli.nome || '';
  $('#clienteCidade').value = cli.cidade || '';
  aplicarConfig();
  renderChips();
  renderGrade();
  renderSacola();
  iniciarPixel();
  const pedido = new URLSearchParams(location.search).get('p');
  if (pedido && st.porId.has(pedido)) abrirDetalhe(pedido);
}

// ---------- Link de cada perfume ----------
function linkDoPerfume(id) {
  const u = new URL(location.href);
  u.search = '?p=' + encodeURIComponent(id);
  u.hash = '';
  return u.toString();
}

function mensagemDoPerfume(p) {
  const r = st.cfg.mostrar_precos && temPreco(p) ? ` por ${moeda(precoFinal(p))}` : '';
  return `Olha este perfume: *${p.nome}*${r}\n${linkDoPerfume(p.id)}`;
}

async function copiarLink(id) {
  try { await navigator.clipboard.writeText(linkDoPerfume(id)); toast('Link copiado'); }
  catch { prompt('Copie o link:', linkDoPerfume(id)); }
}

function aplicarConfig() {
  const c = st.cfg;
  $('#marcaNome').textContent = c.nome_loja;
  $('#marcaSub').textContent = c.subtitulo;
  $('#heroTitulo').textContent = c.titulo_hero || c.nome_loja;
  $('#heroAviso').textContent = c.aviso;
  $('#heroAviso').hidden = !c.aviso;
  document.title = `${c.nome_loja} · Catálogo`;
  renderBanner();
  const ig = String(c.instagram || '').replace(/^@/, '').trim();
  $('#rodape').innerHTML = `
    <p class="rodape-marca">${esc(c.nome_loja)}</p>
    <p>${esc(c.subtitulo)}</p>
    ${ig ? `<a href="https://instagram.com/${encodeURIComponent(ig)}" target="_blank" rel="noopener">@${esc(ig)}</a>` : ''}`;
}

// ---------- Banner de renda extra ----------
function renderBanner() {
  const c = st.cfg;
  const ativo = c.banner_ativo && c.banner_titulo && vendedorasAtivas().length > 0;
  $('#banner').hidden = !ativo;
  if (!ativo) return;
  const troca = t => String(t || '').replace(/\{minimo\}/g, Number(c.pedido_minimo) || 1);
  $('#bannerTitulo').textContent = troca(c.banner_titulo);
  $('#bannerTexto1').textContent = troca(c.banner_texto1);
  $('#bannerTexto2').textContent = troca(c.banner_texto2);
  $('#bannerTexto1').hidden = !c.banner_texto1;
  $('#bannerTexto2').hidden = !c.banner_texto2;
  $('#bannerBotao').textContent = c.banner_botao || 'Falar com uma vendedora';
}

function falarComVendedora() {
  const ativas = vendedorasAtivas();
  if (!ativas.length) return;
  const v = ativas[Math.floor(Math.random() * ativas.length)];
  pixel('Contact', { content_name: 'banner_revenda' });
  location.href = `https://wa.me/${telefoneWhats(v.telefone)}?text=${encodeURIComponent(st.cfg.banner_mensagem || '')}`;
}

// ---------- Vitrine ----------
// Abas por público; a segunda linha filtra pelo tipo (só aparece com mais de um tipo cadastrado).
const ABAS = [
  { rotulo: 'Todos', filtro: () => true },
  { rotulo: 'Masculinos', filtro: p => p.categoria === 'Masculino' },
  { rotulo: 'Femininos', filtro: p => p.categoria === 'Feminino' },
  { rotulo: 'Infantis', filtro: p => p.categoria === 'Infantil' }
];
const ROTULO_TIPO = { 'Perfume': 'Perfumes', 'Body splash': 'Body splash', 'Kit': 'Kits' };

function tiposPresentes() {
  return db.TIPOS.filter(t => st.produtos.some(p => p.tipo === t));
}

function renderChips() {
  $('#chips').innerHTML = ABAS.map(({ rotulo }) =>
    `<button class="chip ${rotulo === st.cat ? 'ativo' : ''}" data-cat="${esc(rotulo)}" role="tab">${esc(rotulo)}</button>`).join('');
  const tipos = tiposPresentes();
  $('#chipsTipo').hidden = tipos.length < 2;
  $('#chipsTipo').innerHTML = ['Todos', ...tipos].map(t =>
    `<button class="chip ${t === st.tipo ? 'ativo' : ''}" data-tipo="${esc(t)}">${esc(t === 'Todos' ? 'Todos os tipos' : ROTULO_TIPO[t] || t)}</button>`).join('');
}

function renderDestaques() {
  const lista = st.produtos.filter(p => p.destaque && !p.esgotado).slice(0, db.LIMITE_MAIS_VENDIDOS);
  const mostrar = lista.length > 0 && st.cat === 'Todos' && st.tipo === 'Todos' && !st.busca.trim();
  $('#destaques').hidden = !mostrar;
  $('#faixa').innerHTML = mostrar ? lista.map((p, i) => card(p, i + 1)).join('') : '';
  iniciarRolagem();
}

// Mais vendidos passam sozinhos a cada 3 s; param quando a pessoa toca ou passa o mouse e voltam depois.
let timerFaixa, timerRetomar, pausada = false;
function pausarFaixa(ms = 6000) { pausada = true; clearTimeout(timerRetomar); timerRetomar = setTimeout(() => { pausada = false; }, ms); }
function iniciarRolagem() {
  clearInterval(timerFaixa);
  const f = $('#faixa');
  if ($('#destaques').hidden || f.children.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const pausar = pausarFaixa;
  f.onpointerdown = () => pausar();
  f.onwheel = () => pausar();
  f.onpointerenter = e => { if (e.pointerType === 'mouse') { pausada = true; clearTimeout(timerRetomar); } };
  f.onpointerleave = e => { if (e.pointerType === 'mouse') pausar(1500); };
  timerFaixa = setInterval(() => {
    if (pausada || document.hidden || st.aberto || $('#sacola').classList.contains('aberta')) return;
    const passo = f.firstElementChild.getBoundingClientRect().width + 14;
    const noFim = f.scrollLeft + f.clientWidth >= f.scrollWidth - 4;
    f.scrollTo({ left: noFim ? 0 : f.scrollLeft + passo, behavior: 'smooth' });
  }, 3000);
}

function normalizar(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

function filtrados() {
  const b = normalizar(st.busca);
  return st.produtos
    .filter((ABAS.find(a => a.rotulo === st.cat) || ABAS[0]).filtro)
    .filter(p => st.tipo === 'Todos' || p.tipo === st.tipo)
    .filter(p => !b || normalizar([p.nome, p.notas, p.categoria, p.descricao].join(' ')).includes(b))
    .sort((a, b2) => Number(a.esgotado) - Number(b2.esgotado));
}

function precoHTML(p, classe = 'preco') {
  if (!st.cfg.mostrar_precos) return '';
  if (!temPreco(p)) return `<p class="${classe}"><span class="consulte">Consulte</span></p>`;
  if (temPromo(p)) return `<p class="${classe}"><s>${moeda(p.preco)}</s> <strong>${moeda(p.preco_promocional)}</strong></p>`;
  return `<p class="${classe}"><strong>${moeda(p.preco)}</strong></p>`;
}

function revendaHTML(p) {
  if (!st.cfg.mostrar_precos || !st.cfg.mostrar_revenda) return '';
  const r = revenda(p), custo = precoFinal(p);
  if (!r || !custo || r <= custo) return '';
  return `<p class="revenda"><span>Revenda sugerida <b>${moeda(r)}</b></span><span class="lucro">Lucro de ${moeda(r - custo)} por peça</span></p>`;
}

function selos(p) {
  if (p.esgotado) return '<span class="selo selo-esg">Esgotado</span>';
  const s = [];
  if (p.novidade) s.push('<span class="selo">Novidade</span>');
  if (p.destaque) s.push('<span class="selo selo-ouro">Mais vendido</span>');
  if (st.cfg.mostrar_precos && temPromo(p)) s.push('<span class="selo selo-promo">Oferta</span>');
  return s.join('');
}

function controle(p) {
  const q = st.sacola[p.id] || 0;
  if (p.esgotado) return '<button class="btn btn-linha" disabled>Indisponível</button>';
  if (!q) return '<button class="btn btn-escuro" data-acao="add">Adicionar</button>';
  return `<div class="stepper"><button data-acao="menos" aria-label="Diminuir">−</button><span>${q}</span><button data-acao="mais" aria-label="Aumentar">+</button></div>`;
}

function card(p, posicao) {
  const info = [p.categoria, p.tipo && p.tipo !== 'Perfume' ? p.tipo : '', p.volume].filter(Boolean).join(' · ');
  return `<article class="card ${p.esgotado ? 'is-esgotado' : ''}" data-id="${esc(p.id)}">
    <button class="card-foto" data-acao="ver" aria-label="Ver detalhes de ${esc(p.nome)}">
      <img src="${esc(fotoDe(p))}" alt="${esc(p.nome)}" loading="lazy">
      ${posicao ? `<span class="posicao">${posicao}º</span>` : `<div class="selos">${selos(p)}</div>`}
    </button>
    <div class="card-corpo">
      ${info ? `<p class="card-cat">${esc(info)}</p>` : ''}
      <h3 class="card-nome">${esc(p.nome)}</h3>
      ${p.notas ? `<p class="card-notas">${esc(p.notas)}</p>` : ''}
      ${precoHTML(p)}
      ${revendaHTML(p)}
      <div class="card-acao">${controle(p)}</div>
    </div>
  </article>`;
}

function renderGrade() {
  renderDestaques();
  const lista = filtrados();
  $('#grade').innerHTML = lista.map(p => card(p)).join('');
  $('#vazio').hidden = lista.length > 0;
  const n = lista.length;
  $('#contagem').textContent = n ? `${n} ${n === 1 ? 'perfume' : 'perfumes'}` : '';
  $('#vazio .vazio-titulo').textContent = st.produtos.length ? 'Nenhum perfume encontrado' : 'Catálogo em montagem';
  $('#vazio p:last-child').textContent = st.produtos.length ? 'Tente outra palavra ou outra aba.' : 'Volte em breve para ver os perfumes.';
}

function atualizarProduto(id) {
  const p = st.porId.get(id);
  if (p) document.querySelectorAll(`.card[data-id="${CSS.escape(id)}"] .card-acao`).forEach(el => { el.innerHTML = controle(p); });
  if (st.aberto === id) $('#modalAcao').innerHTML = controle(p);
  renderSacola();
}

// ---------- Pedido ----------
function itensSacola() {
  return Object.entries(st.sacola)
    .map(([id, q]) => ({ p: st.porId.get(id), q }))
    .filter(i => i.p && i.q > 0);
}

function totais() {
  const itens = itensSacola();
  const pecas = itens.reduce((s, i) => s + i.q, 0);
  const valor = itens.reduce((s, i) => s + (precoFinal(i.p) || 0) * i.q, 0);
  const semPreco = itens.some(i => !temPreco(i.p));
  return { itens, pecas, valor, semPreco };
}

function alterar(id, delta) {
  const p = st.porId.get(id);
  if (!p || p.esgotado) return;
  const antes = st.sacola[id] || 0;
  const q = Math.max(0, Math.min(999, antes + delta));
  if (q) st.sacola[id] = q; else delete st.sacola[id];
  gravarJSON(CHAVE_SACOLA, st.sacola);
  if (!antes && q) {
    toast(`${p.nome} adicionado ao pedido`);
    pixel('AddToCart', { content_ids: [p.id], content_name: p.nome, content_type: 'product', currency: 'BRL', value: precoFinal(p) || 0 });
  }
  atualizarProduto(id);
}

function renderSacola() {
  const { itens, pecas, valor, semPreco } = totais();
  const min = Number(st.cfg.pedido_minimo) || 0;
  const falta = Math.max(0, min - pecas);
  const mostrar = st.cfg.mostrar_precos;

  $('#contSacola').hidden = !pecas;
  $('#contSacola').textContent = pecas;
  $('#barraPedido').hidden = !pecas;
  $('#barraTexto').textContent = `${pecas} ${pecas === 1 ? 'peça' : 'peças'}${mostrar && valor ? ' · ' + moeda(valor) : ''}`;

  $('#sacolaItens').innerHTML = itens.length ? itens.map(({ p, q }) => `
    <div class="item" data-id="${esc(p.id)}">
      <img src="${esc(fotoDe(p))}" alt="">
      <div class="item-info">
        <p class="item-nome">${esc(p.nome)}</p>
        <p class="item-sub">${esc([p.volume, mostrar ? (temPreco(p) ? moeda(precoFinal(p)) + ' cada' : 'Consulte') : ''].filter(Boolean).join(' · '))}</p>
        <div class="stepper stepper-p"><button data-acao="menos" aria-label="Diminuir">−</button><span>${q}</span><button data-acao="mais" aria-label="Aumentar">+</button></div>
      </div>
      <button class="item-remover" data-acao="remover" aria-label="Remover">×</button>
    </div>`).join('') : `
    <div class="sacola-vazia">
      <p class="vazio-titulo">Seu pedido está vazio</p>
      <p>Toque em <b>Adicionar</b> nos perfumes que quiser.</p>
    </div>`;

  const pct = min ? Math.min(100, Math.round(pecas / min * 100)) : 100;
  $('#progresso').innerHTML = min ? `
    <p>${falta ? `Faltam <b>${falta} ${falta === 1 ? 'peça' : 'peças'}</b> para o pedido mínimo de ${min}` : `<b>Pedido mínimo atingido</b> ✓`}</p>
    <div class="trilho"><div class="trilho-cheio ${falta ? '' : 'ok'}" style="width:${pct}%"></div></div>` : '';

  $('#sacolaTotal').innerHTML = `
    <span>${pecas} ${pecas === 1 ? 'peça' : 'peças'}</span>
    ${mostrar && valor ? `<strong>${moeda(valor)}${semPreco ? '<small> + itens a consultar</small>' : ''}</strong>` : ''}`;

  // Quanto a pessoa fatura revendendo o pedido (só itens com preço e sugestão).
  let fat = 0, lucro = 0;
  for (const { p, q } of itens) {
    const r = revenda(p), c = precoFinal(p);
    if (r && c && r > c) { fat += r * q; lucro += (r - c) * q; }
  }
  const mostrarRev = mostrar && st.cfg.mostrar_revenda && lucro > 0;
  $('#sacolaRevenda').hidden = !mostrarRev;
  $('#sacolaRevenda').innerHTML = mostrarRev ? `
    <p>Revendendo este pedido pelo preço sugerido:</p>
    <p class="sacola-revenda-n"><span>Você fatura <b>${moeda(fat)}</b></span><span class="lucro">Lucro de <b>${moeda(lucro)}</b></span></p>
    <p class="sacola-revenda-nota">Valores de referência. O preço final de revenda é você quem decide.</p>` : '';

  $('#finalizar').disabled = !pecas || falta > 0;
}

function vendedorasAtivas() {
  return (st.cfg.vendedoras || []).filter(v => v.ativa && String(v.telefone || '').replace(/\D/g, ''));
}

function telefoneWhats(t) {
  const d = String(t).replace(/\D/g, '');
  return d.length === 10 || d.length === 11 ? '55' + d : d;
}

function montarMensagem({ itens, pecas, valor, semPreco }, nome, cidade) {
  const mostrar = st.cfg.mostrar_precos;
  const linhas = itens.map(({ p, q }) => {
    const v = mostrar && temPreco(p) ? ` (${moeda(precoFinal(p) * q)})` : '';
    return `• ${q}x ${p.nome}${p.volume ? ' ' + p.volume : ''}${v}`;
  });
  const total = mostrar && valor ? ` · ${moeda(valor)}${semPreco ? ' + itens a consultar' : ''}` : '';
  return [
    'Olá! Vim pelo catálogo e quero fazer este pedido:', '',
    ...linhas, '',
    `*Total: ${pecas} peças${total}*`, '',
    `Nome: ${nome}`,
    cidade ? `Cidade: ${cidade}` : ''
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
}

async function finalizar(e) {
  e.preventDefault();
  const t = totais();
  const nome = $('#clienteNome').value.trim();
  const cidade = $('#clienteCidade').value.trim();
  if (!nome) { $('#clienteNome').focus(); $('#clienteNome').classList.add('invalido'); toast('Digite seu nome para finalizar'); return; }
  if (!vendedorasAtivas().length) { toast('Atendimento indisponível no momento. Tente mais tarde.'); return; }
  gravarJSON(CHAVE_CLIENTE, { nome, cidade });

  const btn = $('#finalizar');
  btn.disabled = true;
  btn.lastChild.textContent = ' Abrindo WhatsApp…';

  const itens = t.itens.map(({ p, q }) => ({ id: p.id, nome: p.nome, volume: p.volume || '', qtd: q, preco: precoFinal(p) }));
  let vend;
  try {
    vend = await db.registrarPedido({ itens, nome, cidade, pecas: t.pecas, valor: t.valor, ...idsMeta() });
  } catch (err) {
    console.error(err);
    const ativas = vendedorasAtivas();
    vend = ativas[Math.floor(Math.random() * ativas.length)];
  }
  pixel('Lead', {
    currency: 'BRL', value: t.valor, num_items: t.pecas, content_type: 'product',
    content_ids: t.itens.map(i => i.p.id),
    contents: t.itens.map(i => ({ id: i.p.id, quantity: i.q, item_price: precoFinal(i.p) || 0 }))
  }, vend.pedido ? { eventID: `pedido-${vend.pedido}` } : undefined);

  const url = `https://wa.me/${telefoneWhats(vend.telefone)}?text=${encodeURIComponent(montarMensagem(t, nome, cidade))}`;
  st.sacola = {};
  gravarJSON(CHAVE_SACOLA, st.sacola);
  location.href = url;
}

// ---------- Detalhe ----------
function abrirDetalhe(id) {
  const p = st.porId.get(id);
  if (!p) return;
  st.aberto = id;
  const info = [p.categoria, p.tipo, p.volume].filter(Boolean).join(' · ');
  $('#modalCaixa').innerHTML = `
    <button class="fechar fechar-modal" data-fechar aria-label="Fechar">×</button>
    <div class="detalhe" data-id="${esc(p.id)}">
      <div class="detalhe-foto"><img src="${esc(fotoDe(p))}" alt="${esc(p.nome)}"><div class="selos">${selos(p)}</div></div>
      <div class="detalhe-info">
        ${info ? `<p class="card-cat">${esc(info)}</p>` : ''}
        <h2 class="detalhe-nome">${esc(p.nome)}</h2>
        ${precoHTML(p, 'preco preco-grande')}
        ${revendaHTML(p)}
        ${p.notas ? `<div class="detalhe-bloco"><p class="rotulo">Notas</p><p>${esc(p.notas)}</p></div>` : ''}
        ${p.descricao ? `<div class="detalhe-bloco"><p class="rotulo">Sobre</p><p>${esc(p.descricao).replace(/\n/g, '<br>')}</p></div>` : ''}
        <div class="detalhe-acao" id="modalAcao">${controle(p)}</div>
        <div class="detalhe-compartilhar">
          <a class="btn btn-linha-whats" href="https://wa.me/?text=${encodeURIComponent(mensagemDoPerfume(p))}" target="_blank" rel="noopener">Enviar no WhatsApp</a>
          <button class="btn btn-linha-suave" data-acao="copiar">Copiar link</button>
        </div>
      </div>
    </div>`;
  $('#modal').hidden = false;
  document.body.classList.add('travado');
  history.replaceState(null, '', linkDoPerfume(p.id));
  pixel('ViewContent', { content_ids: [p.id], content_name: p.nome, content_type: 'product' });
}

function fecharTudo() {
  if (st.aberto) { const u = new URL(location.href); u.search = ''; history.replaceState(null, '', u.toString()); }
  st.aberto = null;
  $('#modal').hidden = true;
  $('#sacola').classList.remove('aberta');
  $('#sacola').setAttribute('aria-hidden', 'true');
  $('#veu').hidden = true;
  document.body.classList.remove('travado');
}

let checkoutAvisado = false;
function abrirSacola() {
  fecharTudo();
  const t = totais();
  if (t.pecas && !checkoutAvisado) {
    checkoutAvisado = true;
    pixel('InitiateCheckout', { currency: 'BRL', value: t.valor, num_items: t.pecas, content_ids: t.itens.map(i => i.p.id), content_type: 'product' });
  }
  $('#sacola').classList.add('aberta');
  $('#sacola').setAttribute('aria-hidden', 'false');
  $('#veu').hidden = false;
  document.body.classList.add('travado');
}

// ---------- Eventos ----------
function ligarEventos() {
  document.addEventListener('click', e => {
    const chip = e.target.closest('[data-cat]');
    if (chip) { st.cat = chip.dataset.cat; renderChips(); renderGrade(); return; }
    const seta = e.target.closest('[data-seta]');
    if (seta) {
      const f = $('#faixa');
      pausarFaixa();
      f.scrollBy({ left: Number(seta.dataset.seta) * (f.firstElementChild.getBoundingClientRect().width + 14), behavior: 'smooth' });
      return;
    }
    const chipTipo = e.target.closest('[data-tipo]');
    if (chipTipo) { st.tipo = chipTipo.dataset.tipo; renderChips(); renderGrade(); return; }
    if (e.target.closest('[data-fechar]') || e.target === $('#veu') || e.target === $('#modal')) { fecharTudo(); return; }
    const alvo = e.target.closest('[data-acao]');
    if (!alvo) return;
    const id = alvo.closest('[data-id]')?.dataset.id;
    const acao = alvo.dataset.acao;
    if (acao === 'ver') abrirDetalhe(id);
    else if (acao === 'add' || acao === 'mais') alterar(id, 1);
    else if (acao === 'menos') alterar(id, -1);
    else if (acao === 'remover') alterar(id, -(st.sacola[id] || 0));
    else if (acao === 'copiar') copiarLink(id);
  });
  $('#abrirSacola').addEventListener('click', abrirSacola);
  $('#bannerBotao').addEventListener('click', falarComVendedora);
  $('#barraPedido').addEventListener('click', abrirSacola);
  $('#busca').addEventListener('input', e => { st.busca = e.target.value; renderGrade(); });
  $('#formPedido').addEventListener('submit', finalizar);
  $('#clienteNome').addEventListener('input', e => e.target.classList.remove('invalido'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharTudo(); });
  // Ao voltar do WhatsApp pelo botão "voltar", o navegador pode restaurar a página antiga da memória.
  window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
}

let tempoToast;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('visivel');
  clearTimeout(tempoToast);
  tempoToast = setTimeout(() => t.classList.remove('visivel'), 2200);
}

// ---------- Pixel da Meta (opcional) ----------
function iniciarPixel() {
  const id = String(st.cfg.pixel_id || '').replace(/\D/g, '');
  if (!id) return;
  /* eslint-disable */
  !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s) }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  // Só os eventos deste catálogo: sem PageView extra quando a ficha muda o endereço
  // e sem os cliques automáticos que o pixel registra sozinho em qualquer botão.
  window.fbq.disablePushState = true;
  window.fbq('set', 'autoConfig', false, id);
  window.fbq('init', id);
  window.fbq('track', 'PageView');
}
function pixel(evento, dados, opcoes) {
  if (window.fbq) window.fbq('track', evento, dados, opcoes);
}

iniciar();
