import * as db from './data.js?v=202610041909';

const $ = s => document.querySelector(s);
const { esc, moeda, temPreco, fotoDe } = db;

const st = { produtos: [], cfg: null, pedidos: null, aba: 'produtos', filtro: 'todos', busca: '', editando: null, novaFoto: undefined };

// ---------- Início e login ----------
async function iniciar() {
  if (db.MODO === 'demo') $('#demo').hidden = false;
  ligarEventos();
  const sessao = await db.sessaoAtual().catch(() => null);
  if (sessao) abrirPainel(); else $('#telaLogin').hidden = false;
}

async function entrar(e) {
  e.preventDefault();
  const btn = $('#btnEntrar');
  btn.disabled = true;
  $('#loginErro').hidden = true;
  try {
    await db.entrar($('#loginEmail').value.trim(), $('#loginSenha').value);
    $('#telaLogin').hidden = true;
    abrirPainel();
  } catch (err) {
    console.error(err);
    $('#loginErro').textContent = 'E-mail ou senha incorretos.';
    $('#loginErro').hidden = false;
  } finally {
    btn.disabled = false;
  }
}

async function abrirPainel() {
  $('#telaPainel').hidden = false;
  $('#abaProdutos').innerHTML = '<p class="carregando">Carregando…</p>';
  try {
    [st.produtos, st.cfg] = await Promise.all([db.listarProdutos({ todos: true }), db.obterConfig()]);
  } catch (err) {
    console.error(err);
    $('#abaProdutos').innerHTML = '<p class="erro">Não foi possível carregar. Verifique a internet e recarregue a página.</p>';
    return;
  }
  trocarAba(st.aba);
}

