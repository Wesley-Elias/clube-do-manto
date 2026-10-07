// A05 — Estoque: saldo por modelo e tamanho, cadastro de saldo de um tamanho novo
// e reposição de unidades. Tamanho é dimensão do estoque, não outro modelo.
// Não há baixa arbitrária nem edição livre: kits e trocas baixam o estoque nas
// próprias operações, e a reposição após uma troca é explícita.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { el } from "./cliente.js";
import { criarDialogo } from "./dialogo.js";
import { marcarErro, limparErros, processando } from "./formulario.js";
import {
  montarCabecalhoAdmin, exigirAdministrador, mostrarFalhaGeral, chipSaldo,
  TIPOS_CAMISA, TAMANHOS, dataHora, nomeDoModelo, codigoDoErro, falhaIncerta,
} from "./admin.js";

avisarSemConfiguracao();
montarCabecalhoAdmin("A05");

const principal = document.querySelector("[data-tela]");
const params = new URLSearchParams(location.search);
let filtroModelo = params.get("camisa") || "";
let camisas = [];
let linhas = [];
let aviso = null;

async function carregar() {
  const [r1, r2] = await Promise.all([
    supabase.from("camisas").select("id, tipo, categoria, temporada, ativo, equipes(nome)"),
    supabase.from("estoque").select("camisa_id, tamanho, quantidade, atualizado_em"),
  ]);
  if (r1.error || r2.error) throw r1.error || r2.error;
  camisas = r1.data.sort((a, b) =>
    a.equipes.nome.localeCompare(b.equipes.nome, "pt-BR") || b.temporada.localeCompare(a.temporada) || a.categoria.localeCompare(b.categoria));
  const ordem = new Map(camisas.map((c, i) => [c.id, i]));
  linhas = r2.data
    .filter((l) => ordem.has(l.camisa_id))
    .sort((a, b) => ordem.get(a.camisa_id) - ordem.get(b.camisa_id) || TAMANHOS.indexOf(a.tamanho) - TAMANHOS.indexOf(b.tamanho));
}

const camisaPorId = (id) => camisas.find((c) => String(c.id) === String(id)) || null;
const tamanhosLivres = (camisaId) => TAMANHOS.filter((t) => !linhas.some((l) => l.camisa_id === Number(camisaId) && l.tamanho === t));

// ---------- Estrutura ----------
function estrutura() {
  const cadastrar = el("button", { class: "botao botao--primaria", type: "button" }, "Cadastrar saldo");
  cadastrar.addEventListener("click", () => abrirCadastro(cadastrar, filtroModelo));

  const seletor = el("select", { class: "campo__entrada", id: "filtro-modelo" },
    el("option", { value: "" }, "Todos os modelos"),
    ...camisas.map((c) => el("option", { value: String(c.id), selected: String(c.id) === filtroModelo }, `${nomeDoModelo(c)}${c.ativo ? "" : " (inativa)"}`)));
  seletor.addEventListener("change", () => {
    filtroModelo = seletor.value;
    history.replaceState(null, "", filtroModelo ? `${TELAS.A05}?camisa=${filtroModelo}` : TELAS.A05);
    aviso = null;
    mostrarAviso();
    renderizarTabela();
  });

  return el("div", { class: "container" },
    el("div", { class: "area-cliente__topo area-cliente__topo--linha" },
      el("div", {},
        el("a", { class: "area-cliente__voltar", href: TELAS.A01 }, el("span", { "aria-hidden": "true" }, "←"), "Voltar ao painel"),
        el("p", { class: "chamada chamada--no-escuro" }, "Administração / Estoque"),
        el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, "Estoque"),
        el("p", { class: "area-cliente__sub" }, "Consulte o saldo de cada modelo por tamanho e registre novas unidades.")),
      cadastrar),
    el("div", { class: "alerta alerta--info alerta--topo" },
      el("span", { class: "alerta__icone", "aria-hidden": "true" }, "i"),
      el("div", {},
        el("p", { class: "alerta__titulo" }, "Cadastro e reposição"),
        el("p", { class: "alerta__texto" }, "Cadastre um tamanho ainda não registrado ou reponha unidades. As baixas de kits e trocas são realizadas nas respectivas operações."))),
    el("div", { class: "campo filtro-modelo" },
      el("label", { class: "campo__rotulo", for: "filtro-modelo" }, "Modelo"),
      el("div", { class: "campo__caixa campo__caixa--selecao" }, seletor, el("span", { class: "campo__seta", "aria-hidden": "true" }))),
    el("div", { "data-aviso": true, class: "pilha", role: "status" }),
    el("div", { "data-tabela": true, "aria-live": "polite" }));
}

