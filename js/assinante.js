// A07 — Detalhes do assinante: perfil e preferências, assinatura, kits por mês,
// histórico de modelos e acesso à montagem do kit e às solicitações de troca.
// O administrador consulta os registros; não edita perfil, não concede trocas e
// não altera o histórico. Aba e kit aberto ficam na URL (?aba=historico, ?kit=).
import { avisarSemConfiguracao } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { el, chip, dataCurta } from "./cliente.js";
import { montarCabecalhoAdmin, exigirAdministrador, mostrarFalhaGeral, codigoDoErro } from "./admin.js";
import { camisaDoKit, faixaDeDados, descricaoCamisa, tipoDaCamisa, MODALIDADES, composicaoRegistrada } from "./kits-comum.js";
import {
  carregarAssinante, situacaoDoKit, INELEGIVEL, alerta, cartaoPerfil, chipAssinatura, composicaoDoPlano,
  textoTrocasDoPlano, composicaoRegistradaCurta, brindeDoKit, retornoSeguro, rotuloCompetencia,
} from "./admin-operacao.js";

avisarSemConfiguracao();
montarCabecalhoAdmin("A06");

const principal = document.querySelector("[data-tela]");
const params = new URLSearchParams(location.search);
const usuarioId = params.get("id") || "";
const voltar = retornoSeguro(params.get("voltar"), TELAS.A06, [TELAS.A06]);
let aba = params.get("aba") === "historico" ? "historico" : "kits";
let kitAberto = params.get("kit") || "";
let dados = null;

function enderecoAtual() {
  const url = new URLSearchParams({ id: usuarioId });
  if (aba === "historico") url.set("aba", "historico");
  else if (kitAberto) url.set("kit", kitAberto);
  if (voltar !== TELAS.A06) url.set("voltar", voltar);
  return `${TELAS.A07}?${url}`;
}

function topo() {
  return el("div", { class: "area-cliente__topo" },
    el("a", { class: "area-cliente__voltar", href: voltar }, el("span", { "aria-hidden": "true" }, "←"), "Voltar aos assinantes"),
    el("p", { class: "chamada chamada--no-escuro" }, "Administração / Assinantes / Detalhes"),
    el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, "Detalhes do assinante"),
    el("p", { class: "area-cliente__sub" }, "Consulte o perfil, a assinatura e os registros operacionais deste titular."));
}

// ---------- Cartão da competência ----------
function cartaoCompetencia() {
  const situacao = situacaoDoKit(dados);
  const filhos = [el("p", { class: "chamada chamada--neutra" }, `Competência de referência: ${rotuloCompetencia(dados.competencia)}`)];
  if (situacao === "pronto") {
    filhos.push(
      alerta("info", "Elegível para o kit do mês", `Ainda não há um kit registrado para ${rotuloCompetencia(dados.competencia)}. A montagem deve verificar todas as regras antes de registrar o kit completo.`),
      el("a", { class: "botao botao--primaria", href: `${TELAS.A08}?id=${encodeURIComponent(usuarioId)}` }, "Montar kit do mês"));
  } else if (situacao === "kit_existente") {
    const consultar = el("button", { class: "botao botao--sec-claro", type: "button" }, "Consultar kit do mês");
    consultar.addEventListener("click", () => abrirKit(dados.competencia));
    filhos.push(
      alerta("info", "Kit do mês já registrado", `${rotuloCompetencia(dados.competencia)} já possui um kit. Consulte a composição e o histórico desse registro.`),
      consultar);
  } else {
    const [titulo, texto] = INELEGIVEL[situacao];
    filhos.push(alerta("aviso", titulo, texto));
  }
  return el("section", { class: "cartao cartao--admin cartao--competencia", "aria-label": "Kit do mês" }, ...filhos);
}

// ---------- Abas ----------
function abas() {
  const grupo = el("div", { class: "abas", role: "tablist", "aria-label": "Registros do assinante" });
  for (const [chave, rotulo] of [["kits", "Kits por mês"], ["historico", "Histórico de modelos"]]) {
    const atual = chave === aba;
    const botao = el("button", { class: "aba", type: "button", role: "tab", "aria-selected": String(atual), id: `aba-${chave}`, "aria-controls": "painel-registros" },
      atual ? el("span", { "aria-hidden": "true" }, "✓") : null, rotulo);
    botao.addEventListener("click", () => {
      if (chave === aba && !kitAberto) return;
      aba = chave;
      kitAberto = "";
      history.replaceState(null, "", enderecoAtual());
      renderizarRegistros();
      principal.querySelector(`#aba-${chave}`).focus();
    });
    grupo.append(botao);
  }
  return grupo;
}