function trocarAba(aba) {
  st.aba = aba;
  document.querySelectorAll('#abas button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === aba));
  $('#abaProdutos').hidden = aba !== 'produtos';
  $('#abaPedidos').hidden = aba !== 'pedidos';
  $('#abaConfig').hidden = aba !== 'config';
  $('#abaRelatorios').hidden = aba !== 'relatorios';
  if (aba === 'produtos') renderProdutos();
  if (aba === 'pedidos') renderPedidos();
  if (aba === 'relatorios') renderRelatorios();
  if (aba === 'config') renderConfig();
}

// ---------- Perfumes ----------
function contagens() {
  const p = st.produtos;
  return {
    todos: p.length,
    venda: p.filter(x => x.visivel && !x.esgotado).length,
    esgotados: p.filter(x => x.esgotado).length,
    ocultos: p.filter(x => !x.visivel).length,
    sempreco: p.filter(x => !temPreco(x)).length,
    semcat: p.filter(x => !db.CATEGORIAS.includes(x.categoria)).length,
    semtipo: p.filter(x => !db.TIPOS.includes(x.tipo)).length,
    maisvendidos: p.filter(x => x.destaque).length
  };
}

function normalizar(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

function produtosFiltrados() {
  const b = normalizar(st.busca);
  const f = {
    todos: () => true,
    venda: x => x.visivel && !x.esgotado,
    esgotados: x => x.esgotado,
    ocultos: x => !x.visivel,
    sempreco: x => !temPreco(x),
    semcat: x => !db.CATEGORIAS.includes(x.categoria),
    semtipo: x => !db.TIPOS.includes(x.tipo),
    maisvendidos: x => x.destaque
  }[st.filtro];
  return st.produtos.filter(f).filter(x => !b || normalizar(`${x.nome} ${x.categoria} ${x.notas}`).includes(b));
}

function renderProdutos() {
  const c = contagens();
  const cartoes = [
    ['todos', 'Cadastrados', c.todos],
    ['venda', 'À venda', c.venda],
    ['esgotados', 'Esgotados', c.esgotados],
    ['sempreco', 'Sem preço', c.sempreco],
    ['semcat', 'Sem público', c.semcat],
    ['semtipo', 'Sem tipo', c.semtipo],
    ['maisvendidos', `Mais vendidos (máx. ${db.LIMITE_MAIS_VENDIDOS})`, c.maisvendidos],
    ['ocultos', 'Ocultos', c.ocultos]
  ];
  $('#abaProdutos').innerHTML = `
    <div class="cabecalho">
      <div><h1>Perfumes</h1><p class="sub">Tudo que muda aqui aparece no catálogo na hora.</p></div>
      <div class="cabecalho-botoes">
        <button class="btn btn-linha-escura" id="btnLote">⇪ Importar fotos</button>
        <button class="btn btn-ouro" id="btnNovo">+ Novo perfume</button>
      </div>
    </div>
    <div class="stats">${cartoes.map(([k, rotulo, n]) => `
      <button class="stat ${st.filtro === k ? 'ativo' : ''} ${(k === 'sempreco' || k === 'semcat' || k === 'semtipo') && n ? 'alerta' : ''}" data-filtro="${k}">
        <span class="stat-n">${n}</span><span class="stat-r">${rotulo}</span>
      </button>`).join('')}
    </div>
    <label class="busca adm-busca">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="admBusca" type="search" placeholder="Buscar pelo nome" value="${esc(st.busca)}" autocomplete="off">
    </label>
    <div class="lista" id="lista"></div>`;
  renderLista();
}

function renderLista() {
  const lista = produtosFiltrados();
  $('#lista').innerHTML = lista.length ? lista.map(p => `
    <div class="linha ${p.visivel ? '' : 'oculta'}" data-id="${esc(p.id)}">
      <img class="linha-foto" src="${esc(fotoDe(p))}" alt="" loading="lazy" data-acao="editar">
      <div class="linha-info" data-acao="editar">
        <strong>${esc(p.nome)}</strong>
        <span>${esc(p.volume || '')}</span>
        <span class="linha-preco ${temPreco(p) ? '' : 'falta'}">${temPreco(p) ? moeda(p.preco_promocional && Number(p.preco_promocional) < Number(p.preco) ? p.preco_promocional : p.preco) : 'Sem preço'}</span>
      </div>
      <div class="linha-chaves">
        <select class="linha-cat ${db.CATEGORIAS.includes(p.categoria) ? '' : 'falta'}" data-campo="categoria" aria-label="Público">${opcoes(db.CATEGORIAS, p.categoria, 'Público')}</select>
        <select class="linha-cat ${db.TIPOS.includes(p.tipo) ? '' : 'falta'}" data-campo="tipo" aria-label="Tipo">${opcoes(db.TIPOS, p.tipo, 'Tipo')}</select>
        <label class="chave chave-esg"><input type="checkbox" data-campo="esgotado" ${p.esgotado ? 'checked' : ''}><i></i>Esgotado</label>
        <label class="chave"><input type="checkbox" data-campo="visivel" ${p.visivel ? 'checked' : ''}><i></i>No catálogo</label>
        <label class="chave chave-mv"><input type="checkbox" data-campo="destaque" ${p.destaque ? 'checked' : ''}><i></i>Mais vendidos</label>
      </div>
      <div class="linha-botoes">
        <button data-acao="editar">Editar</button>
        <button data-acao="link" title="Copiar o link deste perfume para mandar no WhatsApp">Copiar link</button>
        <button data-acao="duplicar">Duplicar</button>
        <button data-acao="excluir" class="perigo">Excluir</button>
      </div>
    </div>`).join('') : `
    <div class="vazio">
      <p class="vazio-titulo">${st.produtos.length ? 'Nada neste filtro' : 'Nenhum perfume ainda'}</p>
      <p>${st.produtos.length ? 'Escolha outro filtro acima.' : 'Use <b>Importar fotos</b> para cadastrar vários de uma vez.'}</p>
    </div>`;
}

async function alternarCampo(id, campo, valor, input) {
  const p = st.produtos.find(x => x.id === id);
  if (campo === 'destaque' && valor && !cabeMaisVendido(id)) { input.checked = false; return; }
  const antes = p[campo];
  p[campo] = valor;
  try {
    Object.assign(p, await db.salvarProduto(p));
    toast(campo === 'categoria' || campo === 'tipo' ? `${campo === 'tipo' ? 'Tipo' : 'Público'}: ${valor}` : campo === 'destaque' ? (valor ? 'Incluído em Mais vendidos' : 'Tirado de Mais vendidos') : campo === 'esgotado' ? (valor ? 'Marcado como esgotado' : 'Voltou a ficar disponível') : (valor ? 'Aparece no catálogo' : 'Escondido do catálogo'));
    renderProdutos();
  } catch (err) {
    console.error(err);
    p[campo] = antes;
    if (input.tagName === 'SELECT') input.value = antes || ''; else input.checked = antes;
    toast('Não foi possível salvar. Tente de novo.');
  }
}

// ---------- Editor ----------
function opcoes(lista, atual, rotulo) {
  const itens = lista.includes(atual) ? lista : ['', ...lista];
  return itens.map(c => `<option value="${esc(c)}" ${c === (atual || '') ? 'selected' : ''}>${c || rotulo + '?'}</option>`).join('');
}

function cabeMaisVendido(id) {
  const n = st.produtos.filter(x => x.destaque && x.id !== id).length;
  if (n < db.LIMITE_MAIS_VENDIDOS) return true;
  toast(`Já tem ${db.LIMITE_MAIS_VENDIDOS} em Mais vendidos. Tire um antes de incluir outro.`);
  return false;
}

function precoTexto(v) {
  return v == null || v === '' ? '' : Number(v).toFixed(2).replace('.', ',');
}
function lerPreco(s) {
  const t = String(s || '').replace(/[^\d,.]/g, '').trim();
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function abrirEditor(p) {
  st.editando = p ? { ...p } : { nome: '', categoria: '', volume: '', notas: '', descricao: '', preco: null, preco_promocional: null, foto_url: null, esgotado: false, visivel: true, destaque: false, novidade: false, ordem: st.produtos.length };
  st.novaFoto = undefined;
  const e = st.editando;
  $('#formEditor').innerHTML = `
    <div class="editor-topo">
      <h2>${p ? 'Editar perfume' : 'Novo perfume'}</h2>
      <button type="button" class="fechar" data-fechar aria-label="Fechar">×</button>
    </div>
    <div class="editor-corpo">
      <div class="editor-foto">
        <label class="foto-area" id="fotoArea">
          <img id="fotoPrevia" src="${esc(fotoDe(e))}" alt="">
          <span class="foto-dica">${e.foto_url ? 'Trocar foto' : 'Adicionar foto'}</span>
          <input type="file" id="fotoArquivo" accept="image/*" hidden>
        </label>
        <button type="button" class="link-acao" id="fotoRemover" ${e.foto_url ? '' : 'hidden'}>Remover foto</button>
      </div>
      <div class="editor-campos">
        <label class="campo largo">Nome do perfume *<input name="nome" value="${esc(e.nome)}" maxlength="80" required></label>
        <label class="campo">Público<select name="categoria">${opcoes(db.CATEGORIAS, e.categoria, 'Público')}</select></label>
        <label class="campo">Tipo<select name="tipo">${opcoes(db.TIPOS, e.tipo, 'Tipo')}</select></label>
        <label class="campo">Tamanho<input name="volume" value="${esc(e.volume)}" maxlength="20" placeholder="Ex.: 100 ml"></label>
        <label class="campo">Preço (R$)<input name="preco" value="${precoTexto(e.preco)}" inputmode="decimal" placeholder="Vazio = Consulte"></label>
        <label class="campo">Preço promocional (R$)<input name="preco_promocional" value="${precoTexto(e.preco_promocional)}" inputmode="decimal" placeholder="Opcional"></label>
        <label class="campo largo">Preço de revenda sugerido (R$)<input name="preco_revenda" value="${precoTexto(e.preco_revenda)}" inputmode="decimal" placeholder="Vazio = automático (preço × ${String(st.cfg.multiplicador_revenda || 2).replace('.', ',')})"><small id="dicaRevenda"></small></label>
        <label class="campo largo">Notas / família olfativa<input name="notas" value="${esc(e.notas)}" maxlength="120" placeholder="Ex.: Floral · baunilha · almíscar"></label>
        <label class="campo largo">Descrição<textarea name="descricao" rows="3" maxlength="600" placeholder="Opcional">${esc(e.descricao)}</textarea></label>
        <div class="campo largo chaves-grade">
          <label class="chave chave-esg"><input type="checkbox" name="esgotado" ${e.esgotado ? 'checked' : ''}><i></i>Esgotado</label>
          <label class="chave"><input type="checkbox" name="visivel" ${e.visivel ? 'checked' : ''}><i></i>No catálogo</label>
          <label class="chave"><input type="checkbox" name="destaque" ${e.destaque ? 'checked' : ''}><i></i>Incluir em Mais vendidos</label>
          <label class="chave"><input type="checkbox" name="novidade" ${e.novidade ? 'checked' : ''}><i></i>Selo "Novidade"</label>
        </div>
        <label class="campo">Posição na vitrine<input name="ordem" type="number" value="${Number(e.ordem) || 0}" min="0" step="1"><small>Número menor aparece primeiro</small></label>
      </div>
    </div>
    <div class="editor-rodape">
      <button type="button" class="btn btn-linha" data-fechar>Cancelar</button>
      <button type="submit" class="btn btn-escuro" id="btnSalvar">Salvar perfume</button>
    </div>`;
  $('#modalEditor').hidden = false;
  document.body.classList.add('travado');
  atualizarDicaRevenda();
  if (!p) $('#formEditor [name=nome]').focus();
}

// Mostra, enquanto digita, quanto a revendedora vai ver no catálogo.
function atualizarDicaRevenda() {
  const el = $('#dicaRevenda');
  if (!el) return;
  const f = $('#formEditor');
  const p = { preco: lerPreco(f.preco.value), preco_promocional: lerPreco(f.preco_promocional.value), preco_revenda: lerPreco(f.preco_revenda.value) };
  const r = db.precoRevenda(p, st.cfg), c = db.precoFinal(p);
  el.textContent = r && c && r > c ? `No catálogo: revenda ${moeda(r)} · lucro de ${moeda(r - c)} por peça` : 'Preencha o preço para calcular a sugestão.';
}

async function escolherFoto(file) {
  if (!file) return;
  try {
    st.novaFoto = await db.comprimirImagem(file);
    $('#fotoPrevia').src = URL.createObjectURL(st.novaFoto);
    $('#fotoRemover').hidden = false;
    $('#fotoArea .foto-dica').textContent = 'Trocar foto';
  } catch (err) {
    toast(err.message || 'Não foi possível ler essa imagem.');
  }
}

async function salvarEditor(ev) {
  ev.preventDefault();
  const f = new FormData($('#formEditor'));
  const nome = String(f.get('nome') || '').trim();
  if (!nome) { $('#formEditor [name=nome]').focus(); toast('Dê um nome ao perfume'); return; }
  const preco = lerPreco(f.get('preco'));
  let promo = lerPreco(f.get('preco_promocional'));
  const revendaSug = lerPreco(f.get('preco_revenda'));
  if (revendaSug && revendaSug <= (promo || preco || 0)) { toast('O preço de revenda precisa ser maior que o preço do catálogo'); return; }
  if (promo && (!preco || promo >= preco)) { toast('O preço promocional precisa ser menor que o preço normal'); return; }
  if (f.has('destaque') && !st.editando.destaque && !cabeMaisVendido(st.editando.id)) return;
  const btn = $('#btnSalvar');
  btn.disabled = true;
  btn.textContent = 'Salvando…';
  try {
    let foto_url = st.editando.foto_url;
    if (st.novaFoto === null) foto_url = null;
    else if (st.novaFoto) foto_url = await db.enviarFoto(st.novaFoto);
    const dados = {
      ...st.editando, nome, foto_url, preco, preco_promocional: promo, preco_revenda: revendaSug,
      categoria: String(f.get('categoria') || '').trim(),
      tipo: String(f.get('tipo') || '').trim(),
      volume: String(f.get('volume') || '').trim(),
      notas: String(f.get('notas') || '').trim(),
      descricao: String(f.get('descricao') || '').trim(),
      ordem: Math.max(0, parseInt(f.get('ordem'), 10) || 0),
      esgotado: f.has('esgotado'), visivel: f.has('visivel'), destaque: f.has('destaque'), novidade: f.has('novidade')
    };
    const salvo = await db.salvarProduto(dados);
    const i = st.produtos.findIndex(x => x.id === salvo.id);
    if (i >= 0) st.produtos[i] = salvo; else st.produtos.push(salvo);
    fecharModais();
    toast('Perfume salvo');
    renderProdutos();
  } catch (err) {
    console.error(err);
    toast(err.message?.includes('espaço') ? err.message : 'Não foi possível salvar. Tente de novo.');
    btn.disabled = false;
    btn.textContent = 'Salvar perfume';
  }
}

async function duplicar(id) {
  const p = st.produtos.find(x => x.id === id);
  const { id: _, criado_em, atualizado_em, ...resto } = p;
  try {
    const novo = await db.salvarProduto({ ...resto, nome: `${p.nome} (cópia)`, visivel: false, destaque: false });
    st.produtos.push(novo);
    toast('Cópia criada (escondida do catálogo até você editar)');
    renderProdutos();
  } catch (err) { console.error(err); toast('Não foi possível duplicar.'); }
}

async function excluir(id) {
  const p = st.produtos.find(x => x.id === id);
  if (!await confirmar(`Excluir "${p.nome}" de vez? Se for só falta de estoque, use "Esgotado".`)) return;
  try {
    await db.excluirProduto(id);
    st.produtos = st.produtos.filter(x => x.id !== id);
    toast('Perfume excluído');
    renderProdutos();
  } catch (err) { console.error(err); toast('Não foi possível excluir.'); }
}

// Cada foto vira um perfume, com o nome do arquivo. Preço e detalhes são preenchidos depois.
function nomeDoArquivo(nome) {
  const base = nome.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base.replace(/(^|\s)(\p{L})/gu, (m, esp, l) => esp + l.toUpperCase()) || 'Perfume sem nome';
}

async function importarLote(arquivos) {
  const lista = [...arquivos].filter(f => f.type.startsWith('image/'));
  if (!lista.length) return;
  let feitos = 0, falhas = 0;
  let ordem = st.produtos.reduce((m, p) => Math.max(m, Number(p.ordem) || 0), 0);
  for (const arq of lista) {
    toast(`Importando ${feitos + falhas + 1} de ${lista.length}…`);
    try {
      const blob = await db.comprimirImagem(arq);
      const foto_url = await db.enviarFoto(blob);
      const novo = await db.salvarProduto({
        nome: nomeDoArquivo(arq.name), categoria: '', tipo: '', volume: '', notas: '', descricao: '',
        preco: null, preco_promocional: null, foto_url,
        esgotado: false, visivel: true, destaque: false, novidade: false, ordem: ++ordem
      });
      st.produtos.push(novo);
      feitos++;
    } catch (err) {
      console.error(arq.name, err);
      falhas++;
      if (err.message?.includes('espaço')) break;
    }
  }
  st.filtro = 'todos';
  renderProdutos();
  toast(`${feitos} ${feitos === 1 ? 'perfume importado' : 'perfumes importados'}${falhas ? ` · ${falhas} com erro` : ''}. Agora preencha os preços.`);
}

// ---------- Pedidos ----------
const STATUS = {
  enviado: { rotulo: 'Aguardando', classe: 'st-enviado' },
  vendido: { rotulo: 'Vendido', classe: 'st-vendido' },
  nao_fechou: { rotulo: 'Não fechou', classe: 'st-nao' }
};
const dataCurta = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

async function carregarPedidos() {
  st.pedidos = await db.listarPedidos();
  return st.pedidos;
}

async function renderPedidos() {
  const alvo = $('#abaPedidos');
  alvo.innerHTML = '<p class="carregando">Carregando…</p>';
  try { await carregarPedidos(); }
  catch (err) { console.error(err); alvo.innerHTML = '<p class="erro">Não foi possível carregar os pedidos.</p>'; return; }
  st.filtroPedido = st.filtroPedido || 'enviado';
  const conta = k => st.pedidos.filter(p => (p.status || 'enviado') === k).length;
  const lista = st.pedidos.filter(p => st.filtroPedido === 'todos' || (p.status || 'enviado') === st.filtroPedido);

  alvo.innerHTML = `
    <div class="cabecalho"><div><h1>Pedidos</h1><p class="sub">Cada pedido enviado pelo catálogo para o WhatsApp. Quando a venda fechar (ou não), marque aqui: é isso que alimenta os Relatórios.</p></div></div>
    <div class="stats">
      ${[['enviado', 'Aguardando retorno'], ['vendido', 'Vendidos'], ['nao_fechou', 'Não fecharam'], ['todos', 'Todos']].map(([k, r]) => `
        <button class="stat ${st.filtroPedido === k ? 'ativo' : ''} ${k === 'enviado' && conta(k) ? 'alerta' : ''}" data-filtro-pedido="${k}">
          <span class="stat-n">${k === 'todos' ? st.pedidos.length : conta(k)}</span><span class="stat-r">${r}</span>
        </button>`).join('')}
    </div>
    <div class="pedidos">${lista.length ? lista.map(p => {
      const s = STATUS[p.status || 'enviado'];
      return `
      <div class="pedido" data-pedido="${p.id}">
        <div class="pedido-linha">
          <span class="pedido-data">${dataCurta(p.criado_em)}</span>
          <span class="pedido-cliente"><b>${esc(p.cliente_nome)}</b>${p.cliente_cidade ? ` · ${esc(p.cliente_cidade)}` : ''}</span>
          <span class="pedido-vend">→ ${esc(p.vendedora_nome || '—')}</span>
          <span class="pedido-tot">${p.total_pecas} peças${p.total_valor ? ` · ${moeda(p.total_valor)}` : ''}</span>
          <span class="status ${s.classe}">${s.rotulo}${p.status === 'vendido' && p.valor_venda ? ` · ${moeda(p.valor_venda)}` : ''}</span>
          ${p.status === 'vendido' && st.cfg.pixel_id ? (p.compra_enviada_meta ? '<span class="meta-ok">✓ Na Meta</span>' : '<button class="link-acao" data-pedido-acao="meta">Reenviar para a Meta</button>') : ''}
        </div>
        <details><summary>Ver itens</summary>
          <ul>${(p.itens || []).map(i => `<li>${i.qtd}x ${esc(i.nome)}${i.volume ? ' ' + esc(i.volume) : ''}${i.preco ? ` · ${moeda(i.preco)} cada` : ''}</li>`).join('')}</ul>
        </details>
        <div class="pedido-acoes">
          ${p.status === 'vendido' || p.status === 'nao_fechou'
            ? `<button class="link-acao" data-pedido-acao="reabrir">Voltar para aguardando</button>`
            : `<label class="valor-venda">Valor da venda (R$)<input inputmode="decimal" value="${p.total_valor ? Number(p.total_valor).toFixed(2).replace('.', ',') : ''}" placeholder="0,00"></label>
               <button class="btn btn-vendido" data-pedido-acao="vendido">✓ Vendido</button>
               <button class="btn btn-linha" data-pedido-acao="nao_fechou">Não fechou</button>`}
        </div>
      </div>`;
    }).join('') : '<div class="vazio"><p class="vazio-titulo">Nenhum pedido aqui</p><p>Quando alguém finalizar pelo catálogo, aparece em "Aguardando retorno".</p></div>'}
    </div>`;
}

async function mudarStatusPedido(id, acao, el) {
  const p = st.pedidos.find(x => x.id === id);
  let dados;
  if (acao === 'vendido') {
    const valor = lerPreco(el.closest('.pedido').querySelector('.valor-venda input')?.value);
    if (!valor) { toast('Digite o valor da venda'); return; }
    dados = { status: 'vendido', valor_venda: valor, fechado_em: new Date().toISOString() };
  } else if (acao === 'nao_fechou') {
    dados = { status: 'nao_fechou', valor_venda: null, fechado_em: new Date().toISOString() };
  } else {
    dados = { status: 'enviado', valor_venda: null, fechado_em: null };
  }
  try {
    Object.assign(p, await db.atualizarPedido(id, dados));
    toast(acao === 'vendido' ? 'Venda registrada' : acao === 'nao_fechou' ? 'Marcado como não fechou' : 'Voltou para aguardando');
    renderPedidos();
  } catch (err) { console.error(err); toast('Não foi possível salvar.'); return; }
  if (acao === 'vendido' && st.cfg.pixel_id) enviarParaMeta(id, true);
}

// A venda vai para a Meta como "Compra"; se falhar, o pedido mostra "Reenviar para a Meta".
async function enviarParaMeta(id, silencioso = false) {
  const p = st.pedidos.find(x => x.id === id);
  try {
    await db.enviarCompraMeta(id);
    p.compra_enviada_meta = true;
    if (!silencioso) toast('Venda enviada para a Meta');
  } catch (err) {
    console.error(err);
    p.compra_enviada_meta = false;
    toast('A venda foi salva, mas não chegou na Meta. Use "Reenviar para a Meta".');
  }
  if (st.aba === 'pedidos') renderPedidos();
}

// ---------- Relatórios ----------
const PERIODOS = [['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['mes', 'Este mês'], ['tudo', 'Tudo']];
function inicioPeriodo(k) {
  const d = new Date();
  if (k === 'hoje') { d.setHours(0, 0, 0, 0); return d; }
  if (k === 'mes') return new Date(d.getFullYear(), d.getMonth(), 1);
  if (k === 'tudo') return new Date(0);
  d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (Number(k) - 1)); return d;
}

async function renderRelatorios() {
  const alvo = $('#abaRelatorios');
  alvo.innerHTML = '<p class="carregando">Carregando…</p>';
  try { await carregarPedidos(); }
  catch (err) { console.error(err); alvo.innerHTML = '<p class="erro">Não foi possível carregar os relatórios.</p>'; return; }
  st.periodo = st.periodo || '30';
  const ini = inicioPeriodo(st.periodo);
  const peds = st.pedidos.filter(p => new Date(p.criado_em) >= ini);
  const vend = peds.filter(p => p.status === 'vendido');
  const decididos = peds.filter(p => p.status === 'vendido' || p.status === 'nao_fechou').length;
  const fat = vend.reduce((s, p) => s + Number(p.valor_venda || 0), 0);
  const pct = n => decididos ? Math.round(n / decididos * 100) + '%' : '—';

  const porVend = {};
  for (const p of peds) {
    const k = p.vendedora_nome || '—';
    const o = porVend[k] ||= { pedidos: 0, vendidos: 0, nao: 0, fat: 0 };
    o.pedidos++;
    if (p.status === 'vendido') { o.vendidos++; o.fat += Number(p.valor_venda || 0); }
    if (p.status === 'nao_fechou') o.nao++;
  }
  const porProd = {};
  for (const p of peds) for (const i of p.itens || []) {
    const o = porProd[i.nome] ||= { pedidas: 0, vendidas: 0 };
    o.pedidas += i.qtd;
    if (p.status === 'vendido') o.vendidas += i.qtd;
  }
  const topProd = Object.entries(porProd).sort((a, b) => b[1].pedidas - a[1].pedidas).slice(0, 10);
  const maxProd = topProd[0]?.[1].pedidas || 1;

  alvo.innerHTML = `
    <div class="cabecalho"><div><h1>Relatórios</h1><p class="sub">Pedidos que chegaram pelo catálogo e quantos viraram venda. A venda conta quando alguém marca "Vendido" na aba Pedidos.</p></div></div>
    <div class="periodos">${PERIODOS.map(([k, r]) => `<button class="chip ${st.periodo === k ? 'ativo' : ''}" data-periodo="${k}">${r}</button>`).join('')}</div>
    <div class="stats stats-rel">
      <div class="stat"><span class="stat-n">${peds.length}</span><span class="stat-r">Pedidos enviados</span></div>
      <div class="stat"><span class="stat-n">${vend.length}</span><span class="stat-r">Vendas fechadas</span></div>
      <div class="stat"><span class="stat-n">${pct(vend.length)}</span><span class="stat-r">Taxa de fechamento</span></div>
      <div class="stat"><span class="stat-n">${moeda(fat)}</span><span class="stat-r">Faturamento</span></div>
      <div class="stat"><span class="stat-n">${vend.length ? moeda(fat / vend.length) : '—'}</span><span class="stat-r">Ticket médio</span></div>
      <div class="stat ${peds.filter(p => (p.status || 'enviado') === 'enviado').length ? 'alerta' : ''}"><span class="stat-n">${peds.filter(p => (p.status || 'enviado') === 'enviado').length}</span><span class="stat-r">Sem retorno ainda</span></div>
    </div>
    <p class="ajuda rel-nota">Taxa de fechamento = vendidos ÷ (vendidos + não fecharam). Pedidos ainda aguardando retorno não entram na conta.</p>

    <div class="rel-grade">
      <section class="rel-bloco">
        <h2>Por vendedora</h2>
        ${Object.keys(porVend).length ? `<table class="tabela">
          <thead><tr><th>Vendedora</th><th>Pedidos</th><th>Vendidos</th><th>Fechamento</th><th>Faturamento</th></tr></thead>
          <tbody>${Object.entries(porVend).sort((a, b) => b[1].fat - a[1].fat).map(([n, o]) => `
            <tr><td>${esc(n)}</td><td>${o.pedidos}</td><td>${o.vendidos}</td><td>${o.vendidos + o.nao ? Math.round(o.vendidos / (o.vendidos + o.nao) * 100) + '%' : '—'}</td><td>${moeda(o.fat)}</td></tr>`).join('')}
          </tbody></table>` : '<p class="ajuda">Sem pedidos no período.</p>'}
      </section>
      <section class="rel-bloco">
        <h2>Perfumes mais pedidos</h2>
        ${topProd.length ? `<ol class="barras">${topProd.map(([n, o]) => `
          <li><span class="barra-nome">${esc(n)}</span>
            <span class="barra-n">${o.pedidas} pç${o.vendidas ? ` · ${o.vendidas} vendidas` : ''}</span>
            <span class="barra-trilho"><span class="barra-cheia" style="width:${Math.round(o.pedidas / maxProd * 100)}%"></span></span></li>`).join('')}
        </ol>` : '<p class="ajuda">Sem pedidos no período.</p>'}
      </section>
    </div>`;
}

// ---------- Configurações ----------
function linhaVendedora(v = { nome: '', telefone: '', ativa: true }) {
  return `<div class="vendedora">
    <input class="v-nome" placeholder="Nome" value="${esc(v.nome)}" maxlength="40">
    <input class="v-tel" placeholder="(88) 99999-9999" value="${esc(v.telefone)}" inputmode="tel" maxlength="20">
    <label class="chave"><input type="checkbox" class="v-ativa" ${v.ativa ? 'checked' : ''}><i></i>Recebe pedidos</label>
    <button type="button" class="link-acao perigo" data-acao="remover-vend">Remover</button>
  </div>`;
}

function renderConfig() {
  const c = st.cfg;
  $('#abaConfig').innerHTML = `
    <div class="cabecalho"><div><h1>Configurações</h1><p class="sub">Textos da vitrine, regras do pedido e quem atende.</p></div></div>
    <form id="formConfig" class="config">
      <fieldset>
        <legend>Vendedoras que recebem os pedidos</legend>
        <p class="ajuda">Os pedidos são distribuídos <b>um para cada</b>, na ordem, entre as vendedoras marcadas como "Recebe pedidos". Use o número com DDD.</p>
        <div id="vendedoras">${(c.vendedoras || []).map(linhaVendedora).join('') || linhaVendedora()}</div>
        <button type="button" class="link-acao" id="addVend">+ Adicionar vendedora</button>
      </fieldset>
      <fieldset>
        <legend>Regras do pedido</legend>
        <label class="campo">Pedido mínimo (peças)<input name="pedido_minimo" type="number" min="0" step="1" value="${Number(c.pedido_minimo) || 0}"><small>0 = sem mínimo</small></label>
        <label class="chave"><input type="checkbox" name="mostrar_precos" ${c.mostrar_precos ? 'checked' : ''}><i></i>Mostrar preços no catálogo</label>
      </fieldset>
      <fieldset>
        <legend>Sugestão de revenda</legend>
        <p class="ajuda">Cada perfume mostra o preço sugerido para revender e o lucro por peça. Por padrão é o preço do catálogo multiplicado pelo número abaixo; cada perfume pode ter o seu valor próprio no cadastro.</p>
        <label class="campo">Multiplicar o preço por<input name="multiplicador_revenda" inputmode="decimal" value="${String(c.multiplicador_revenda ?? 2).replace('.', ',')}"><small>2 = o dobro do preço</small></label>
        <label class="chave"><input type="checkbox" name="mostrar_revenda" ${c.mostrar_revenda ? 'checked' : ''}><i></i>Mostrar sugestão de revenda</label>
      </fieldset>
      <fieldset>
        <legend>Banner de renda extra</legend>
        <p class="ajuda">Aparece no topo do catálogo. O botão abre o WhatsApp de uma vendedora com a mensagem abaixo. Use <b>{minimo}</b> para mostrar o pedido mínimo.</p>
        <label class="chave largo-chave"><input type="checkbox" name="banner_ativo" ${c.banner_ativo ? 'checked' : ''}><i></i>Mostrar o banner</label>
        <label class="campo largo">Título<input name="banner_titulo" value="${esc(c.banner_titulo)}" maxlength="60"></label>
        <label class="campo largo">Texto para quem já revende<textarea name="banner_texto1" rows="2" maxlength="180">${esc(c.banner_texto1)}</textarea></label>
        <label class="campo largo">Texto para quem quer começar<textarea name="banner_texto2" rows="2" maxlength="180">${esc(c.banner_texto2)}</textarea></label>
        <label class="campo">Texto do botão<input name="banner_botao" value="${esc(c.banner_botao)}" maxlength="30"></label>
        <label class="campo">Mensagem que chega no WhatsApp<input name="banner_mensagem" value="${esc(c.banner_mensagem)}" maxlength="200"></label>
      </fieldset>
      <fieldset>
        <legend>Textos da vitrine</legend>
        <label class="campo">Nome da loja<input name="nome_loja" value="${esc(c.nome_loja)}" maxlength="40"></label>
        <label class="campo">Linha abaixo do nome<input name="subtitulo" value="${esc(c.subtitulo)}" maxlength="40"></label>
        <label class="campo largo">Frase de destaque<input name="titulo_hero" value="${esc(c.titulo_hero)}" maxlength="70"></label>
        <label class="campo largo">Aviso do topo<input name="aviso" value="${esc(c.aviso)}" maxlength="70" placeholder="Ex.: Atacado · pedido mínimo de 6 peças"></label>
        <label class="campo">Instagram<input name="instagram" value="${esc(c.instagram)}" maxlength="40" placeholder="@perfil"></label>
      </fieldset>
      <fieldset>
        <legend>Rastreamento (agência)</legend>
        <label class="campo">ID do Pixel da Meta<input name="pixel_id" value="${esc(c.pixel_id)}" inputmode="numeric" maxlength="20"><small>Preenchido pela PB5. Deixe em branco se não souber.</small></label>
      </fieldset>
      <div class="config-rodape"><button class="btn btn-escuro" type="submit" id="btnConfig">Salvar configurações</button></div>
    </form>`;
}

async function salvarConfig(ev) {
  ev.preventDefault();
  const f = new FormData($('#formConfig'));
  const vendedoras = [...document.querySelectorAll('.vendedora')].map(el => ({
    nome: el.querySelector('.v-nome').value.trim(),
    telefone: el.querySelector('.v-tel').value.trim(),
    ativa: el.querySelector('.v-ativa').checked
  })).filter(v => v.nome || v.telefone);
  const invalida = vendedoras.find(v => { const d = v.telefone.replace(/\D/g, ''); return d.length < 10 || d.length > 13; });
  if (invalida) { toast(`Confira o telefone de ${invalida.nome || 'uma vendedora'} (com DDD)`); return; }
  if (!vendedoras.some(v => v.ativa)) { toast('Deixe pelo menos uma vendedora recebendo pedidos'); return; }
  const novo = {
    vendedoras,
    pedido_minimo: Math.max(0, parseInt(f.get('pedido_minimo'), 10) || 0),
    mostrar_precos: f.has('mostrar_precos'),
    nome_loja: String(f.get('nome_loja')).trim() || db.CONFIG_PADRAO.nome_loja,
    subtitulo: String(f.get('subtitulo')).trim(),
    titulo_hero: String(f.get('titulo_hero')).trim(),
    aviso: String(f.get('aviso')).trim(),
    instagram: String(f.get('instagram')).trim(),
    pixel_id: String(f.get('pixel_id')).replace(/\D/g, ''),
    multiplicador_revenda: Number(String(f.get('multiplicador_revenda')).replace(',', '.')) || 2,
    mostrar_revenda: f.has('mostrar_revenda'),
    banner_ativo: f.has('banner_ativo'),
    banner_titulo: String(f.get('banner_titulo')).trim(),
    banner_texto1: String(f.get('banner_texto1')).trim(),
    banner_texto2: String(f.get('banner_texto2')).trim(),
    banner_botao: String(f.get('banner_botao')).trim(),
    banner_mensagem: String(f.get('banner_mensagem')).trim()
  };
  if (novo.multiplicador_revenda <= 1 || novo.multiplicador_revenda > 10) { toast('O multiplicador precisa ficar entre 1 e 10 (ex.: 2)'); return; }
  const btn = $('#btnConfig');
  btn.disabled = true;
  try {
    await db.salvarConfig(novo);
    st.cfg = { ...st.cfg, ...novo };
    toast('Configurações salvas');
  } catch (err) { console.error(err); toast('Não foi possível salvar.'); }
  finally { btn.disabled = false; }
}

// ---------- Link do perfume (a vendedora cola no WhatsApp da cliente) ----------
async function copiarLink(id) {
  const p = st.produtos.find(x => x.id === id);
  if (!p.visivel) { toast('Este perfume está escondido do catálogo. Ligue "No catálogo" antes de mandar o link.'); return; }
  const link = new URL('index.html?p=' + encodeURIComponent(id), location.href).toString();
  try { await navigator.clipboard.writeText(link); toast('Link copiado. É só colar no WhatsApp.'); }
  catch { prompt('Copie o link:', link); }
}

// ---------- Utilidades ----------
function fecharModais() {
  $('#modalEditor').hidden = true;
  $('#modalConfirma').hidden = true;
  document.body.classList.remove('travado');
}

function confirmar(texto) {
  return new Promise(ok => {
    $('#confirmaTexto').textContent = texto;
    $('#modalConfirma').hidden = false;
    const fim = r => { $('#modalConfirma').hidden = true; $('#confirmaSim').onclick = $('#confirmaNao').onclick = null; ok(r); };
    $('#confirmaSim').onclick = () => fim(true);
    $('#confirmaNao').onclick = () => fim(false);
  });
}

let tempoToast;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('visivel');
  clearTimeout(tempoToast);
  tempoToast = setTimeout(() => t.classList.remove('visivel'), 2600);
}

function ligarEventos() {
  $('#formLogin').addEventListener('submit', entrar);
  $('#btnSair').addEventListener('click', async () => { await db.sair(); location.reload(); });
  $('#abas').addEventListener('click', e => { const b = e.target.closest('[data-aba]'); if (b) trocarAba(b.dataset.aba); });
  $('#arquivoLote').addEventListener('change', e => { importarLote(e.target.files); e.target.value = ''; });
  $('#formEditor').addEventListener('submit', salvarEditor);

  document.addEventListener('click', e => {
    if (e.target.closest('[data-fechar]') || e.target === $('#modalEditor')) { fecharModais(); return; }
    if (e.target.closest('#btnNovo')) { abrirEditor(null); return; }
    if (e.target.closest('#btnLote')) { $('#arquivoLote').click(); return; }
    if (e.target.closest('#fotoRemover')) { st.novaFoto = null; $('#fotoPrevia').src = db.frasco(st.editando.nome, st.editando.categoria); $('#fotoRemover').hidden = true; return; }
    if (e.target.closest('#addVend')) { $('#vendedoras').insertAdjacentHTML('beforeend', linhaVendedora()); return; }
    const fp = e.target.closest('[data-filtro-pedido]');
    if (fp) { st.filtroPedido = fp.dataset.filtroPedido; renderPedidos(); return; }
    const per = e.target.closest('[data-periodo]');
    if (per) { st.periodo = per.dataset.periodo; renderRelatorios(); return; }
    const pa = e.target.closest('[data-pedido-acao]');
    if (pa) {
      const idPed = Number(pa.closest('[data-pedido]').dataset.pedido);
      if (pa.dataset.pedidoAcao === 'meta') enviarParaMeta(idPed); else mudarStatusPedido(idPed, pa.dataset.pedidoAcao, pa);
      return;
    }
    const filtro = e.target.closest('[data-filtro]');
    if (filtro) { st.filtro = filtro.dataset.filtro; renderProdutos(); return; }
    const alvo = e.target.closest('[data-acao]');
    if (!alvo) return;
    const id = alvo.closest('[data-id]')?.dataset.id;
    const acao = alvo.dataset.acao;
    if (acao === 'editar') abrirEditor(st.produtos.find(x => x.id === id));
    else if (acao === 'duplicar') duplicar(id);
    else if (acao === 'link') copiarLink(id);
    else if (acao === 'excluir') excluir(id);
    else if (acao === 'remover-vend') alvo.closest('.vendedora').remove();
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'fotoArquivo') { escolherFoto(e.target.files[0]); return; }
    const campo = e.target.dataset?.campo;
    if (campo) alternarCampo(e.target.closest('[data-id]').dataset.id, campo, e.target.tagName === 'SELECT' ? e.target.value : e.target.checked, e.target);
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'admBusca') { st.busca = e.target.value; renderLista(); }
    if (e.target.closest?.('#formEditor') && ['preco', 'preco_promocional', 'preco_revenda'].includes(e.target.name)) atualizarDicaRevenda();
  });

  document.addEventListener('submit', e => { if (e.target.id === 'formConfig') salvarConfig(e); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModais(); });

  // Arrastar fotos para a área do editor
  document.addEventListener('dragover', e => { if (e.target.closest?.('#fotoArea')) e.preventDefault(); });
  document.addEventListener('drop', e => {
    if (!e.target.closest?.('#fotoArea')) return;
    e.preventDefault();
    escolherFoto(e.dataTransfer.files[0]);
  });
}

iniciar();
