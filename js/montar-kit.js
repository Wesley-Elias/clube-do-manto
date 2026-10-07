// A08 — Montagem do kit mensal. A competência vem do sistema e nada da
// composição é editável: o banco seleciona, registra o kit e baixa o estoque em
// uma única operação (admin_montar_kit). Não existe kit parcial nem novo sorteio:
// pedir de novo devolve o kit já registrado. Se a resposta se perder, a tela
// consulta a situação antes de permitir outra tentativa.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { el, chip } from "./cliente.js";
import { processando } from "./formulario.js";
import { montarCabecalhoAdmin, exigirAdministrador, mostrarFalhaGeral, codigoDoErro, falhaIncerta, linhaDado } from "./admin.js";
import { camisaDoKit } from "./kits-comum.js";
import {
  carregarAssinante, situacaoDoKit, INELEGIVEL, alerta, cartaoPerfil, chipAssinatura, composicaoDoPlano,
  linkDoAssinante, rotuloCompetencia,
} from "./admin-operacao.js";

avisarSemConfiguracao();
montarCabecalhoAdmin("A06");

const principal = document.querySelector("[data-tela]");
const usuarioId = new URLSearchParams(location.search).get("id") || "";
const linkAssinante = () => linkDoAssinante(usuarioId);
let dados = null;

function topo() {
  return el("div", { class: "area-cliente__topo" },
    el("a", { class: "area-cliente__voltar", href: /^[0-9a-f-]{36}$/i.test(usuarioId) ? linkAssinante() : TELAS.A06 },
      el("span", { "aria-hidden": "true" }, "←"), "Voltar ao assinante"),
    el("p", { class: "chamada chamada--no-escuro" }, "Administração / Assinantes / Montagem do kit"),
    el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, "Montagem do kit mensal"),
    el("p", { class: "area-cliente__sub" }, "Confira os dados da assinatura e consulte o resultado da montagem."));
}

function regras() {
  return el("section", { class: "cartao cartao--admin", "aria-labelledby": "titulo-regras" },
    el("h2", { class: "cartao-lateral__subtitulo", id: "titulo-regras" }, "Regras da montagem"),
    el("ul", { class: "lista-regras" },
      el("li", {}, "Catálogo permitido e ativo, com estoque no tamanho necessário."),
      el("li", {}, "Exclusão da equipe rival em camisas comuns e especiais."),
      el("li", {}, "Não repetir equipe + temporada + categoria já registrada, inclusive modelos substituídos."),
      el("li", {}, "Composição completa do plano e um único kit por assinante e competência.")),
    el("p", { class: "cartao__nota" }, "A equipe preferida não garante uma camisa específica. As camisas comuns podem ser de clubes internacionais ou seleções."));
}

function lateral() {
  const a = dados.assinatura;
  const extra = [el("hr", { class: "divisor" })];
  const linhas = [linhaDado("Competência", rotuloCompetencia(dados.competencia))];
  if (a) {
    linhas.push(
      linhaDado("Plano", a.plano),
      linhaDado("Composição", `${composicaoDoPlano(a)}.`),
      linhaDado("Brinde", a.possui_brinde ? "Previsto" : "Não previsto"));
  }
  extra.push(el("dl", { class: "dados-lateral" }, ...linhas),
    el("p", { class: "cartao-lateral__linha" }, "Assinatura:", chipAssinatura(a?.status)));
  return cartaoPerfil(dados, { rotuloTamanho: "Tamanho", extra });
}

// Camisas registradas na competência atual
function camisasDoMes() {
  const itens = dados.itens.filter((i) => i.competencia === dados.competencia && i.origem === "kit").sort((a, b) => a.posicao - b.posicao);
  const atuais = new Set(dados.itens.filter((i) => i.estado === "atual").map((i) => i.camisa_id));
  return itens.map((item) => camisaDoKit({ ...item, tamanho_atual: item.tamanho_inicial }, {
    rotulo: `Camisa ${item.posicao}`,
    chipEstado: atuais.has(item.camisa_id) ? chip("Atual", "sucesso", "●") : chip("Substituída", "neutro", "→"),
  }));
}

