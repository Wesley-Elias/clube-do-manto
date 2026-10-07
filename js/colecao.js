// P04 — Coleção: galeria pública com filtros e detalhes do modelo.
// Mostra só camisas ativas de equipes ativas. A galeria demonstra modelos:
// não promete disponibilidade nem recebimento de uma camisa específica.
// O filtro vive na URL (?filtro=), e o detalhe (?camisa=) volta para o mesmo filtro.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { el } from "./cliente.js";
import { figuraCamisa } from "./kits-comum.js";

avisarSemConfiguracao();

const FILTROS = {
  todas: { rotulo: "Todas", aceita: () => true },
  clubes: { rotulo: "Clubes internacionais", aceita: (c) => c.tipo === "clube" },
  selecoes: { rotulo: "Seleções", aceita: (c) => c.tipo === "selecao" },
  especiais: { rotulo: "Especiais", aceita: (c) => c.tipo === "especial" },
};
const ORDEM_TIPO = { clube: 0, selecao: 1, especial: 2 };
const NATUREZA = { clube: "Clube", selecao: "Seleção" };

const raiz = document.querySelector("[data-p04]");
const galeria = raiz.querySelector("[data-galeria]");
const detalhe = raiz.querySelector("[data-detalhe]");
const lista = raiz.querySelector("[data-lista]");
const contagem = raiz.querySelector("[data-contagem]");
const botoesFiltro = [...raiz.querySelectorAll("[data-filtro]")];
const voltar = document.querySelector("[data-voltar]");

const params = new URLSearchParams(location.search);
let filtro = FILTROS[params.get("filtro")] ? params.get("filtro") : "todas";
const camisaPedida = params.get("camisa");
let camisas = null;

// Rótulo do tipo, sem confundir tipo (Clube/Seleção/Especial) com categoria (Home/Away/Third)
function rotuloTipo(camisa) {
  if (camisa.tipo === "clube") return "Clube internacional";
  if (camisa.tipo === "selecao") return "Seleção";
  return `Especial · ${NATUREZA[camisa.equipes.natureza]}`;
}

function enderecoGaleria(f = filtro) {
  return f === "todas" ? "colecao.html" : `colecao.html?filtro=${f}`;
}
function enderecoDetalhe(camisa) {
  const url = new URLSearchParams();
  if (filtro !== "todas") url.set("filtro", filtro);
  url.set("camisa", camisa.id);
  return `colecao.html?${url}`;
}

async function carregar() {
  const { data, error } = await supabase
    .from("camisas")
    .select("id, tipo, categoria, temporada, descricao, imagem, equipes!inner(nome, natureza, ativo)")
    .eq("ativo", true)
    .eq("equipes.ativo", true);
  if (error) throw error;
  return data.sort((a, b) =>
    ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo]
    || a.equipes.nome.localeCompare(b.equipes.nome, "pt-BR")
    || b.temporada.localeCompare(a.temporada)
    || a.categoria.localeCompare(b.categoria));
}

// ---------- Galeria ----------
function imagem(camisa) {
  const especial = camisa.tipo === "especial";
  return el("div", { class: `cartao-camisa__imagem${especial ? " cartao-camisa__imagem--especial" : ""}` },
    figuraCamisa(camisa, especial),
    especial ? el("span", { class: "selo-especial" }, el("span", { "aria-hidden": "true" }, "★ "), "Especial") : null);
}

function cartao(camisa) {
  const titulo = `${camisa.equipes.nome}`;
  return el("li", { class: "cartao-camisa" },
    imagem(camisa),
    el("div", { class: "cartao-camisa__dados" },
      el("h2", { class: "cartao-camisa__equipe" }, titulo),
      el("p", {}, `${camisa.temporada} • ${camisa.categoria}`),
      el("p", {}, rotuloTipo(camisa)),
      el("a", { class: "link cartao-camisa__link", href: enderecoDetalhe(camisa) },
        "Ver detalhes", el("span", { class: "visualmente-oculto" }, ` de ${camisa.equipes.nome} ${camisa.categoria} ${camisa.temporada}`))));
}

function renderizarGaleria() {
  botoesFiltro.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filtro === filtro)));
  const visiveis = camisas.filter(FILTROS[filtro].aceita);
  contagem.textContent = visiveis.length === 1 ? "1 modelo" : `${visiveis.length} modelos`;
  if (!visiveis.length) {
    lista.replaceChildren(el("div", { class: "vazio-colecao" },
      el("h2", { class: "vazio-colecao__titulo" }, filtro === "todas" ? "Nenhum modelo na coleção no momento" : `Nenhum modelo em ${FILTROS[filtro].rotulo}`),
      el("p", {}, "Os modelos aparecem aqui assim que forem cadastrados no catálogo."),
      filtro === "todas" ? null : el("button", { class: "botao botao--sec-claro", type: "button", "data-ver-todas": true }, "Ver todas")));
    lista.querySelector("[data-ver-todas]")?.addEventListener("click", () => trocarFiltro("todas", true));
    return;
  }
  lista.replaceChildren(el("ul", { class: "grade-camisas" }, ...visiveis.map(cartao)));
}