function abrirKit(competencia) {
  aba = "kits";
  kitAberto = competencia;
  history.replaceState(null, "", enderecoAtual());
  renderizarRegistros();
  principal.querySelector("#titulo-kit")?.focus();
}

function tabelaKits() {
  if (!dados.kits.length) {
    return el("div", { class: "vazio" },
      el("p", { class: "vazio__titulo" }, "Nenhum kit registrado"),
      el("p", {}, "Os kits montados para este titular aparecem aqui, com a composição registrada em cada mês."));
  }
  return el("table", { class: "tabela" },
    el("caption", { class: "visualmente-oculto" }, "Kits por mês"),
    el("thead", {}, el("tr", {}, ...["Competência", "Plano registrado", "Composição registrada", "Brinde", "Ação"].map((t) => el("th", { scope: "col" }, t)))),
    el("tbody", {}, ...dados.kits.map((k) => {
      const consultar = el("button", { class: "link link--botao", type: "button" }, "Consultar kit",
        el("span", { class: "visualmente-oculto" }, ` de ${rotuloCompetencia(k.competencia)}`));
      consultar.addEventListener("click", () => abrirKit(k.competencia));
      return el("tr", {},
        el("th", { scope: "row" }, el("span", { class: "tabela__principal" }, rotuloCompetencia(k.competencia))),
        el("td", { "data-rotulo": "Plano registrado" }, k.plano),
        el("td", { "data-rotulo": "Composição registrada" }, composicaoRegistradaCurta(k)),
        el("td", { "data-rotulo": "Brinde" }, brindeDoKit(k)),
        el("td", { "data-rotulo": "Ação" }, el("div", { class: "acoes-linha" }, consultar)));
    })));
}

function tabelaHistorico() {
  if (!dados.itens.length) {
    return el("div", { class: "vazio" },
      el("p", { class: "vazio__titulo" }, "Nenhum modelo registrado"),
      el("p", {}, "Os modelos recebidos em kits e trocas aparecem aqui e não se repetem para este titular."));
  }
  return el("table", { class: "tabela" },
    el("caption", { class: "visualmente-oculto" }, "Histórico de modelos"),
    el("thead", {}, el("tr", {}, ...["Modelo", "Tipo", "Tamanho", "Competência", "Situação no kit"].map((t) => el("th", { scope: "col" }, t)))),
    el("tbody", {}, ...dados.itens.map((i) => el("tr", {},
      el("th", { scope: "row" },
        el("span", { class: "tabela__principal" }, i.camisas.equipes.nome),
        el("span", { class: "tabela__apoio" }, descricaoCamisa(i.camisas))),
      el("td", { "data-rotulo": "Tipo" }, tipoDaCamisa(i.camisas)),
      el("td", { "data-rotulo": "Tamanho" }, i.tamanho_atual),
      el("td", { "data-rotulo": "Competência" }, rotuloCompetencia(i.competencia)),
      el("td", { "data-rotulo": "Situação no kit" }, i.estado === "atual" ? chip("Atual", "sucesso", "●") : chip("Substituída", "neutro", "→"))))));
}

