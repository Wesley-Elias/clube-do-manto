// C05 — Kits e histórico: duas visões (Kits por mês e Histórico de modelos).
// A visão escolhida fica na URL (?aba=historico) para que os detalhes voltem à origem.
// O número de modelos do histórico pode passar da composição mensal por causa das
// substituições: ele não representa quantidade entregue por mês.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { exigirSessao, montarCabecalho, mostrarNome, carregarPerfil, el, chip, competenciaExtenso } from "./cliente.js";
import { carregarAssinatura } from "./assinatura-comum.js";
import { carregarKits, carregarItens, composicaoRegistrada, descricaoCamisa, tipoDaCamisa } from "./kits-comum.js";

avisarSemConfiguracao();
montarCabecalho("C05");

const raiz = document.querySelector("[data-c05]");
const conteudo = raiz.querySelector("[data-conteudo]");
const parametros = new URLSearchParams(location.search);
let aba = parametros.get("aba") === "historico" ? "historico" : "kits";
let dados = null;

const linkDoKit = (competencia) => `${TELAS.C06}?competencia=${competencia}&origem=${aba}`;

async function carregar() {
  const [kits, itens, assinatura] = await Promise.all([carregarKits(), carregarItens(), carregarAssinatura()]);
  return { kits, itens, assinatura };
}

// ---------- Abas ----------
function abas() {
  const grupo = el("div", { class: "abas", role: "tablist", "aria-label": "Visões dos kits" });
  for (const [chave, rotulo] of [["kits", "Kits por mês"], ["historico", "Histórico de modelos"]]) {
    const atual = chave === aba;
    const botao = el("button", { class: "aba", type: "button", role: "tab", "aria-selected": String(atual), id: `aba-${chave}`, "aria-controls": "painel-visao" },
      atual ? el("span", { "aria-hidden": "true" }, "✓") : null, rotulo);
    botao.addEventListener("click", () => {
      if (chave === aba) return;
      aba = chave;
      history.replaceState(null, "", aba === "historico" ? `${TELAS.C05}?aba=historico` : TELAS.C05);
      renderizar();
      conteudo.querySelector(`#aba-${chave}`).focus();
    });
    grupo.append(botao);
  }
  return grupo;
}

// ---------- Visão: kits por mês ----------
function visaoKits() {
  const { kits } = dados;
  if (!kits.length) {
    return el("div", { class: "vazio" },
      el("h3", { class: "vazio__titulo" }, "Você ainda não tem kits registrados"),
      el("p", {}, "Quando houver um kit registrado para você, consulte aqui a composição e os modelos de cada mês."),
      el("a", { class: "botao botao--primaria", href: TELAS.C04 }, "Ver minha assinatura"));
  }
  const tabela = el("table", { class: "tabela" },
    el("thead", {}, el("tr", {},
      el("th", { scope: "col" }, "Mês do kit"),
      el("th", { scope: "col" }, "Plano registrado"),
      el("th", { scope: "col" }, "Composição registrada"),
      el("th", { scope: "col" }, "Brinde"),
      el("th", { scope: "col" }, "Ação"))));
  const corpo = el("tbody");
  kits.forEach((kit, i) => {
    corpo.append(el("tr", {},
      el("th", { scope: "row" },
        el("span", { class: "tabela__principal" }, competenciaExtenso(kit.competencia)),
        el("span", { class: "tabela__apoio" }, i === 0 ? "Mês mais recente" : "Registro mensal")),
      celula("Plano registrado", kit.planos?.nome || "—"),
      celula("Composição registrada", composicaoRegistrada(kit)),
      celula("Brinde", kit.brinde_previsto ? kit.brinde_descricao || "Previsto" : "Sem brinde"),
      el("td", { "data-rotulo": "Ação" }, el("a", { class: "link", href: linkDoKit(kit.competencia) }, "Ver detalhes"))));
  });
  tabela.append(corpo);
  return el("div", { class: "pilha" }, tabela,
    el("p", { class: "pequeno" }, "O plano e a composição de cada kit refletem o registro daquele mês."));
}

function celula(rotulo, valor) {
  return el("td", { "data-rotulo": rotulo }, valor);
}

