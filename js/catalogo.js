// A02 — Catálogo: equipes e camisas com busca, filtro, situação e inativação.
// O catálogo é inativado, não apagado: o histórico dos kits continua íntegro.
// Aba, busca e filtro vivem na URL para que Editar e Voltar retornem à mesma consulta.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { el } from "./cliente.js";
import { criarDialogo } from "./dialogo.js";
import { processando } from "./formulario.js";
import {
  montarCabecalhoAdmin, exigirAdministrador, mostrarFalhaGeral, chipSituacao,
  NATUREZAS, TIPOS_CAMISA, nomeDoPais, normalizar, falhaIncerta,
} from "./admin.js";

avisarSemConfiguracao();
montarCabecalhoAdmin("A02");

const principal = document.querySelector("[data-tela]");
const params = new URLSearchParams(location.search);
const estado = {
  aba: params.get("aba") === "equipes" ? "equipes" : "camisas",
  busca: params.get("busca") || "",
  filtro: params.get("filtro") || "",
};
let equipes = [];
let camisas = [];
let aviso = null; // mensagem de sucesso após inativar

const FILTROS = {
  equipes: { rotulo: "Natureza", todos: "Todas as naturezas", opcoes: NATUREZAS },
  camisas: { rotulo: "Tipo de camisa", todos: "Todos os tipos", opcoes: TIPOS_CAMISA },
};

function enderecoAtual() {
  const url = new URLSearchParams({ aba: estado.aba });
  if (estado.busca) url.set("busca", estado.busca);
  if (estado.filtro) url.set("filtro", estado.filtro);
  return `${TELAS.A02}?${url}`;
}
function voltarPara() {
  return encodeURIComponent(enderecoAtual());
}

async function carregar() {
  const [r1, r2] = await Promise.all([
    supabase.from("equipes").select("id, nome, pais_codigo, natureza, ativo"),
    supabase.from("camisas").select("id, tipo, categoria, temporada, ativo, equipe_id, equipes(nome, natureza)"),
  ]);
  if (r1.error || r2.error) throw r1.error || r2.error;
  equipes = r1.data.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  camisas = r2.data.sort((a, b) =>
    a.equipes.nome.localeCompare(b.equipes.nome, "pt-BR") || b.temporada.localeCompare(a.temporada) || a.categoria.localeCompare(b.categoria));
}