// ---------- Kit aberto ----------
function blocoDoKit(kit) {
  const itens = dados.itens.filter((i) => i.competencia === kit.competencia);
  const trocas = dados.trocas.filter((t) => itens.some((i) => i.camisa_id === t.camisa_original_id));
  const pendente = (item) => trocas.some((t) => t.camisa_original_id === item.camisa_id && t.estado === "solicitada");
  const atuais = itens.filter((i) => i.estado === "atual").sort((a, b) => a.posicao - b.posicao);
  const originais = itens.filter((i) => i.origem === "kit").sort((a, b) => a.posicao - b.posicao);
  const houveMudanca = itens.some((i) => i.estado === "substituida" || i.tamanho_inicial !== i.tamanho_atual);

  const recolher = el("button", { class: "link link--botao", type: "button" }, "Recolher kit");
  recolher.addEventListener("click", () => {
    kitAberto = "";
    history.replaceState(null, "", enderecoAtual());
    renderizarRegistros();
    principal.querySelector("#aba-kits").focus();
  });

  const concluidas = trocas.filter((t) => t.estado === "concluida");
  const solicitadas = trocas.filter((t) => t.estado === "solicitada");
  const posicaoDe = (t) => itens.find((i) => i.camisa_id === t.camisa_original_id)?.posicao ?? "—";
  const alteracoes = concluidas.map((t) =>
    el("p", { class: "kit-admin__evento" }, `${dataCurta(t.concluida_em)} • ${MODALIDADES[t.modalidade]} • Camisa ${posicaoDe(t)} (${t.numero}). Origem e destino preservados.`));
  for (const t of solicitadas) {
    alteracoes.push(el("p", { class: "kit-admin__evento" }, `${t.numero}: troca de ${MODALIDADES[t.modalidade].toLowerCase()} da Camisa ${posicaoDe(t)} em estado Solicitada; a composição permanece igual até a conclusão.`));
  }
  if (!concluidas.length && !solicitadas.length) alteracoes.push(el("p", { class: "kit-admin__evento" }, "Nenhuma alteração registrada."));

  // Cartão da camisa com o tamanho de cada momento (inicial na composição original)
  const original = (item) => ({ ...item, tamanho_atual: item.tamanho_inicial });

  return el("section", { class: "kit-admin", "aria-labelledby": "titulo-kit" },
    el("h3", { class: "kit-admin__titulo", id: "titulo-kit", tabindex: "-1" }, `Kit de ${rotuloCompetencia(kit.competencia)}`),
    faixaDeDados([
      ["Competência", rotuloCompetencia(kit.competencia)],
      ["Plano registrado", kit.plano],
      ["Composição registrada", composicaoRegistrada(kit)],
      ["Brinde", brindeDoKit(kit)],
    ]),
    el("p", { class: "secao-conta__texto" }, "A composição registrada pertence a este kit. Os itens atuais consideram somente trocas concluídas."),
    el("p", { class: "kit-admin__rotulo" }, "Composição atual"),
    ...atuais.map((item) => camisaDoKit(item, {
      rotulo: `Camisa ${item.posicao}`,
      chipEstado: pendente(item) ? chip("Troca solicitada", "aviso", "◷") : chip("Atual", "sucesso", "●"),
    })),
    houveMudanca ? el("p", { class: "kit-admin__rotulo" }, "Composição original") : null,
    ...(houveMudanca ? originais.map((item) => camisaDoKit(original(item), {
      rotulo: `Camisa ${item.posicao}`,
      chipEstado: item.estado === "atual" ? chip("Original", "neutro", "○") : chip("Substituída", "neutro", "→"),
    })) : []),
    el("p", { class: "kit-admin__rotulo" }, "Alterações do kit"),
    ...alteracoes,
    recolher);
}

function renderizarRegistros() {
  const alvo = principal.querySelector("[data-registros]");
  const kit = kitAberto && aba === "kits" ? dados.kits.find((k) => k.competencia === kitAberto) : null;
  if (kitAberto && !kit) kitAberto = "";
  alvo.replaceChildren(
    abas(),
    el("div", { id: "painel-registros", role: "tabpanel", "aria-labelledby": `aba-${aba}` },
      aba === "historico" ? tabelaHistorico() : kit ? blocoDoKit(kit) : tabelaKits()),
    el("p", { class: "cartao__nota" }, "A identidade é equipe + temporada + categoria. Todos os modelos registrados permanecem no histórico de não repetição, inclusive os substituídos. Mudar somente o tamanho preserva o modelo."));
}