// ---------- Visão: histórico de modelos ----------
function visaoHistorico() {
  const { itens, kits } = dados;
  if (!itens.length) {
    return el("div", { class: "vazio" },
      el("h3", { class: "vazio__titulo" }, "Nenhum modelo registrado"),
      el("p", {}, "Os modelos aparecem aqui quando um kit é registrado para você."));
  }
  const ordem = Object.fromEntries(kits.map((k, i) => [k.competencia, i]));
  const lista = [...itens].sort((a, b) => (ordem[a.competencia] ?? 0) - (ordem[b.competencia] ?? 0) || a.posicao - b.posicao);
  const tabela = el("table", { class: "tabela" },
    el("thead", {}, el("tr", {},
      el("th", { scope: "col" }, "Equipe / tipo"),
      el("th", { scope: "col" }, "Categoria"),
      el("th", { scope: "col" }, "Temporada"),
      el("th", { scope: "col" }, "Estado"),
      el("th", { scope: "col" }, "Kit de origem"),
      el("th", { scope: "col" }, "Ação"))));
  const corpo = el("tbody");
  for (const item of lista) {
    const camisa = item.camisas;
    corpo.append(el("tr", {},
      el("th", { scope: "row" },
        el("span", { class: "tabela__principal" }, camisa.equipes.nome),
        el("span", { class: "tabela__apoio" }, tipoDaCamisa(camisa))),
      celula("Categoria", camisa.categoria),
      celula("Temporada", camisa.temporada),
      el("td", { "data-rotulo": "Estado" }, item.estado === "atual" ? chip("Atual", "sucesso", "●") : chip("Substituída", "neutro", "→")),
      celula("Kit de origem", competenciaExtenso(item.competencia)),
      el("td", { "data-rotulo": "Ação" }, el("a", { class: "link", href: linkDoKit(item.competencia) }, "Ver kit"))));
  }
  tabela.append(corpo);
  const atuais = lista.filter((i) => i.estado === "atual").length;
  const substituidas = lista.length - atuais;
  const resumo = substituidas
    ? `${atuais} camisas atuais e ${substituidas} substituída${substituidas > 1 ? "s" : ""}. Modelos substituídos permanecem no histórico e contam para a regra de não repetição.`
    : `${atuais} camisa${atuais > 1 ? "s" : ""} registrada${atuais > 1 ? "s" : ""}. Modelos registrados contam para a regra de não repetição.`;
  return el("div", { class: "pilha" }, tabela, el("p", { class: "pequeno" }, resumo));
}

// ---------- Tela ----------
function renderizar() {
  const total = aba === "kits"
    ? `${dados.kits.length} kit${dados.kits.length === 1 ? "" : "s"} registrado${dados.kits.length === 1 ? "" : "s"}`
    : `${dados.itens.length} modelo${dados.itens.length === 1 ? "" : "s"} registrado${dados.itens.length === 1 ? "" : "s"}`;
  const painel = el("section", { class: "cartao cartao--painel", role: "tabpanel", id: "painel-visao", "aria-labelledby": `aba-${aba}`, tabindex: "-1" },
    el("div", { class: "cartao__topo" }, abas(), el("p", { class: "pequeno" }, total)),
    aba === "kits" ? visaoKits() : visaoHistorico());
  const rodape = el("div", { class: "acoes-fim" },
    el("a", { class: "botao botao--sec-claro", href: TELAS.C04 }, "Ver minha assinatura"));
  conteudo.replaceChildren(painel, rodape);
  if (dados.assinatura?.status === "cancelada") {
    painel.before(el("div", { class: "pilha" }, avisoCancelada()));
  }
}

function avisoCancelada() {
  return el("div", { class: "alerta alerta--aviso", role: "status" },
    el("span", { class: "alerta__icone", "aria-hidden": "true" }, "!"),
    el("div", {},
      el("p", { class: "alerta__titulo" }, "Assinatura cancelada"),
      el("p", { class: "alerta__texto" }, "Seus kits e modelos continuam disponíveis para consulta. Novas trocas exigem uma assinatura ativa.")));
}

function renderizarFalha() {
  const tentar = el("button", { class: "botao botao--primaria", type: "button" }, "Tentar novamente");
  tentar.addEventListener("click", async () => {
    tentar.disabled = true;
    await iniciar();
  });
  conteudo.replaceChildren(el("section", { class: "cartao cartao--falha", role: "alert" },
    el("span", { class: "cartao--falha__icone", "aria-hidden": "true" }, "!"),
    el("h2", { class: "cartao__titulo" }, "Não foi possível carregar seus kits"),
    el("p", { class: "cartao__texto" }, "Tente consultar novamente. Seu histórico não foi alterado."),
    tentar));
  tentar.focus();
}

async function iniciar() {
  raiz.setAttribute("aria-busy", "true");
  try {
    const [perfil, carga] = await Promise.all([carregarPerfil(), carregar()]);
    mostrarNome(perfil?.nome);
    dados = carga;
    renderizar();
  } catch (erro) {
    console.error(erro);
    renderizarFalha();
  } finally {
    raiz.setAttribute("aria-busy", "false");
  }
}

(async () => {
  if (!supabase) return;
  if (!(await exigirSessao({ destino: "C05" }))) return;
  await iniciar();
})();