// ---------- Estrutura ----------
function estrutura() {
  const nova = estado.aba === "equipes"
    ? el("a", { class: "botao botao--primaria", href: `${TELAS.A03}?voltar=${voltarPara()}` }, "Nova equipe")
    : el("a", { class: "botao botao--primaria", href: `${TELAS.A04}?voltar=${voltarPara()}` }, "Nova camisa");
  const config = FILTROS[estado.aba];
  const busca = el("input", {
    class: "campo__entrada", id: "busca", name: "busca", type: "search", value: estado.busca,
    placeholder: estado.aba === "equipes" ? "Buscar equipe pelo nome" : "Buscar camisa pela equipe",
  });
  const filtro = el("select", { class: "campo__entrada", id: "filtro", name: "filtro" },
    el("option", { value: "" }, config.todos),
    ...Object.entries(config.opcoes).map(([v, r]) => el("option", { value: v, selected: v === estado.filtro }, r)));

  const form = el("form", { class: "consulta-admin", role: "search", "aria-label": `Consultar ${estado.aba}` },
    el("div", { class: "campo consulta-admin__busca" },
      el("label", { class: "campo__rotulo", for: "busca" }, estado.aba === "equipes" ? "Buscar equipe" : "Buscar camisa"),
      el("div", { class: "campo__caixa" }, busca)),
    el("button", { class: "botao botao--escura consulta-admin__buscar", type: "submit" }, "Buscar"),
    el("div", { class: "campo consulta-admin__filtro" },
      el("label", { class: "campo__rotulo", for: "filtro" }, config.rotulo),
      el("div", { class: "campo__caixa campo__caixa--selecao" }, filtro, el("span", { class: "campo__seta", "aria-hidden": "true" }))),
    el("button", { class: "link consulta-admin__limpar", type: "button", "data-limpar": true }, "Limpar"));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    estado.busca = busca.value.trim();
    estado.filtro = filtro.value;
    atualizar();
  });
  filtro.addEventListener("change", () => {
    estado.filtro = filtro.value;
    estado.busca = busca.value.trim();
    atualizar();
  });
  form.querySelector("[data-limpar]").addEventListener("click", () => {
    estado.busca = "";
    estado.filtro = "";
    busca.value = "";
    filtro.value = "";
    atualizar();
    busca.focus();
  });

  const abas = el("div", { class: "filtros", role: "group", "aria-label": "Seção do catálogo" },
    ...["equipes", "camisas"].map((aba) => {
      const b = el("button", { class: "filtro", type: "button", "aria-pressed": String(estado.aba === aba) }, aba === "equipes" ? "Equipes" : "Camisas");
      b.addEventListener("click", () => {
        if (estado.aba === aba) return;
        estado.aba = aba;
        estado.busca = "";
        estado.filtro = "";
        aviso = null;
        renderizar();
        principal.querySelector(".filtros .filtro[aria-pressed=true]").focus();
      });
      return b;
    }));

  return el("div", { class: "container" },
    el("div", { class: "area-cliente__topo area-cliente__topo--linha" },
      el("div", {},
        el("a", { class: "area-cliente__voltar", href: TELAS.A01 }, el("span", { "aria-hidden": "true" }, "←"), "Voltar ao painel"),
        el("p", { class: "chamada chamada--no-escuro" }, "Administração"),
        el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, "Catálogo"),
        el("p", { class: "area-cliente__sub" }, "Gerencie as equipes e os modelos de camisa do catálogo.")),
      nova),
    el("section", { class: "cartao cartao--admin cartao--consulta", "aria-label": "Consulta do catálogo" }, abas, form),
    el("div", { "data-aviso": true, class: "pilha", role: "status" }),
    el("div", { "data-resultado": true }),
    el("p", { class: "nota-admin" }, "Inativar mantém o registro e o histórico dos kits. Clubes brasileiros não fazem parte do catálogo; seleções, incluindo o Brasil, são permitidas."));
}

// ---------- Resultados ----------
function acoesLinha(...itens) {
  return el("div", { class: "acoes-linha" }, ...itens.filter(Boolean));
}

function tabelaEquipes(lista) {
  return el("table", { class: "tabela tabela--admin" },
    el("caption", { class: "visualmente-oculto" }, "Equipes do catálogo"),
    el("thead", {}, el("tr", {}, ...["Equipe", "País", "Natureza", "Situação", "Ações"].map((t) => el("th", { scope: "col" }, t)))),
    el("tbody", {}, ...lista.map((e) => el("tr", {},
      el("th", { scope: "row" }, el("span", { class: "tabela__principal" }, e.nome)),
      el("td", { "data-rotulo": "País" }, nomeDoPais(e.pais_codigo)),
      el("td", { "data-rotulo": "Natureza" }, NATUREZAS[e.natureza]),
      el("td", { "data-rotulo": "Situação" }, chipSituacao(e.ativo)),
      el("td", { "data-rotulo": "Ações" }, acoesLinha(
        el("a", { class: "link", href: `${TELAS.A03}?id=${e.id}&voltar=${voltarPara()}` }, "Editar", el("span", { class: "visualmente-oculto" }, ` ${e.nome}`)),
        e.ativo ? botaoInativar("equipe", e.id, e.nome) : null))))));
}