function trocarFiltro(novo, focar = false) {
  filtro = novo;
  history.replaceState(null, "", enderecoGaleria());
  renderizarGaleria();
  if (focar) raiz.querySelector(`[data-filtro="${novo}"]`).focus();
}

botoesFiltro.forEach((b) => b.addEventListener("click", () => trocarFiltro(b.dataset.filtro)));

// ---------- Detalhe ----------
function linhaDado(rotulo, valor) {
  return el("div", {}, el("dt", {}, rotulo), el("dd", {}, valor));
}

function renderizarDetalhe(camisa) {
  galeria.hidden = true;
  detalhe.hidden = false;
  voltar.textContent = "Voltar à galeria";
  voltar.setAttribute("href", enderecoGaleria());

  if (!camisa) {
    document.title = "Modelo não encontrado · Clube do Manto";
    detalhe.replaceChildren(
      el("section", { class: "colecao__topo colecao__topo--curto" },
        el("div", { class: "container" },
          el("h1", { class: "colecao__titulo", tabindex: "-1" }, "Modelo não encontrado"),
          el("p", { class: "colecao__lead" }, "Este modelo não está disponível na coleção. Ele pode ter sido retirado do catálogo."))),
      el("div", { class: "container colecao__corpo" },
        el("a", { class: "botao botao--primaria", href: enderecoGaleria() }, "Voltar à galeria")));
    detalhe.querySelector("h1").focus();
    return;
  }

  const nome = `${camisa.equipes.nome} · ${camisa.categoria}`;
  document.title = `${nome} · Coleção · Clube do Manto`;
  const dados = el("dl", { class: "dados-modelo" },
    linhaDado("Equipe", camisa.equipes.nome),
    linhaDado("Temporada", camisa.temporada),
    linhaDado("Categoria", camisa.categoria),
    linhaDado("Tipo", rotuloTipo(camisa)),
    camisa.descricao ? linhaDado("Descrição", camisa.descricao) : null);

  detalhe.replaceChildren(
    el("section", { class: "colecao__topo colecao__topo--detalhe" },
      el("div", { class: "container" },
        el("h1", { class: "colecao__titulo", tabindex: "-1" }, nome),
        el("p", { class: "colecao__lead" }, `${camisa.temporada} · ${rotuloTipo(camisa)}`))),
    el("div", { class: "container detalhe-modelo" },
      el("figure", { class: "cartao-camisa detalhe-modelo__imagem" },
        imagem(camisa),
        el("figcaption", { class: "cartao-camisa__dados" },
          el("p", { class: "cartao-camisa__equipe" }, camisa.equipes.nome),
          el("p", {}, `${camisa.temporada} • ${camisa.categoria}`),
          el("p", {}, rotuloTipo(camisa)),
          el("p", { class: "cartao-camisa__legenda" }, camisa.imagem ? "Foto ilustrativa do modelo" : "Ilustração genérica · sem uniforme real"))),
      el("section", { class: "detalhe-modelo__sobre", "aria-labelledby": "titulo-sobre" },
        el("h2", { class: "detalhe-modelo__titulo", id: "titulo-sobre" }, "Sobre o modelo"),
        dados,
        el("p", { class: "detalhe-modelo__nota" }, "As camisas são selecionadas pelo serviço. Este modelo pode ser considerado conforme seu perfil, histórico e disponibilidade."),
        el("div", { class: "detalhe-modelo__acoes" },
          el("a", { class: "botao botao--primaria", href: "index.html#planos" }, "Conhecer os planos"),
          el("a", { class: "link", href: enderecoGaleria() }, "Voltar à galeria")))));
  detalhe.querySelector("h1").focus();
}

// ---------- Falha ----------
function renderizarFalha() {
  contagem.textContent = "";
  lista.replaceChildren(el("section", { class: "cartao cartao--falha", role: "alert" },
    el("span", { class: "cartao--falha__icone", "aria-hidden": "true" }, "!"),
    el("h2", { class: "cartao__titulo" }, "Não foi possível carregar a coleção"),
    el("p", { class: "cartao__texto" }, "Verifique sua conexão e tente novamente."),
    el("button", { class: "botao botao--primaria", type: "button", "data-tentar": true }, "Tentar novamente")));
  lista.querySelector("[data-tentar]").addEventListener("click", iniciar);
}

async function iniciar() {
  raiz.setAttribute("aria-busy", "true");
  if (!camisaPedida) contagem.textContent = "Carregando modelos…";
  try {
    camisas = await carregar();
  } catch (erro) {
    console.error(erro);
    galeria.hidden = false;
    detalhe.hidden = true;
    renderizarFalha();
    raiz.setAttribute("aria-busy", "false");
    return;
  }
  if (camisaPedida) renderizarDetalhe(camisas.find((c) => String(c.id) === camisaPedida));
  else renderizarGaleria();
  raiz.setAttribute("aria-busy", "false");
}

if (camisaPedida) {
  galeria.hidden = true;
  detalhe.hidden = false;
  voltar.textContent = "Voltar à galeria";
  voltar.setAttribute("href", enderecoGaleria());
  detalhe.replaceChildren(el("div", { class: "container colecao__corpo" }, el("p", { role: "status" }, "Carregando o modelo…")));
}
iniciar();
