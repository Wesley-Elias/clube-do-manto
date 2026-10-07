// A09 — Solicitações de troca de todos os assinantes, com filtro por estado e por
// assinante (vindo da A07). Concluídas e rejeitadas continuam consultáveis, sem
// ação de novo processamento. Os filtros ficam na URL para que a A10 volte a eles.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { el, competenciaExtenso, dataCurta } from "./cliente.js";
import { montarCabecalhoAdmin, exigirAdministrador, mostrarFalhaGeral } from "./admin.js";
import { chipDeTroca, MODALIDADES, ESTADOS_TROCA, TIPOS } from "./kits-comum.js";
import { linkDoAssinante } from "./admin-operacao.js";

avisarSemConfiguracao();
montarCabecalhoAdmin("A09");

const principal = document.querySelector("[data-tela]");
const params = new URLSearchParams(location.search);
const estado = {
  assinante: params.get("assinante") || "",
  estado: ESTADOS_TROCA[params.get("estado")] ? params.get("estado") : "",
};
let trocas = [];
let assinantes = [];

function enderecoAtual() {
  const url = new URLSearchParams();
  if (estado.assinante) url.set("assinante", estado.assinante);
  if (estado.estado) url.set("estado", estado.estado);
  const texto = url.toString();
  return texto ? `${TELAS.A09}?${texto}` : TELAS.A09;
}

async function carregar() {
  const [r1, r2] = await Promise.all([supabase.rpc("admin_trocas"), supabase.rpc("admin_assinantes")]);
  if (r1.error || r2.error) throw r1.error || r2.error;
  trocas = r1.data;
  // Opções do filtro: titulares com assinatura e quem tem solicitação registrada
  const nomes = new Map(r2.data.map((a) => [a.usuario_id, a.nome]));
  for (const t of trocas) if (!nomes.has(t.usuario_id)) nomes.set(t.usuario_id, t.assinante);
  assinantes = [...nomes].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (estado.assinante && !nomes.has(estado.assinante)) estado.assinante = "";
}

function estrutura() {
  const seletorAssinante = el("select", { class: "campo__entrada", id: "assinante", name: "assinante" },
    el("option", { value: "" }, "Todos os assinantes"),
    ...assinantes.map((a) => el("option", { value: a.id, selected: a.id === estado.assinante }, a.nome)));
  const seletorEstado = el("select", { class: "campo__entrada", id: "estado", name: "estado" },
    el("option", { value: "" }, "Todas"),
    ...Object.entries(ESTADOS_TROCA).map(([v, [r]]) => el("option", { value: v, selected: v === estado.estado }, r)));

  const form = el("form", { class: "consulta-admin consulta-admin--trocas", role: "search", "aria-label": "Consultar solicitações de troca" },
    el("div", { class: "campo" },
      el("label", { class: "campo__rotulo", for: "assinante" }, "Assinante"),
      el("div", { class: "campo__caixa campo__caixa--selecao" }, seletorAssinante, el("span", { class: "campo__seta", "aria-hidden": "true" }))),
    el("div", { class: "campo" },
      el("label", { class: "campo__rotulo", for: "estado" }, "Estado da solicitação"),
      el("div", { class: "campo__caixa campo__caixa--selecao" }, seletorEstado, el("span", { class: "campo__seta", "aria-hidden": "true" }))),
    el("button", { class: "botao botao--escura consulta-admin__buscar", type: "submit" }, "Atualizar consulta"),
    el("button", { class: "link consulta-admin__limpar", type: "button", "data-limpar": true }, "Limpar filtro de estado"));

  const aplicar = () => {
    estado.assinante = seletorAssinante.value;
    estado.estado = seletorEstado.value;
    history.replaceState(null, "", enderecoAtual());
  };
  seletorAssinante.addEventListener("change", () => { aplicar(); renderizarResultado(); });
  seletorEstado.addEventListener("change", () => { aplicar(); renderizarResultado(); });
  // Atualizar consulta busca de novo no banco, mantendo os filtros
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    aplicar();
    const botao = form.querySelector("[type=submit]");
    botao.disabled = true;
    try {
      await carregar();
      renderizarResultado();
    } catch (erro) {
      console.error(erro);
      renderizarFalhaResultado();
    } finally {
      botao.disabled = false;
    }
  });
  form.querySelector("[data-limpar]").addEventListener("click", () => {
    seletorEstado.value = "";
    aplicar();
    renderizarResultado();
    seletorEstado.focus();
  });

  return el("div", { class: "container" },
    el("div", { class: "area-cliente__topo" },
      el("a", { class: "area-cliente__voltar", href: TELAS.A01 }, el("span", { "aria-hidden": "true" }, "←"), "Voltar ao painel"),
      el("p", { class: "chamada chamada--no-escuro" }, "Administração / Trocas"),
      el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, "Solicitações de troca"),
      el("p", { class: "area-cliente__sub" }, "Consulte os pedidos dos assinantes e abra uma solicitação para processar.")),
    el("section", { class: "cartao cartao--admin cartao--consulta", "aria-label": "Filtros das solicitações" }, form),
    el("div", { "data-resultado": true, "aria-live": "polite" }));
}

function limparTudo() {
  estado.assinante = "";
  estado.estado = "";
  principal.querySelector("#assinante").value = "";
  principal.querySelector("#estado").value = "";
  history.replaceState(null, "", enderecoAtual());
  renderizarResultado();
  principal.querySelector("#assinante").focus();
}

