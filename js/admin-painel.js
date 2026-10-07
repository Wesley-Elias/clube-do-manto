// A01 — Painel administrativo: atalhos para as áreas de gestão e resumo das
// solicitações de troca em Solicitada. Sem gráficos ou indicadores comerciais.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { el, competenciaExtenso, dataCurta } from "./cliente.js";
import { montarCabecalhoAdmin, exigirAdministrador, mostrarFalhaGeral } from "./admin.js";
import { MODALIDADES, chipDeTroca } from "./kits-comum.js";

avisarSemConfiguracao();
montarCabecalhoAdmin("A01");

const principal = document.querySelector("[data-tela]");

const ATALHOS = [
  ["Catálogo", "Consulte e organize as equipes e os modelos de camisa.", "Gerenciar catálogo", TELAS.A02],
  ["Estoque", "Consulte os saldos por modelo e tamanho e registre reposições.", "Consultar estoque", TELAS.A05],
  ["Assinantes", "Consulte planos, situação, preferências e kits dos assinantes.", "Consultar assinantes", TELAS.A06],
  ["Trocas", "Consulte as solicitações e abra os pedidos para processamento.", "Processar trocas", TELAS.A09],
];

function estrutura() {
  return el("div", { class: "container" },
    el("div", { class: "area-cliente__topo" },
      el("p", { class: "chamada chamada--no-escuro" }, "Administração"),
      el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, "Painel administrativo"),
      el("p", { class: "area-cliente__sub" }, "Acesse as áreas de gestão e acompanhe as solicitações de troca.")),
    el("div", { class: "atalhos-admin" },
      ...ATALHOS.map(([titulo, texto, acao, href]) =>
        el("section", { class: "atalho-admin", "aria-labelledby": `atalho-${titulo}` },
          el("h2", { class: "atalho-admin__titulo", id: `atalho-${titulo}` }, titulo),
          el("p", { class: "atalho-admin__texto" }, texto),
          el("a", { class: "botao botao--sec-claro", href }, acao)))),
    el("section", { class: "cartao cartao--painel cartao--admin", "aria-labelledby": "titulo-abertas" },
      el("div", { class: "cartao__topo" },
        el("h2", { class: "cartao__titulo", id: "titulo-abertas" }, "Solicitações em aberto"),
        el("a", { class: "link", href: TELAS.A09 }, "Ver todas as trocas")),
      el("div", { "data-abertas": true, "aria-live": "polite" },
        el("p", { class: "cartao__texto" }, el("span", { class: "chip chip--neutro" }, el("span", { "aria-hidden": "true" }, "…"), "Carregando"), " Consultando as solicitações…")),
      el("p", { class: "cartao__nota" }, "Os pedidos encerrados permanecem na consulta de trocas.")));
}

function tabela(linhas) {
  return el("table", { class: "tabela" },
    el("caption", { class: "visualmente-oculto" }, "Solicitações de troca em Solicitada"),
    el("thead", {}, el("tr", {},
      ...["Assinante e kit", "Camisa", "Modalidade", "Data", "Estado", "Ação"].map((t) => el("th", { scope: "col" }, t)))),
    el("tbody", {}, ...linhas.map((l) => el("tr", {},
      el("th", { scope: "row" },
        el("span", { class: "tabela__principal" }, l.assinante),
        el("span", { class: "tabela__apoio" }, `Kit de ${competenciaExtenso(l.competencia).toLowerCase()} • Camisa ${l.posicao}`)),
      el("td", { "data-rotulo": "Camisa" },
        el("span", { class: "tabela__principal" }, l.equipe),
        el("span", { class: "tabela__apoio" }, `${l.categoria} • ${l.temporada} • ${l.tamanho_original}`)),
      el("td", { "data-rotulo": "Modalidade" }, `Troca de ${MODALIDADES[l.modalidade].toLowerCase()}`),
      el("td", { "data-rotulo": "Data" }, `Solicitada em ${dataCurta(l.solicitada_em)}`),
      el("td", { "data-rotulo": "Estado" }, chipDeTroca("solicitada")),
      el("td", { "data-rotulo": "Ação" },
        el("a", { class: "link", href: `${TELAS.A10}?troca=${l.troca_id}` }, "Abrir solicitação",
          el("span", { class: "visualmente-oculto" }, ` de ${l.assinante}`)))))));
}

async function carregarAbertas() {
  const alvo = principal.querySelector("[data-abertas]");
  try {
    const { data, error } = await supabase.rpc("admin_trocas_em_aberto");
    if (error) throw error;
    alvo.replaceChildren(data.length
      ? tabela(data)
      : el("div", { class: "vazio" },
          el("p", { class: "vazio__titulo" }, "Nenhuma solicitação em aberto"),
          el("p", {}, "Quando um assinante pedir uma troca, ela aparece aqui para processamento.")));
  } catch (erro) {
    console.error(erro);
    const tentar = el("button", { class: "botao botao--sec-claro", type: "button" }, "Tentar novamente");
    tentar.addEventListener("click", () => {
      alvo.replaceChildren(el("p", { class: "cartao__texto" }, "Consultando as solicitações…"));
      carregarAbertas();
    });
    alvo.replaceChildren(el("div", { class: "alerta", role: "alert" },
      el("span", { class: "alerta__icone", "aria-hidden": "true" }, "!"),
      el("div", {}, el("p", { class: "alerta__titulo" }, "Não foi possível consultar as solicitações"),
        el("p", { class: "alerta__texto" }, "Os atalhos continuam disponíveis. Tente consultar novamente.")),
      tentar));
  }
}

(async () => {
  try {
    if (!(await exigirAdministrador(principal))) return;
    principal.replaceChildren(estrutura());
    principal.setAttribute("aria-busy", "false");
    await carregarAbertas();
  } catch (erro) {
    console.error(erro);
    mostrarFalhaGeral(principal, "Não foi possível carregar o painel", () => location.reload());
  }
})();