function renderizarTabela() {
  const alvo = principal.querySelector("[data-tabela]");
  const visiveis = filtroModelo ? linhas.filter((l) => String(l.camisa_id) === filtroModelo) : linhas;
  if (!visiveis.length) {
    const camisa = camisaPorId(filtroModelo);
    const acao = camisa?.ativo || (!filtroModelo && camisas.some((c) => c.ativo))
      ? el("button", { class: "botao botao--sec-claro", type: "button" }, "Cadastrar saldo")
      : null;
    acao?.addEventListener("click", () => abrirCadastro(acao, filtroModelo));
    alvo.replaceChildren(el("section", { class: "cartao cartao--admin" }, el("div", { class: "vazio" },
      el("p", { class: "vazio__titulo" }, camisa ? "Nenhum tamanho registrado para este modelo" : "Nenhuma linha de estoque registrada"),
      el("p", {}, camisa
        ? (camisa.ativo ? "Cadastre o saldo de um tamanho para que o modelo possa entrar nos kits." : "Esta camisa está inativa e não recebe novos saldos.")
        : "Cadastre o saldo de um modelo e tamanho para começar."),
      acao)));
    return;
  }
  alvo.replaceChildren(el("div", { class: "tabela-caixa" }, el("table", { class: "tabela tabela--admin" },
    el("caption", { class: "visualmente-oculto" }, "Saldo por modelo e tamanho"),
    el("thead", {}, el("tr", {}, ...["Modelo", "Tamanho", "Saldo", "Última atualização", "Ações"].map((t) => el("th", { scope: "col" }, t)))),
    el("tbody", {}, ...visiveis.map((l) => {
      const c = camisaPorId(l.camisa_id);
      const repor = el("button", { class: "link link--botao", type: "button" }, "Repor", el("span", { class: "visualmente-oculto" }, ` ${c.equipes.nome} ${c.categoria} ${c.temporada} tamanho ${l.tamanho}`));
      repor.addEventListener("click", () => abrirReposicao(repor, l));
      return el("tr", {},
        el("th", { scope: "row" },
          el("span", { class: "tabela__principal" }, c.equipes.nome),
          el("span", { class: "tabela__apoio" }, `${TIPOS_CAMISA[c.tipo]} • ${c.categoria} • ${c.temporada}${c.ativo ? "" : " • inativa"}`)),
        el("td", { "data-rotulo": "Tamanho" }, l.tamanho),
        el("td", { "data-rotulo": "Saldo" }, el("div", { class: "saldo" }, el("span", { class: "saldo__valor" }, String(l.quantidade)), chipSaldo(l.quantidade))),
        el("td", { "data-rotulo": "Última atualização" }, dataHora(l.atualizado_em)),
        el("td", { "data-rotulo": "Ações" }, el("div", { class: "acoes-linha" },
          repor,
          el("a", { class: "link", href: `${TELAS.A04}?id=${c.id}` }, "Consultar modelo", el("span", { class: "visualmente-oculto" }, ` ${c.equipes.nome} ${c.categoria} ${c.temporada}`)))));
    })))));
}

function mostrarAviso() {
  const alvo = principal.querySelector("[data-aviso]");
  alvo.replaceChildren();
  if (!aviso) return;
  alvo.append(el("div", { class: `alerta ${aviso.tipo === "sucesso" ? "alerta--sucesso" : "alerta--aviso"}`, tabindex: "-1" },
    el("span", { class: "alerta__icone", "aria-hidden": "true" }, aviso.tipo === "sucesso" ? "✓" : "!"),
    el("div", {}, el("p", { class: "alerta__titulo" }, aviso.titulo), el("p", { class: "alerta__texto" }, aviso.texto))));
  alvo.querySelector(".alerta").focus();
}

