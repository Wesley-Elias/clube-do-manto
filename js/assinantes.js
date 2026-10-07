// A06 — Assinantes: titulares com assinatura, inclusive cancelada, com busca por
// nome e filtro por situação. Só dados operacionais: nada de edição de perfil,
// dados financeiros ou mensagens ao cliente. A consulta fica na URL para que os
// detalhes voltem à mesma lista.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { el } from "./cliente.js";
import { montarCabecalhoAdmin, exigirAdministrador, mostrarFalhaGeral, normalizar } from "./admin.js";
import { SITUACOES, chipAssinatura, linkDoAssinante } from "./admin-operacao.js";

avisarSemConfiguracao();
montarCabecalhoAdmin("A06");

const principal = document.querySelector("[data-tela]");
const params = new URLSearchParams(location.search);
const estado = {
  busca: params.get("busca") || "",
  situacao: SITUACOES[params.get("situacao")] ? params.get("situacao") : "",
};
let assinantes = [];

function enderecoAtual() {
  const url = new URLSearchParams();
  if (estado.busca) url.set("busca", estado.busca);
  if (estado.situacao) url.set("situacao", estado.situacao);
  const texto = url.toString();
  return texto ? `${TELAS.A06}?${texto}` : TELAS.A06;
}

async function carregar() {
  const { data, error } = await supabase.rpc("admin_assinantes");
  if (error) throw error;
  assinantes = data;
}

function estrutura() {
  const busca = el("input", {
    class: "campo__entrada", id: "busca", name: "busca", type: "search", value: estado.busca,
    placeholder: "Buscar por nome", autocomplete: "off",
  });
  const situacao = el("select", { class: "campo__entrada", id: "situacao", name: "situacao" },
    el("option", { value: "" }, "Todas"),
    ...Object.entries(SITUACOES).map(([v, r]) => el("option", { value: v, selected: v === estado.situacao }, r)));

  const form = el("form", { class: "consulta-admin consulta-admin--assinantes", role: "search", "aria-label": "Consultar assinantes" },
    el("div", { class: "campo" },
      el("label", { class: "campo__rotulo", for: "busca" }, "Nome do assinante"),
      el("div", { class: "campo__caixa" }, busca)),
    el("div", { class: "campo" },
      el("label", { class: "campo__rotulo", for: "situacao" }, "Situação da assinatura"),
      el("div", { class: "campo__caixa campo__caixa--selecao" }, situacao, el("span", { class: "campo__seta", "aria-hidden": "true" }))),
    el("button", { class: "botao botao--escura consulta-admin__buscar", type: "submit" }, "Buscar"),
    el("button", { class: "link consulta-admin__limpar", type: "button", "data-limpar": true }, "Limpar filtros"));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    estado.busca = busca.value.trim();
    estado.situacao = situacao.value;
    atualizar();
  });
  situacao.addEventListener("change", () => {
    estado.situacao = situacao.value;
    estado.busca = busca.value.trim();
    atualizar();
  });
  form.querySelector("[data-limpar]").addEventListener("click", () => limpar());

  return el("div", { class: "container" },
    el("div", { class: "area-cliente__topo" },
      el("a", { class: "area-cliente__voltar", href: TELAS.A01 }, el("span", { "aria-hidden": "true" }, "←"), "Voltar ao painel"),
      el("p", { class: "chamada chamada--no-escuro" }, "Administração / Assinantes"),
      el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, "Assinantes"),
      el("p", { class: "area-cliente__sub" }, "Consulte os titulares com assinatura, inclusive as canceladas.")),
    el("section", { class: "cartao cartao--admin cartao--consulta", "aria-label": "Consulta de assinantes" }, form),
    el("div", { "data-resultado": true, "aria-live": "polite" }));
}

function limpar() {
  estado.busca = "";
  estado.situacao = "";
  principal.querySelector("#busca").value = "";
  principal.querySelector("#situacao").value = "";
  atualizar();
  principal.querySelector("#busca").focus();
}

function atualizar() {
  history.replaceState(null, "", enderecoAtual());
  renderizarResultado();
}

function renderizarResultado() {
  const alvo = principal.querySelector("[data-resultado]");
  if (!assinantes.length) {
    alvo.replaceChildren(el("section", { class: "cartao cartao--admin" }, el("div", { class: "vazio" },
      el("p", { class: "vazio__titulo" }, "Nenhuma assinatura registrada"),
      el("p", {}, "Os titulares aparecem aqui depois de confirmar uma assinatura, e continuam na lista se cancelarem."))));
    return;
  }
  const termo = normalizar(estado.busca);
  const lista = assinantes.filter((a) =>
    (!termo || normalizar(a.nome).includes(termo)) && (!estado.situacao || a.status === estado.situacao));
  if (!lista.length) {
    const limparBotao = el("button", { class: "botao botao--sec-claro", type: "button" }, "Limpar filtros");
    limparBotao.addEventListener("click", () => limpar());
    alvo.replaceChildren(el("section", { class: "cartao cartao--admin" }, el("div", { class: "vazio" },
      el("p", { class: "vazio__titulo" }, "Nenhum assinante encontrado"),
      el("p", {}, "Revise o nome ou a situação informados, ou limpe os filtros para ver todos os titulares."),
      limparBotao)));
    return;
  }
  const voltar = enderecoAtual();
  alvo.replaceChildren(
    el("p", { class: "contagem-admin" }, lista.length === 1 ? "1 assinante" : `${lista.length} assinantes`),
    el("div", { class: "tabela-caixa" }, el("table", { class: "tabela tabela--admin" },
      el("caption", { class: "visualmente-oculto" }, "Assinantes"),
      el("thead", {}, el("tr", {}, ...["Nome", "Referência", "Plano", "Situação", "Tamanho", "Ações"].map((t) => el("th", { scope: "col" }, t)))),
      el("tbody", {}, ...lista.map((a) => el("tr", {},
        el("th", { scope: "row" }, el("span", { class: "tabela__principal" }, a.nome)),
        el("td", { "data-rotulo": "Referência" }, a.referencia),
        el("td", { "data-rotulo": "Plano" }, a.plano),
        el("td", { "data-rotulo": "Situação" }, chipAssinatura(a.status)),
        el("td", { "data-rotulo": "Tamanho" }, a.tamanho || "Não informado"),
        el("td", { "data-rotulo": "Ações" }, el("div", { class: "acoes-linha" },
          el("a", { class: "link", href: linkDoAssinante(a.usuario_id, { voltar }) },
            "Abrir detalhes", el("span", { class: "visualmente-oculto" }, ` de ${a.nome}`))))))))));
}

(async () => {
  if (!(await exigirAdministrador(principal))) return;
  try {
    await carregar();
  } catch (erro) {
    console.error(erro);
    mostrarFalhaGeral(principal, "Não foi possível consultar os assinantes", () => location.reload());
    return;
  }
  principal.replaceChildren(estrutura());
  principal.setAttribute("aria-busy", "false");
  renderizarResultado();
})();
