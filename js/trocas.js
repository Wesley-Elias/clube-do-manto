// C08 — Minhas trocas: lista das próprias solicitações com detalhe expansível.
// Estados: Solicitada, Concluída e Rejeitada. A rejeição não tem motivo nem data
// no modelo, então nada disso é apresentado como registrado.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { exigirCliente, montarCabecalho, mostrarNome, carregarPerfil, el, chip, competenciaExtenso, dataCurta } from "./cliente.js";
import { carregarAssinatura } from "./assinatura-comum.js";
import {
  carregarKits, carregarItens, carregarTrocas, carregarCamisas,
  camisaDoKit, descricaoCamisa, MODALIDADES, chipDeTroca,
} from "./kits-comum.js";

avisarSemConfiguracao();
montarCabecalho("C08");

const raiz = document.querySelector("[data-c08]");
const conteudo = raiz.querySelector("[data-conteudo]");
const trocaDestacada = new URLSearchParams(location.search).get("troca");
let dados = null;
let aberta = trocaDestacada || null;

async function carregar() {
  const [trocas, itens, kits, assinatura] = await Promise.all([carregarTrocas(), carregarItens(), carregarKits(), carregarAssinatura()]);
  const camisas = await carregarCamisas(trocas.map((t) => t.camisa_substituta_id));
  return { trocas, itens, kits, assinatura, camisas };
}

const itemDaTroca = (troca) => dados.itens.find((i) => i.camisa_id === troca.camisa_original_id) || null;
const kitDaTroca = (troca) => {
  const item = itemDaTroca(troca);
  return item ? dados.kits.find((k) => k.competencia === item.competencia) : null;
};

// ---------- Detalhe ----------
function detalhe(troca) {
  const item = itemDaTroca(troca);
  const kit = kitDaTroca(troca);
  const substituta = dados.camisas[troca.camisa_substituta_id];
  const dadosLista = el("dl", { class: "dados" },
    linha("Data do pedido", dataCurta(troca.solicitada_em)),
    linha("Kit de origem", item ? competenciaExtenso(item.competencia) : "—"),
    linha("Plano registrado no kit", kit?.planos?.nome || "—"),
    linha("Modalidade solicitada", MODALIDADES[troca.modalidade]),
    linha("Tamanho de origem", troca.tamanho_original),
    linha("Tamanho de destino", troca.modalidade === "modelo" ? `${troca.tamanho_destino} (mantido)` : troca.tamanho_destino),
    troca.estado === "concluida" ? linha("Concluída em", dataCurta(troca.concluida_em)) : null);

  const explicacoes = {
    solicitada: "O pedido foi registrado. A camisa atual permanece no kit até a conclusão da troca.",
    concluida: "A alteração está registrada no kit. Consulte a composição atual e o histórico preservado.",
    rejeitada: "A solicitação foi rejeitada. O pedido não alterou a composição do kit.",
  };

  const camisas = el("div", { class: "pilha" });
  if (item) {
    camisas.append(
      el("p", { class: "pequeno" }, troca.estado === "concluida" ? "Camisa no momento do pedido" : "Camisa do pedido"),
      camisaDoKit({ ...item, camisas: item.camisas, tamanho_atual: troca.tamanho_original },
        { rotulo: `Camisa ${item.posicao}`, chipEstado: item.estado === "atual" ? chip("Atual", "sucesso", "●") : chip("Substituída", "neutro", "→") }));
  }
  if (troca.estado === "concluida" && substituta) {
    camisas.append(
      el("p", { class: "pequeno" }, "Camisa após a conclusão"),
      camisaDoKit({ camisas: substituta, grupo: "comum", tamanho_atual: troca.tamanho_destino },
        { rotulo: `Camisa ${item?.posicao ?? ""}`.trim(), chipEstado: chip("Atual", "sucesso", "●") }));
  }

  return el("div", { class: "troca-detalhe", id: `detalhe-${troca.id}` },
    el("h3", { class: "secao-conta__titulo" }, "Dados da solicitação"),
    el("div", { class: "troca-detalhe__grade" },
      el("div", { class: "pilha" },
        camisas,
        item ? el("a", { class: "botao botao--sec-claro", href: `${TELAS.C06}?competencia=${item.competencia}` }, "Ver kit de origem") : null),
      el("div", { class: "dados-caixa" },
        dadosLista,
        el("div", { class: "pilha" }, chipDeTroca(troca.estado), el("p", { class: "pequeno" }, explicacoes[troca.estado])))));
}

function linha(rotulo, valor) {
  return el("div", {}, el("dt", {}, rotulo), el("dd", {}, valor));
}