function tabelaCamisas(lista) {
  return el("table", { class: "tabela tabela--admin" },
    el("caption", { class: "visualmente-oculto" }, "Camisas do catálogo"),
    el("thead", {}, el("tr", {}, ...["Equipe", "Tipo", "Categoria", "Temporada", "Situação", "Ações"].map((t) => el("th", { scope: "col" }, t)))),
    el("tbody", {}, ...lista.map((c) => {
      const nome = `${c.equipes.nome} ${c.categoria} ${c.temporada}`;
      return el("tr", {},
        el("th", { scope: "row" }, el("span", { class: "tabela__principal" }, c.equipes.nome)),
        el("td", { "data-rotulo": "Tipo" }, TIPOS_CAMISA[c.tipo]),
        el("td", { "data-rotulo": "Categoria" }, c.categoria),
        el("td", { "data-rotulo": "Temporada" }, c.temporada),
        el("td", { "data-rotulo": "Situação" }, chipSituacao(c.ativo)),
        el("td", { "data-rotulo": "Ações" }, acoesLinha(
          el("a", { class: "link", href: `${TELAS.A04}?id=${c.id}&voltar=${voltarPara()}` }, "Editar", el("span", { class: "visualmente-oculto" }, ` ${nome}`)),
          c.ativo ? botaoInativar("camisa", c.id, nome) : null,
          el("a", { class: "link", href: `${TELAS.A05}?camisa=${c.id}` }, "Ver estoque", el("span", { class: "visualmente-oculto" }, ` de ${nome}`)))));
    })));
}

function filtrar() {
  const termo = normalizar(estado.busca);
  if (estado.aba === "equipes") {
    return equipes.filter((e) => (!termo || normalizar(e.nome).includes(termo)) && (!estado.filtro || e.natureza === estado.filtro));
  }
  return camisas.filter((c) => (!termo || normalizar(c.equipes.nome).includes(termo)) && (!estado.filtro || c.tipo === estado.filtro));
}

function renderizarResultado() {
  const alvo = principal.querySelector("[data-resultado]");
  const total = estado.aba === "equipes" ? equipes.length : camisas.length;
  const lista = filtrar();
  const nomeAba = estado.aba === "equipes" ? "equipe" : "camisa";
  if (!total) {
    alvo.replaceChildren(el("section", { class: "cartao cartao--admin" }, el("div", { class: "vazio" },
      el("p", { class: "vazio__titulo" }, estado.aba === "equipes" ? "Nenhuma equipe cadastrada" : "Nenhuma camisa cadastrada"),
      el("p", {}, `Use “Nova ${nomeAba}” para começar o catálogo.`))));
    return;
  }
  if (!lista.length) {
    const limpar = el("button", { class: "botao botao--sec-claro", type: "button" }, "Limpar busca e filtro");
    limpar.addEventListener("click", () => principal.querySelector("[data-limpar]").click());
    alvo.replaceChildren(el("section", { class: "cartao cartao--admin" }, el("div", { class: "vazio" },
      el("p", { class: "vazio__titulo" }, `Nenhuma ${nomeAba} encontrada`),
      el("p", {}, "Revise o termo buscado ou o filtro selecionado."),
      limpar)));
    return;
  }
  const contagem = el("p", { class: "contagem-admin" },
    lista.length === 1 ? `1 ${nomeAba}` : `${lista.length} ${nomeAba}s`,
    lista.length < total ? ` de ${total}` : "");
  alvo.replaceChildren(contagem, el("div", { class: "tabela-caixa" }, estado.aba === "equipes" ? tabelaEquipes(lista) : tabelaCamisas(lista)));
}

function atualizar() {
  history.replaceState(null, "", enderecoAtual());
  renderizarResultado();
}

function mostrarAviso() {
  const alvo = principal.querySelector("[data-aviso]");
  alvo.replaceChildren();
  if (!aviso) return;
  alvo.append(el("div", { class: `alerta ${aviso.tipo === "sucesso" ? "alerta--sucesso" : ""}`, tabindex: "-1" },
    el("span", { class: "alerta__icone", "aria-hidden": "true" }, aviso.tipo === "sucesso" ? "✓" : "!"),
    el("div", {}, el("p", { class: "alerta__titulo" }, aviso.titulo), el("p", { class: "alerta__texto" }, aviso.texto))));
}

function renderizar() {
  principal.replaceChildren(estrutura());
  principal.append(dialogoInativar.elemento);
  history.replaceState(null, "", enderecoAtual());
  mostrarAviso();
  renderizarResultado();
}