async function recarregar(novoAviso) {
  try {
    await carregar();
  } catch (erro) {
    console.error(erro);
    novoAviso = { tipo: "erro", titulo: "Não foi possível atualizar a consulta", texto: "Recarregue a página para conferir o saldo antes de registrar outra operação." };
  }
  aviso = novoAviso;
  renderizarTabela();
  mostrarAviso();
}

// ---------- Diálogo: cadastrar saldo / repor ----------
const caixa = el("dialog", { class: "dialogo", "aria-labelledby": "titulo-estoque" },
  el("form", { class: "dialogo__caixa", novalidate: true, method: "dialog" },
    el("div", { class: "dialogo__topo" },
      el("h2", { class: "dialogo__titulo", id: "titulo-estoque", tabindex: "-1" }, "Cadastrar saldo"),
      el("button", { class: "botao botao--sec-claro", type: "button", "data-fechar-dialogo": true, "aria-label": "Fechar" }, "✕")),
    el("p", { class: "dialogo__texto", "data-texto": true }),
    el("div", { class: "alerta", role: "alert", hidden: true, "data-erro": true },
      el("span", { class: "alerta__icone", "aria-hidden": "true" }, "!"),
      el("div", {}, el("p", { class: "alerta__titulo" }), el("p", { class: "alerta__texto" }))),
    el("div", { class: "pilha pilha--16", "data-campos": true }),
    el("div", { class: "dialogo__acoes" },
      el("button", { class: "botao botao--sec-claro", type: "button", "data-fechar-dialogo": true }, "Cancelar"),
      el("button", { class: "botao botao--escura", type: "submit", "data-enviar": true }, "Cadastrar saldo"))));
const dialogo = criarDialogo(caixa);
const formDialogo = caixa.querySelector("form");
let modo = null; // { tipo: "cadastrar" } | { tipo: "repor", linha }

function campoSelecao(id, rotulo, opcoes, valor) {
  return el("div", { class: "campo" },
    el("label", { class: "campo__rotulo", for: id }, rotulo),
    el("div", { class: "campo__caixa campo__caixa--selecao" },
      el("select", { class: "campo__entrada", id, name: id },
        ...opcoes.map(([v, r]) => el("option", { value: v, selected: v === valor }, r))),
      el("span", { class: "campo__seta", "aria-hidden": "true" })),
    el("p", { class: "campo__erro", id: `erro-${id}` }));
}
function campoQuantidade(ajuda) {
  return el("div", { class: "campo" },
    el("label", { class: "campo__rotulo", for: "quantidade" }, "Quantidade"),
    el("div", { class: "campo__caixa" },
      el("input", { class: "campo__entrada", id: "quantidade", name: "quantidade", type: "text", inputmode: "numeric", autocomplete: "off", "aria-describedby": "ajuda-quantidade" })),
    el("p", { class: "campo__ajuda", id: "ajuda-quantidade" }, ajuda),
    el("p", { class: "campo__erro", id: "erro-quantidade" }));
}

function prepararDialogo(titulo, texto, botao) {
  caixa.querySelector("#titulo-estoque").textContent = titulo;
  caixa.querySelector("[data-texto]").textContent = texto;
  caixa.querySelector("[data-enviar]").textContent = botao;
  caixa.querySelector("[data-erro]").hidden = true;
}

function atualizarTamanhos() {
  const modelo = formDialogo.modelo.value;
  const livres = modelo ? tamanhosLivres(modelo) : [];
  const select = formDialogo.tamanho;
  select.replaceChildren(
    el("option", { value: "" }, !modelo ? "Escolha o modelo primeiro" : livres.length ? "Selecione o tamanho" : "Todos os tamanhos já registrados"),
    ...livres.map((t) => el("option", { value: t }, t)));
  select.disabled = !livres.length;
  const nota = caixa.querySelector("[data-nota-tamanhos]");
  nota.textContent = modelo && !livres.length
    ? "Este modelo já tem P, M, G e GG registrados. Use Repor na tabela para adicionar unidades."
    : "Mostra só os tamanhos oficiais (P, M, G e GG) ainda não registrados para o modelo.";
}