function blocoResultado(tipo, titulo, texto) {
  return [
    alerta(tipo, titulo, texto, { tabindex: "-1", "data-foco": true }),
    el("p", { class: "kit-admin__rotulo" }, "Camisas registradas no kit"),
    ...camisasDoMes(),
    el("p", { class: "cartao__texto" }, "O registro é a composição do kit desta competência. Consultar novamente preserva essas camisas; alterações posteriores pertencem ao fluxo de trocas."),
    el("a", { class: "botao botao--sec-claro", href: linkDoAssinante(usuarioId, { kit: dados.competencia }) }, "Ver detalhes do assinante"),
  ];
}

// estado: pronto · registrado · existente · inelegivel · estoque · incerto · consultado
function renderizar(estado, detalhe = null) {
  const mes = rotuloCompetencia(dados.competencia);
  let conteudo = [];
  let mostrarRegras = false;

  if (estado === "pronto" || estado === "consultado") {
    const montar = el("button", { class: "botao botao--primaria", type: "button" }, "Montar kit do mês");
    montar.addEventListener("click", () => montarKit(montar));
    conteudo = [
      estado === "consultado"
        ? alerta("info", "Nenhum kit registrado após a consulta", `A operação anterior não registrou um kit para ${mes}. Você pode montar o kit do mês.`, { tabindex: "-1", "data-foco": true })
        : alerta("info", "Pronto para montar o kit do mês", "O kit só será registrado quando a composição completa respeitar todas as regras e houver estoque elegível no tamanho do assinante."),
      montar,
    ];
    mostrarRegras = true;
  } else if (estado === "registrado") {
    conteudo = blocoResultado("sucesso", "Kit do mês registrado", `A composição completa foi registrada para ${mes}. Consulte as camisas abaixo.`);
  } else if (estado === "existente") {
    conteudo = blocoResultado("info", "Kit do mês já registrado", `${mes} já possui um kit. Nenhuma camisa nova foi selecionada e o estoque não foi baixado novamente.`);
  } else if (estado === "inelegivel") {
    const [titulo, texto] = INELEGIVEL[detalhe];
    conteudo = [
      alerta("aviso", titulo, `${texto} Nenhum kit foi registrado.`, { tabindex: "-1", "data-foco": true }),
      el("a", { class: "botao botao--sec-claro", href: linkAssinante() }, "Voltar ao assinante"),
    ];
  } else if (estado === "estoque") {
    const grupo = detalhe === "especial" ? "camisas especiais elegíveis" : "camisas comuns elegíveis suficientes";
    const reavaliar = el("button", { class: "link link--botao", type: "button" }, "Voltar para nova avaliação");
    reavaliar.addEventListener("click", () => consultar(reavaliar, false));
    conteudo = [
      alerta("erro", "Estoque elegível insuficiente", `Não há ${grupo} no tamanho ${dados.tamanho}. Nenhum kit foi registrado e o estoque não foi alterado.`, { role: "alert", tabindex: "-1", "data-foco": true }),
      el("div", { class: "acoes-linha acoes-linha--botoes" },
        el("a", { class: "botao botao--sec-claro", href: TELAS.A05 }, "Consultar estoque"),
        reavaliar),
    ];
    mostrarRegras = true;
  } else if (estado === "incerto") {
    const consultarBotao = el("button", { class: "botao botao--primaria", type: "button" }, "Consultar situação");
    consultarBotao.addEventListener("click", () => consultar(consultarBotao, true));
    conteudo = [
      alerta("erro", "Não foi possível confirmar o resultado", "A operação pode ter sido registrada. Consulte a situação antes de tentar montar novamente.", { role: "alert", tabindex: "-1", "data-foco": true }),
      consultarBotao,
    ];
  } else if (estado === "falha") {
    const tentar = el("button", { class: "botao botao--primaria", type: "button" }, "Tentar novamente");
    tentar.addEventListener("click", () => consultar(tentar, false));
    conteudo = [
      alerta("erro", "Não foi possível montar o kit", "Nenhum kit foi registrado. Tente novamente em instantes.", { role: "alert", tabindex: "-1", "data-foco": true }),
      tentar,
    ];
  }

  principal.replaceChildren(el("div", { class: "container" },
    topo(),
    el("div", { class: "painel-grade painel-grade--admin" },
      el("div", { class: "painel-grade__principal" },
        el("section", { class: "cartao cartao--admin cartao--montagem", "aria-label": "Montagem do kit", "aria-live": "polite" }, ...conteudo),
        mostrarRegras ? regras() : null),
      el("div", { class: "painel-grade__lateral" }, lateral()))));
  principal.querySelector("[data-foco]")?.focus();
}