function textoModalidade(t) {
  return t.modalidade === "modelo" ? `Solicitado: ${t.tamanho_destino} (mantido)` : `Solicitado: ${t.tamanho_destino}`;
}

function renderizarResultado() {
  const alvo = principal.querySelector("[data-resultado]");
  if (!trocas.length && !estado.assinante) {
    alvo.replaceChildren(el("section", { class: "cartao cartao--admin" }, el("div", { class: "vazio" },
      el("p", { class: "vazio__titulo" }, "Nenhuma solicitação registrada"),
      el("p", {}, "Quando um assinante pedir uma troca, ela aparece aqui para processamento."))));
    return;
  }
  const lista = trocas.filter((t) =>
    (!estado.assinante || t.usuario_id === estado.assinante) && (!estado.estado || t.estado === estado.estado));
  const nomeSelecionado = assinantes.find((a) => a.id === estado.assinante)?.nome;

  const verTodos = el("button", { class: "link link--botao", type: "button" }, "Ver todos os assinantes");
  verTodos.addEventListener("click", () => {
    estado.assinante = "";
    principal.querySelector("#assinante").value = "";
    history.replaceState(null, "", enderecoAtual());
    renderizarResultado();
    principal.querySelector("#assinante").focus();
  });
  const contagem = el("p", { class: "contagem-admin contagem-admin--linha" },
    el("span", {}, lista.length === 1 ? "1 solicitação" : `${lista.length} solicitações`),
    estado.assinante ? verTodos : null);

  if (!lista.length) {
    const limpar = el("button", { class: "botao botao--sec-claro", type: "button" }, "Limpar filtros");
    limpar.addEventListener("click", limparTudo);
    alvo.replaceChildren(contagem, el("section", { class: "cartao cartao--admin" }, el("div", { class: "vazio" },
      el("p", { class: "vazio__titulo" }, nomeSelecionado && !estado.estado ? `Nenhuma solicitação de ${nomeSelecionado}` : "Nenhuma solicitação neste filtro"),
      el("p", {}, "Altere o assinante ou o estado, ou limpe os filtros para ver todas as solicitações."),
      limpar)));
    return;
  }

  const voltar = encodeURIComponent(enderecoAtual());
  alvo.replaceChildren(contagem, el("div", { class: "tabela-caixa" }, el("table", { class: "tabela tabela--admin tabela--trocas" },
    el("caption", { class: "visualmente-oculto" }, "Solicitações de troca"),
    el("thead", {}, el("tr", {}, ...["Solicitação", "Assinante", "Item de origem", "Modalidade", "Estado", "Ações"].map((t) => el("th", { scope: "col" }, t)))),
    el("tbody", {}, ...lista.map((t) => el("tr", {},
      el("th", { scope: "row" },
        el("span", { class: "tabela__principal" }, t.numero),
        el("span", { class: "tabela__apoio" }, dataCurta(t.solicitada_em))),
      el("td", { "data-rotulo": "Assinante" },
        el("span", { class: "tabela__principal" }, t.assinante),
        el("span", { class: "tabela__apoio" }, `${competenciaExtenso(t.competencia)} • ${t.plano_kit}`)),
      el("td", { "data-rotulo": "Item de origem" },
        el("span", { class: "tabela__principal" }, `Camisa ${t.posicao} • ${t.equipe} ${t.temporada}`),
        el("span", { class: "tabela__apoio" }, `${t.categoria} • ${TIPOS[t.tipo]} • ${t.tamanho_original}`)),
      el("td", { "data-rotulo": "Modalidade" },
        el("span", { class: "tabela__principal" }, MODALIDADES[t.modalidade]),
        el("span", { class: "tabela__apoio" }, textoModalidade(t))),
      el("td", { "data-rotulo": "Estado" }, chipDeTroca(t.estado)),
      el("td", { "data-rotulo": "Ações" }, el("div", { class: "acoes-linha" },
        el("a", { class: "link", href: `${TELAS.A10}?troca=${t.troca_id}&voltar=${voltar}` },
          t.estado === "solicitada" ? "Abrir solicitação" : "Consultar registro", el("span", { class: "visualmente-oculto" }, ` ${t.numero}`)),
        el("a", { class: "link", href: linkDoAssinante(t.usuario_id) }, "Ver assinante", el("span", { class: "visualmente-oculto" }, ` ${t.assinante}`))))))))));
}

function renderizarFalhaResultado() {
  const tentar = el("button", { class: "botao botao--sec-claro", type: "button" }, "Tentar novamente");
  tentar.addEventListener("click", () => principal.querySelector("form [type=submit]").click());
  principal.querySelector("[data-resultado]").replaceChildren(el("div", { class: "alerta", role: "alert" },
    el("span", { class: "alerta__icone", "aria-hidden": "true" }, "!"),
    el("div", {}, el("p", { class: "alerta__titulo" }, "Não foi possível atualizar a consulta"),
      el("p", { class: "alerta__texto" }, "Os filtros foram mantidos. Tente consultar novamente.")),
    tentar));
}

(async () => {
  if (!(await exigirAdministrador(principal))) return;
  try {
    await carregar();
  } catch (erro) {
    console.error(erro);
    mostrarFalhaGeral(principal, "Não foi possível consultar as solicitações", () => location.reload());
    return;
  }
  history.replaceState(null, "", enderecoAtual());
  principal.replaceChildren(estrutura());
  principal.setAttribute("aria-busy", "false");
  renderizarResultado();
})();