// ---------- Lista ----------
function renderizarLista() {
  const { trocas } = dados;
  if (!trocas.length) {
    conteudo.replaceChildren(el("section", { class: "cartao cartao--painel" },
      el("div", { class: "vazio" },
        el("h2", { class: "vazio__titulo" }, "Nenhuma solicitação de troca"),
        el("p", {}, "Para solicitar uma troca, abra uma camisa atual em Kits e histórico."),
        el("a", { class: "botao botao--primaria", href: TELAS.C05 }, "Ver meus kits"))));
    return;
  }

  const tabela = el("table", { class: "tabela tabela--trocas" },
    el("thead", {}, el("tr", {},
      el("th", { scope: "col" }, "Data do pedido"),
      el("th", { scope: "col" }, "Kit de origem"),
      el("th", { scope: "col" }, "Camisa solicitada"),
      el("th", { scope: "col" }, "Modalidade"),
      el("th", { scope: "col" }, "Estado"),
      el("th", { scope: "col" }, "Detalhes"))));
  const corpo = el("tbody");
  for (const troca of trocas) {
    const item = itemDaTroca(troca);
    const kit = kitDaTroca(troca);
    const camisa = item?.camisas;
    const aberto = aberta === String(troca.id);
    const botao = el("button", { class: "link", type: "button", "aria-expanded": String(aberto), "aria-controls": `detalhe-${troca.id}` }, aberto ? "Ocultar detalhes" : "Ver detalhes");
    botao.addEventListener("click", () => {
      aberta = aberto ? null : String(troca.id);
      renderizarLista();
      conteudo.querySelector(`[aria-controls="detalhe-${troca.id}"]`)?.focus();
    });
    corpo.append(el("tr", { class: aberto ? "tabela__linha--aberta" : null },
      el("th", { scope: "row" }, el("span", { class: "tabela__principal" }, dataCurta(troca.solicitada_em))),
      el("td", { "data-rotulo": "Kit de origem" },
        el("span", { class: "tabela__principal" }, item ? competenciaExtenso(item.competencia) : "—"),
        el("span", { class: "tabela__apoio" }, kit?.planos?.nome || "")),
      el("td", { "data-rotulo": "Camisa solicitada" },
        el("span", { class: "tabela__principal" }, camisa ? `Camisa ${item.posicao} • ${camisa.equipes.nome}` : "—"),
        el("span", { class: "tabela__apoio" }, camisa ? descricaoCamisa(camisa) : "")),
      el("td", { "data-rotulo": "Modalidade" }, MODALIDADES[troca.modalidade]),
      el("td", { "data-rotulo": "Estado" }, chipDeTroca(troca.estado)),
      el("td", { "data-rotulo": "Detalhes" }, botao)));
    if (aberto) corpo.append(el("tr", { class: "tabela__linha-detalhe" }, el("td", { colspan: "6" }, detalhe(troca))));
  }
  tabela.append(corpo);

  const filhos = [el("section", { class: "cartao cartao--painel", "aria-labelledby": "titulo-registros" },
    el("h2", { class: "secao-conta__titulo", id: "titulo-registros" }, "Solicitações registradas"),
    tabela,
    el("p", { class: "pequeno" }, "A composição do kit permanece até a conclusão de uma troca. Rejeições não registram motivo nem data."))];
  if (dados.assinatura?.status !== "ativa") {
    filhos.unshift(el("div", { class: "alerta alerta--aviso", role: "status" },
      el("span", { class: "alerta__icone", "aria-hidden": "true" }, "!"),
      el("div", {},
        el("p", { class: "alerta__titulo" }, dados.assinatura ? "Assinatura cancelada" : "Sem assinatura ativa"),
        el("p", { class: "alerta__texto" }, "Seus registros continuam disponíveis. Novas solicitações exigem uma assinatura ativa."))));
  }
  conteudo.replaceChildren(...filhos);
}

function renderizarFalha() {
  const tentar = el("button", { class: "botao botao--primaria", type: "button" }, "Tentar novamente");
  tentar.addEventListener("click", async () => {
    tentar.disabled = true;
    await iniciar();
  });
  conteudo.replaceChildren(el("section", { class: "cartao cartao--falha", role: "alert" },
    el("span", { class: "cartao--falha__icone", "aria-hidden": "true" }, "!"),
    el("h2", { class: "cartao__titulo" }, "Não foi possível consultar suas trocas"),
    el("p", { class: "cartao__texto" }, "Tente novamente para carregar os registros."),
    tentar));
  tentar.focus();
}

async function iniciar() {
  raiz.setAttribute("aria-busy", "true");
  try {
    const [perfil, carga] = await Promise.all([carregarPerfil(), carregar()]);
    mostrarNome(perfil?.nome);
    dados = carga;
    renderizarLista();
  } catch (erro) {
    console.error(erro);
    renderizarFalha();
  } finally {
    raiz.setAttribute("aria-busy", "false");
  }
}

(async () => {
  if (!supabase) return;
  if (!(await exigirCliente({}))) return;
  await iniciar();
})();