function estadoInicial() {
  const situacao = situacaoDoKit(dados);
  if (situacao === "pronto") return ["pronto"];
  if (situacao === "kit_existente") return ["existente"];
  return ["inelegivel", situacao];
}

const ERROS_INELEGIVEL = {
  assinatura_inexistente: "sem_assinatura",
  assinatura_cancelada: "cancelada",
  plano_inativo: "plano_inativo",
  perfil_incompleto: "perfil_incompleto",
};

async function montarKit(botao) {
  processando(botao, true, "Montando o kit…");
  const { data, error } = await supabase.rpc("admin_montar_kit", { p_usuario: usuarioId });
  if (error) {
    console.error(error);
    const codigo = codigoDoErro(error);
    if (codigo === "estoque_insuficiente") {
      await recarregarSilencioso();
      return renderizar("estoque", error.hint);
    }
    if (ERROS_INELEGIVEL[codigo]) {
      await recarregarSilencioso();
      return renderizar("inelegivel", ERROS_INELEGIVEL[codigo]);
    }
    return renderizar(falhaIncerta(error) ? "incerto" : "falha");
  }
  try {
    dados = await carregarAssinante(usuarioId);
  } catch (erro) {
    console.error(erro);
    return renderizar("incerto");
  }
  renderizar(data.resultado === "existente" ? "existente" : "registrado");
}

async function recarregarSilencioso() {
  try {
    dados = await carregarAssinante(usuarioId);
  } catch (erro) {
    console.error(erro);
  }
}

// Consulta antes de repetir: se o kit existe, mostra o registro; senão, libera a montagem.
async function consultar(botao, aposIncerteza) {
  processando(botao, true, "Consultando…");
  try {
    dados = await carregarAssinante(usuarioId);
  } catch (erro) {
    console.error(erro);
    processando(botao, false);
    return renderizar("incerto");
  }
  const [estado, detalhe] = estadoInicial();
  if (aposIncerteza && estado === "pronto") return renderizar("consultado");
  if (aposIncerteza && estado === "existente") return renderizar("registrado");
  renderizar(estado, detalhe);
}

function naoEncontrado() {
  principal.setAttribute("aria-busy", "false");
  principal.replaceChildren(el("div", { class: "container" },
    topo(),
    el("section", { class: "cartao cartao--falha", role: "alert" },
      el("span", { class: "cartao--falha__icone", "aria-hidden": "true" }, "!"),
      el("h2", { class: "cartao__titulo" }, "Assinante não encontrado"),
      el("p", { class: "cartao__texto" }, "Abra a montagem a partir dos detalhes de um assinante."),
      el("a", { class: "botao botao--primaria", href: TELAS.A06 }, "Voltar aos assinantes"))));
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
  principal.setAttribute("aria-busy", "false");
  renderizar(...estadoInicial());
})();