// ---------- Coluna lateral ----------
function cartaoPlano() {
  const a = dados.assinatura;
  if (!a) {
    return el("section", { class: "cartao cartao--lateral" },
      el("div", { class: "cartao__topo" }, el("h2", { class: "cartao-lateral__nome" }, "Sem assinatura"), chipAssinatura(null)),
      el("p", { class: "cartao__texto" }, "Este titular ainda não confirmou uma assinatura."));
  }
  return el("section", { class: "cartao cartao--lateral", "aria-labelledby": "titulo-plano" },
    el("div", { class: "cartao__topo" },
      el("h2", { class: "cartao-lateral__nome", id: "titulo-plano" }, a.plano),
      chipAssinatura(a.status)),
    el("p", { class: "cartao__texto" }, `Composição para kits elegíveis: ${composicaoDoPlano(a)}.`),
    el("p", { class: "cartao__texto" }, `Brinde: ${a.possui_brinde ? "previsto" : "não previsto"}.`),
    el("p", { class: "cartao__texto" }, `Situação do plano: ${a.plano_ativo ? "Ativo" : "Inativo"}`),
    el("p", { class: "cartao__nota" }, "A composição registrada em cada kit permanece como foi montada, mesmo quando difere da assinatura consultada."));
}

function cartaoTrocas() {
  const a = dados.assinatura;
  const contagem = ["solicitada", "concluida", "rejeitada"]
    .map((estado) => [estado, dados.trocas.filter((t) => t.estado === estado).length])
    .filter(([, n]) => n);
  const nomes = { solicitada: ["solicitada", "solicitadas"], concluida: ["concluída", "concluídas"], rejeitada: ["rejeitada", "rejeitadas"] };
  const resumo = contagem.length
    ? contagem.map(([estado, n]) => `${n} ${nomes[estado][n === 1 ? 0 : 1]}`).join(" · ")
    : "Nenhum registro";
  return el("section", { class: "cartao cartao--lateral", "aria-labelledby": "titulo-trocas" },
    el("h2", { class: "cartao-lateral__subtitulo", id: "titulo-trocas" }, "Trocas da assinatura"),
    a ? el("p", { class: "cartao__texto" }, textoTrocasDoPlano(a.trocas_anuais)) : null,
    el("p", { class: "cartao__nota" }, "Cancelar ou reativar não apaga o histórico de utilização. Solicitar e concluir novas trocas exige assinatura ativa."),
    el("dl", { class: "dados-lateral" }, el("div", {}, el("dt", {}, "Registros de troca"), el("dd", {}, resumo))),
    el("a", { class: "botao botao--sec-claro", href: `${TELAS.A09}?assinante=${encodeURIComponent(usuarioId)}` }, "Ver solicitações de troca"));
}

function renderizar() {
  document.title = `${dados.nome} · Assinantes · Administração · Clube do Manto`;
  principal.replaceChildren(el("div", { class: "container" },
    topo(),
    el("div", { class: "painel-grade painel-grade--admin" },
      el("div", { class: "painel-grade__principal" },
        cartaoCompetencia(),
        el("section", { class: "cartao cartao--admin cartao--registros", "aria-label": "Kits e histórico", "data-registros": true })),
      el("div", { class: "painel-grade__lateral" }, cartaoPerfil(dados), cartaoPlano(), cartaoTrocas()))));
  renderizarRegistros();
}

function naoEncontrado() {
  principal.setAttribute("aria-busy", "false");
  principal.replaceChildren(el("div", { class: "container" },
    topo(),
    el("section", { class: "cartao cartao--falha", role: "alert" },
      el("span", { class: "cartao--falha__icone", "aria-hidden": "true" }, "!"),
      el("h2", { class: "cartao__titulo" }, "Assinante não encontrado"),
      el("p", { class: "cartao__texto" }, "Este titular não existe ou o endereço está incompleto. Volte à lista de assinantes."),
      el("a", { class: "botao botao--primaria", href: voltar }, "Voltar aos assinantes"))));
}

(async () => {
  if (!(await exigirAdministrador(principal))) return;
  if (!/^[0-9a-f-]{36}$/i.test(usuarioId)) return naoEncontrado();
  try {
    dados = await carregarAssinante(usuarioId);
  } catch (erro) {
    console.error(erro);
    if (codigoDoErro(erro) === "assinante_inexistente") return naoEncontrado();
    mostrarFalhaGeral(principal, "Não foi possível consultar o assinante", () => location.reload());
    return;
  }
  renderizar();
  principal.setAttribute("aria-busy", "false");
  if (kitAberto) principal.querySelector("#titulo-kit")?.focus();
})();