// ---------- Inativação ----------
const caixaDialogo = el("dialog", { class: "dialogo", "aria-labelledby": "titulo-inativar" },
  el("div", { class: "dialogo__caixa" },
    el("div", { class: "dialogo__topo" },
      el("h2", { class: "dialogo__titulo", id: "titulo-inativar", tabindex: "-1", "data-foco-inicial": true }, "Inativar registro?"),
      el("button", { class: "botao botao--sec-claro", type: "button", "data-fechar-dialogo": true, "aria-label": "Fechar" }, "✕")),
    el("p", { class: "dialogo__texto", "data-texto": true }),
    el("div", { class: "alerta", role: "alert", hidden: true, "data-erro": true },
      el("span", { class: "alerta__icone", "aria-hidden": "true" }, "!"),
      el("div", {}, el("p", { class: "alerta__titulo" }), el("p", { class: "alerta__texto" }))),
    el("div", { class: "dialogo__acoes" },
      el("button", { class: "botao botao--sec-claro", type: "button", "data-fechar-dialogo": true }, "Manter ativo"),
      el("button", { class: "botao botao--escura", type: "button", "data-confirmar": true }, "Confirmar inativação"))));
const dialogoInativar = criarDialogo(caixaDialogo);
let alvoInativar = null;

function botaoInativar(tipo, id, nome) {
  const b = el("button", { class: "link link--botao", type: "button" }, "Inativar", el("span", { class: "visualmente-oculto" }, ` ${nome}`));
  b.addEventListener("click", () => {
    alvoInativar = { tipo, id, nome };
    caixaDialogo.querySelector("#titulo-inativar").textContent = tipo === "equipe" ? "Inativar equipe?" : "Inativar camisa?";
    caixaDialogo.querySelector("[data-texto]").textContent = tipo === "equipe"
      ? `${nome} deixa de ser oferecida em novos cadastros. O registro, as camisas e o histórico dos kits são mantidos. Você pode reativá-la na edição.`
      : `${nome} deixa de aparecer na coleção e em novas montagens. O registro e o histórico dos kits são mantidos. Você pode reativá-la na edição.`;
    caixaDialogo.querySelector("[data-erro]").hidden = true;
    dialogoInativar.abrir(b);
  });
  return b;
}

caixaDialogo.querySelector("[data-confirmar]").addEventListener("click", async (e) => {
  const botao = e.currentTarget;
  const erro = caixaDialogo.querySelector("[data-erro]");
  erro.hidden = true;
  processando(botao, true, "Inativando…");
  dialogoInativar.bloquear(true);
  const { tipo, id, nome } = alvoInativar;
  const { error } = await supabase.rpc(tipo === "equipe" ? "admin_inativar_equipe" : "admin_inativar_camisa", { p_id: id });
  processando(botao, false);
  dialogoInativar.bloquear(false);
  if (error) {
    console.error(error);
    erro.querySelector(".alerta__titulo").textContent = falhaIncerta(error) ? "Não foi possível confirmar o resultado" : "Não foi possível inativar";
    erro.querySelector(".alerta__texto").textContent = falhaIncerta(error)
      ? "Atualize a consulta antes de tentar novamente."
      : "Tente novamente. Se o problema continuar, atualize a consulta.";
    erro.hidden = false;
    if (falhaIncerta(error)) {
      dialogoInativar.fechar();
      await recarregar({ tipo: "erro", titulo: "Não foi possível confirmar o resultado", texto: `Consulta atualizada. Confira a situação de ${nome} antes de tentar novamente.` });
    }
    return;
  }
  dialogoInativar.fechar();
  await recarregar({ tipo: "sucesso", titulo: tipo === "equipe" ? "Equipe inativada" : "Camisa inativada", texto: `${nome} foi inativada. O histórico permanece consultável.` });
});

async function recarregar(novoAviso) {
  try {
    await carregar();
  } catch (erro) {
    console.error(erro);
  }
  aviso = novoAviso;
  mostrarAviso();
  renderizarResultado();
  principal.querySelector("[data-aviso] .alerta")?.focus();
}

(async () => {
  if (!(await exigirAdministrador(principal))) return;
  try {
    await carregar();
  } catch (erro) {
    console.error(erro);
    mostrarFalhaGeral(principal, "Não foi possível carregar o catálogo", () => location.reload());
    return;
  }
  renderizar();
  principal.setAttribute("aria-busy", "false");
})();