function abrirCadastro(gatilho, camisaId = "") {
  modo = { tipo: "cadastrar" };
  prepararDialogo("Cadastrar saldo", "Registre a quantidade inicial de um tamanho ainda não cadastrado para o modelo.", "Cadastrar saldo");
  const ativas = camisas.filter((c) => c.ativo);
  const inicial = ativas.some((c) => String(c.id) === String(camisaId)) ? String(camisaId) : "";
  const campos = caixa.querySelector("[data-campos]");
  campos.replaceChildren(
    campoSelecao("modelo", "Modelo", [["", "Selecione o modelo"], ...ativas.map((c) => [String(c.id), nomeDoModelo(c)])], inicial),
    el("div", { class: "campo" },
      el("label", { class: "campo__rotulo", for: "tamanho" }, "Tamanho"),
      el("div", { class: "campo__caixa campo__caixa--selecao" },
        el("select", { class: "campo__entrada", id: "tamanho", name: "tamanho", "aria-describedby": "nota-tamanhos" }),
        el("span", { class: "campo__seta", "aria-hidden": "true" })),
      el("p", { class: "campo__ajuda", id: "nota-tamanhos", "data-nota-tamanhos": true }),
      el("p", { class: "campo__erro", id: "erro-tamanho" })),
    campoQuantidade("Número inteiro, zero ou maior. Zero registra o tamanho sem saldo."));
  formDialogo.modelo.addEventListener("change", atualizarTamanhos);
  atualizarTamanhos();
  dialogo.abrir(gatilho);
  (inicial ? formDialogo.tamanho : formDialogo.modelo).focus();
}

function abrirReposicao(gatilho, linha) {
  modo = { tipo: "repor", linha };
  const c = camisaPorId(linha.camisa_id);
  prepararDialogo("Repor unidades", "Some unidades ao saldo atual. A reposição não desfaz baixas de kits ou trocas.", "Repor unidades");
  caixa.querySelector("[data-campos]").replaceChildren(
    el("dl", { class: "dados dados-caixa" },
      el("div", {}, el("dt", {}, "Modelo"), el("dd", {}, nomeDoModelo(c))),
      el("div", {}, el("dt", {}, "Tamanho"), el("dd", {}, linha.tamanho)),
      el("div", {}, el("dt", {}, "Saldo atual"), el("dd", {}, String(linha.quantidade)))),
    campoQuantidade("Número inteiro maior que zero."));
  dialogo.abrir(gatilho);
  formDialogo.quantidade.focus();
}

const MENSAGENS = {
  quantidade_invalida: ["quantidade", "Informe uma quantidade inteira válida (até 10.000 por operação)."],
  tamanho_invalido: ["tamanho", "Escolha um dos tamanhos oficiais: P, M, G ou GG."],
  tamanho_ja_registrado: ["tamanho", "Este tamanho já está registrado para o modelo. Use Repor na tabela."],
  camisa_inativa: ["modelo", "Esta camisa está inativa e não recebe novos saldos."],
  camisa_inexistente: ["modelo", "Este modelo não existe mais no catálogo."],
  saldo_inexistente: ["quantidade", "Este tamanho não está registrado para o modelo."],
};

formDialogo.addEventListener("submit", async (e) => {
  e.preventDefault();
  const erroGeral = caixa.querySelector("[data-erro]");
  erroGeral.hidden = true;
  limparErros(formDialogo);

  const texto = formDialogo.quantidade.value.trim();
  const repor = modo.tipo === "repor";
  const erros = [];
  let modelo = null;
  let tamanho = null;
  if (repor) {
    modelo = modo.linha.camisa_id;
    tamanho = modo.linha.tamanho;
  } else {
    modelo = formDialogo.modelo.value;
    tamanho = formDialogo.tamanho.value;
    if (!modelo) erros.push(["modelo", "Selecione o modelo."]);
    else if (!tamanho) erros.push(["tamanho", tamanhosLivres(modelo).length ? "Selecione o tamanho." : "Todos os tamanhos deste modelo já estão registrados."]);
  }
  const quantidade = /^\d+$/.test(texto) ? Number(texto) : NaN;
  if (!texto) erros.push(["quantidade", "Informe a quantidade."]);
  else if (!Number.isInteger(quantidade)) erros.push(["quantidade", "Use apenas números inteiros, sem vírgula ou sinal."]);
  else if (repor && quantidade < 1) erros.push(["quantidade", "A reposição precisa de pelo menos 1 unidade."]);
  else if (quantidade > 10000) erros.push(["quantidade", "Registre até 10.000 unidades por operação."]);
  if (erros.length) {
    erros.forEach(([campo, msg]) => marcarErro(formDialogo[campo], msg));
    formDialogo[erros[0][0]].focus();
    return;
  }

  const botao = caixa.querySelector("[data-enviar]");
  processando(botao, true, repor ? "Repondo…" : "Cadastrando…");
  dialogo.bloquear(true);
  const { data, error } = await supabase.rpc(repor ? "admin_repor_estoque" : "admin_cadastrar_saldo", {
    p_camisa_id: Number(modelo),
    p_tamanho: tamanho,
    p_quantidade: quantidade,
  });
  processando(botao, false);
  dialogo.bloquear(false);
  const c = camisaPorId(modelo);

  if (error) {
    console.error(error);
    const conhecido = MENSAGENS[codigoDoErro(error)];
    if (conhecido && formDialogo[conhecido[0]]) {
      marcarErro(formDialogo[conhecido[0]], conhecido[1]);
      formDialogo[conhecido[0]].focus();
      return;
    }
    if (falhaIncerta(error)) {
      // A operação pode ter sido gravada: consulta antes de permitir repetir
      dialogo.fechar();
      await recarregar({ tipo: "erro", titulo: "Não foi possível confirmar o resultado", texto: "A consulta foi atualizada. Confira o saldo na tabela antes de tentar novamente." });
      return;
    }
    erroGeral.querySelector(".alerta__titulo").textContent = repor ? "Não foi possível repor" : "Não foi possível cadastrar o saldo";
    erroGeral.querySelector(".alerta__texto").textContent = "Tente novamente em instantes.";
    erroGeral.hidden = false;
    return;
  }

  dialogo.fechar();
  if (!repor && filtroModelo && filtroModelo !== String(modelo)) {
    filtroModelo = String(modelo);
    principal.querySelector("#filtro-modelo").value = filtroModelo;
    history.replaceState(null, "", `${TELAS.A05}?camisa=${filtroModelo}`);
  }
  await recarregar(repor
    ? { tipo: "sucesso", titulo: "Reposição registrada", texto: `${c.equipes.nome} ${c.categoria} ${c.temporada}, tamanho ${tamanho}: +${quantidade} ${quantidade === 1 ? "unidade" : "unidades"}. Saldo atual: ${data.quantidade}.` }
    : { tipo: "sucesso", titulo: "Saldo cadastrado", texto: `${c.equipes.nome} ${c.categoria} ${c.temporada}, tamanho ${tamanho}: ${data.quantidade} ${data.quantidade === 1 ? "unidade" : "unidades"}.` });
});

(async () => {
  if (!(await exigirAdministrador(principal))) return;
  try {
    await carregar();
  } catch (erro) {
    console.error(erro);
    mostrarFalhaGeral(principal, "Não foi possível carregar o estoque", () => location.reload());
    return;
  }
  if (filtroModelo && !camisaPorId(filtroModelo)) filtroModelo = "";
  principal.replaceChildren(estrutura(), caixa);
  principal.setAttribute("aria-busy", "false");
  renderizarTabela();
  if (params.get("cadastrar") === "1" && camisaPorId(filtroModelo)?.ativo) {
    history.replaceState(null, "", `${TELAS.A05}?camisa=${filtroModelo}`);
    abrirCadastro(principal.querySelector(".area-cliente__topo .botao"), filtroModelo);
  }
})();
