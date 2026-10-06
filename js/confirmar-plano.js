// C03 — Escolha, revisão e confirmação da assinatura (primeira ativação ou reativação).
// O plano escolhido chega só pela URL (?plano=) e não ativa nada sozinho: a assinatura
// muda apenas pelas funções ativar_assinatura/reativar_assinatura do banco.
// A operação é demonstrativa: sem cobrança e sem entrega física.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { lerContexto, comContexto } from "./contexto.js";
import { PLANOS, formatarValor } from "./planos.js";
import { TELAS } from "./sessao.js";
import { exigirSessao, montarCabecalho, mostrarNome, perfilCompleto, carregarPerfil, el, chip } from "./cliente.js";
import { cartaoPlano } from "./cartao-plano.js";
import { criarDialogo } from "./dialogo.js";
import { processando, ehFalhaDeComunicacao } from "./formulario.js";
import {
  carregarPlanos, carregarAssinatura, nomesDasEquipes, resumoPlano, caixaPreferencias,
  cartaoPlanoAtual, colunaBeneficio, alerta, codigoDoErro,
} from "./assinatura-comum.js";

avisarSemConfiguracao();
montarCabecalho("C04");

const contexto = lerContexto();
const raiz = document.querySelector("[data-c03]");
const conteudo = raiz.querySelector("[data-conteudo]");
const etapas = document.querySelector("[data-etapas]");
const dialogo = criarDialogo(document.querySelector("[data-dialogo-planos]"));

// Estado da tela
let dados = null; // { perfil, assinatura, planos, nomes }
let slug = contexto.plano;
let perfilRecusado = false; // o banco recusou o perfil (ex.: equipe inativa)

const modo = () => (dados.assinatura?.status === "cancelada" ? "reativacao" : "ativacao");
const planoEscolhido = () => (slug ? dados.planos[slug] || { ...PLANOS[slug], ativo: false } : null);
const completoParaAssinar = () => perfilCompleto(dados.perfil) && !perfilRecusado;
const linkPerfil = () => comContexto(TELAS.C02, { plano: slug, destino: null });

function definirTitulo(texto) {
  document.title = `${texto} · Clube do Manto`;
}
function focarTitulo() {
  conteudo.querySelector("h1")?.focus();
}

// ---------- Carga ----------
async function carregar() {
  const [perfil, assinatura, planos] = await Promise.all([carregarPerfil(), carregarAssinatura(), carregarPlanos()]);
  if (!perfil) throw new Error("Perfil não encontrado");
  return { perfil, assinatura, planos, nomes: await nomesDasEquipes(perfil) };
}

// ---------- Escolha do plano ----------
function preencherEscolha() {
  const reativar = modo() === "reativacao";
  document.querySelector("#titulo-escolha").textContent = reativar ? "Escolha o plano para reativar" : "Escolha seu plano";
  document.querySelector("[data-escolha-texto]").textContent = reativar
    ? "Seu histórico será preservado. Selecione um plano e revise a reativação antes de confirmar."
    : completoParaAssinar()
      ? "Seu perfil já está preenchido. Selecione um plano e revise a assinatura antes de confirmar."
      : "Selecione um plano. Antes de confirmar, você completa tamanho, equipe favorita e rival.";
  const bloco = document.querySelector("[data-escolha-planos]");
  bloco.replaceChildren(...cartoesDePlano(reativar, "h3"));
  const precos = Object.entries(PLANOS)
    .filter(([s]) => dados.planos[s])
    .map(([s]) => `${dados.planos[s].nome} R$ ${formatarValor(dados.planos[s].valor)}`)
    .join(" · ");
  bloco.nextElementSibling.textContent = `Preços oficiais: ${precos} por mês.`;
}

function cartoesDePlano(reativar, titulo) {
  return Object.keys(PLANOS)
    .filter((s) => dados.planos[s])
    .map((s) => cartaoPlano(s, dados.planos[s], { rotulo: reativar ? `Escolher ${dados.planos[s].nome}` : "Revisar plano", titulo }));
}

function escolher(novo) {
  slug = novo;
  history.replaceState(null, "", comContexto(TELAS.C03, { plano: slug, destino: null }));
  dialogo.fechar();
  renderizar();
  focarTitulo();
}

document.querySelector("[data-escolha-planos]").addEventListener("click", (e) => {
  const botao = e.target.closest("[data-escolher]");
  if (botao && !botao.disabled) escolher(botao.dataset.escolher);
});

// Sem plano na URL (menu, painel ou Reativar), a escolha aparece na própria página.
function renderizarEscolhaNaPagina() {
  const reativar = modo() === "reativacao";
  etapas.hidden = true;
  raiz.classList.remove("area-cliente--sem-faixa");
  definirTitulo(reativar ? "Reativar assinatura" : "Escolha seu plano");
  const grade = el("div", { class: "planos" }, ...cartoesDePlano(reativar, "h2"));
  grade.addEventListener("click", (e) => {
    const botao = e.target.closest("[data-escolher]");
    if (botao && !botao.disabled) escolher(botao.dataset.escolher);
  });
  conteudo.replaceChildren(
    el("div", { class: "area-cliente__topo" },
      el("a", { class: "area-cliente__voltar", href: reativar ? TELAS.C04 : TELAS.C01 }, el("span", { "aria-hidden": "true" }, "←"), reativar ? "Voltar à assinatura" : "Voltar ao painel"),
      el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, reativar ? "Reativar assinatura" : "Escolha seu plano"),
      el("p", { class: "area-cliente__sub" }, reativar
        ? "Escolha um plano e revise a reativação. Seu histórico e o uso de trocas do ciclo serão preservados."
        : "Selecione um plano e revise a assinatura antes de confirmar.")),
    grade,
    el("p", { class: "planos__observacao" }, "Camisas comuns: clubes internacionais e seleções. A camisa especial está inclusa somente no Colecionador. Escolher um plano não ativa a assinatura."));
}

// ---------- Primeira ativação ----------
function marcarEtapas(sucesso) {
  etapas.hidden = false;
  const perfil = etapas.querySelector("[data-etapa-perfil]");
  const completo = completoParaAssinar();
  perfil.classList.toggle("etapa-fluxo--concluida", completo);
  perfil.classList.toggle("etapa-fluxo--atual", !completo);
  perfil.querySelector("[data-etapa-numero]").textContent = completo ? "✓" : "2";
  perfil.querySelector("[data-etapa-sub]").textContent = completo ? "Preferências salvas" : "Etapa pendente";
  const confirmar = etapas.querySelector("[data-etapa-confirmar]");
  confirmar.classList.toggle("etapa-fluxo--concluida", sucesso);
  confirmar.classList.toggle("etapa-fluxo--atual", !sucesso && completo);
  const numero = confirmar.querySelector("[data-etapa-numero]");
  numero.textContent = sucesso ? "✓" : "3";
  if (sucesso) numero.setAttribute("aria-hidden", "true");
  else numero.removeAttribute("aria-hidden");
  confirmar.querySelector("[data-etapa-sub]").textContent = sucesso ? "Assinatura ativa" : "Revisão final";
  if (sucesso || !completo) confirmar.removeAttribute("aria-current");
  else confirmar.setAttribute("aria-current", "step");
  if (completo) perfil.removeAttribute("aria-current");
  else perfil.setAttribute("aria-current", "step");
}

function orientacao(titulo, ...textos) {
  return el("div", { class: "orientacao" }, el("p", { class: "orientacao__titulo" }, titulo), ...textos.map((t) => el("p", {}, t)));
}

function botaoAlterarPlano() {
  const botao = el("button", { class: "botao botao--sec-escuro botao--largo", type: "button", "data-alterar-plano": true }, "Alterar plano");
  botao.addEventListener("click", () => dialogo.abrir(botao));
  return botao;
}

function renderizarAtivacao({ estado = "revisao" } = {}) {
  const p = planoEscolhido();
  const completo = completoParaAssinar();
  const indisponivel = p.ativo === false;
  raiz.classList.add("area-cliente--sem-faixa");
  marcarEtapas(false);

  const titulo = completo ? "Revise sua assinatura" : "Complete seu perfil";
  definirTitulo(titulo);
  const avisos = el("div", { class: "pilha", "data-avisos": true });
  if (indisponivel) avisos.append(alerta("erro", "Este plano está indisponível", "Escolha outro plano disponível. Nenhuma assinatura foi ativada."));

  let acao;
  let nota;
  if (!completo) {
    acao = el("a", { class: "botao botao--primaria botao--largo", href: linkPerfil() }, "Completar perfil");
    nota = "A assinatura será confirmada somente após salvar um perfil válido.";
  } else if (indisponivel) {
    acao = el("button", { class: "botao botao--primaria botao--largo", type: "button" }, "Escolher outro plano");
    acao.addEventListener("click", () => dialogo.abrir(acao));
    nota = "Ativação demonstrativa, sem cobrança e sem entrega física.";
  } else {
    acao = el("button", { class: "botao botao--primaria botao--largo", type: "button", "data-confirmar": true }, "Confirmar assinatura");
    acao.addEventListener("click", () => confirmarAtivacao(acao));
    nota = "Ativação demonstrativa, sem cobrança e sem entrega física. Ao confirmar, o plano selecionado será ativado.";
  }

  const formulario = el("section", { class: "cartao-form", "aria-labelledby": "titulo-c03" },
    el("div", { class: "pilha pilha--16" },
      el("h1", { class: "cartao-form__titulo", id: "titulo-c03", tabindex: "-1" }, titulo),
      el("p", { class: "lead" }, completo ? "Confira o plano e suas preferências antes de confirmar." : "Informe tamanho, equipe favorita e rival antes de confirmar o plano.")),
    avisos,
    caixaPreferencias(dados.perfil, dados.nomes, { editarHref: linkPerfil() }),
    orientacao("Como suas escolhas serão usadas",
      "Sua equipe favorita orienta a curadoria, sem garantir uma camisa específica. O rival será excluído de todos os tipos, inclusive especiais.",
      "A garantia anti-repetição considera a equipe, a temporada e a categoria (Home, Away ou Third)."),
    acao,
    el("p", { class: "nota-rodape", "data-nota": true }, nota));

  const apoio = el("aside", { class: "apoio", "aria-label": "Plano selecionado" },
    resumoPlano(p, { chamada: "Plano selecionado", alterar: botaoAlterarPlano() }),
    el("div", { "data-orientacao": true }, orientacao("Depois de confirmar",
      "Você poderá consultar sua assinatura e acompanhar seus kits e trocas pelo painel.",
      "Os kits aparecerão no painel quando forem montados.")));

  conteudo.replaceChildren(el("div", { class: "fluxo__grade fluxo__grade--conta" }, formulario, apoio));
  if (estado === "falha") mostrarFalhaAtivacao();
}

function mostrarFalhaAtivacao() {
  const avisos = conteudo.querySelector("[data-avisos]");
  const aviso = alerta("erro", "Não foi possível confirmar sua assinatura", "Sua seleção foi mantida. Tente novamente.", { foco: true });
  avisos.replaceChildren(aviso);
  const botao = conteudo.querySelector("[data-confirmar]");
  botao.textContent = "Tentar novamente";
  aviso.focus();
}

function bloquearDuranteOperacao(sim) {
  conteudo.querySelectorAll("[data-alterar-plano]").forEach((b) => (b.disabled = sim));
  conteudo.querySelectorAll("a.link").forEach((a) => (sim ? a.setAttribute("aria-disabled", "true") : a.removeAttribute("aria-disabled")));
}

async function confirmarAtivacao(botao) {
  if (botao.disabled) return;
  const avisos = conteudo.querySelector("[data-avisos]");
  avisos.replaceChildren();
  processando(botao, true, "Confirmando…");
  bloquearDuranteOperacao(true);
  const nota = conteudo.querySelector("[data-nota]");
  const notaAntes = nota.textContent;
  nota.textContent = "Aguarde enquanto confirmamos sua assinatura.";
  conteudo.querySelector("[data-orientacao]").replaceChildren(orientacao("Confirmação em andamento", "Aguarde a confirmação. O plano e as preferências já foram selecionados."));
  try {
    const { error } = await supabase.rpc("ativar_assinatura", { p_plano: planoEscolhido().nome });
    if (error) throw error;
    dados.assinatura = await carregarAssinatura();
    renderizarSucessoAtivacao();
  } catch (erro) {
    console.error(erro);
    const codigo = codigoDoErro(erro);
    if (await tratarCodigo(codigo)) return;
    // Falha de comunicação: o resultado pode ter sido gravado. Consulta antes de oferecer nova tentativa.
    if (!codigo || ehFalhaDeComunicacao(erro)) {
      try {
        const atual = await carregarAssinatura();
        if (atual?.status === "ativa") {
          dados.assinatura = atual;
          return renderizarSucessoAtivacao();
        }
      } catch (e) {
        console.error(e);
      }
    }
    processando(botao, false);
    bloquearDuranteOperacao(false);
    nota.textContent = notaAntes;
    conteudo.querySelector("[data-orientacao]").replaceChildren(orientacao("Depois de confirmar",
      "Você poderá consultar sua assinatura e acompanhar seus kits e trocas pelo painel.",
      "Os kits aparecerão no painel quando forem montados."));
    mostrarFalhaAtivacao();
  }
}

// Erros de regra vindos do banco: a tela volta ao estado correspondente.
async function tratarCodigo(codigo) {
  if (!codigo) return false;
  if (codigo === "perfil_incompleto" || codigo === "plano_indisponivel" || codigo === "assinatura_ativa" || codigo === "assinatura_cancelada" || codigo === "assinatura_inexistente") {
    try {
      dados = await carregar();
      if (codigo === "plano_indisponivel" && dados.planos[slug]) dados.planos[slug] = { ...dados.planos[slug], ativo: false };
      if (codigo === "perfil_incompleto") perfilRecusado = true;
    } catch (e) {
      console.error(e);
      return false;
    }
    renderizar();
    focarTitulo();
    return true;
  }
  return false;
}

function renderizarSucessoAtivacao() {
  const p = dados.assinatura.plano;
  marcarEtapas(true);
  definirTitulo("Assinatura confirmada");
  const resumo = el("section", { class: "dados-caixa", "aria-label": "Resumo da assinatura" },
    el("div", { class: "dados-caixa__topo" }, el("h2", { class: "dados-caixa__titulo" }, "Resumo da assinatura")),
    el("dl", { class: "dados" },
      el("div", {}, el("dt", {}, "Plano"), el("dd", {}, p.nome)),
      el("div", {}, el("dt", {}, "Situação"), el("dd", {}, chip("Ativa", "sucesso", "✓"))),
      el("div", {}, el("dt", {}, "Tamanho da camisa"), el("dd", {}, dados.perfil.tamanho)),
      el("div", {}, el("dt", {}, "Equipe favorita"), el("dd", {}, dados.nomes[dados.perfil.equipe_preferida_id] || "—")),
      el("div", {}, el("dt", {}, "Equipe rival"), el("dd", {}, dados.nomes[dados.perfil.rival_id] || "—"))));
  const formulario = el("section", { class: "cartao-form", "aria-labelledby": "titulo-c03" },
    el("div", { class: "pilha pilha--16" },
      el("h1", { class: "cartao-form__titulo", id: "titulo-c03", tabindex: "-1" }, "Assinatura confirmada!"),
      el("p", { class: "lead", role: "status" }, `Seu plano ${p.nome} está ativo. Agora você pode consultar sua assinatura, kits e trocas pelo painel.`)),
    resumo,
    el("a", { class: "botao botao--primaria botao--largo", href: TELAS.C04 }, "Ver minha assinatura"),
    el("p", { class: "nota-rodape" }, "Ativação demonstrativa, sem cobrança e sem entrega física. Consulte sua assinatura, os kits e as trocas pelo painel."));
  const apoio = el("aside", { class: "apoio", "aria-label": "Plano ativo" },
    resumoPlano(p, { chamada: "Plano ativo" }),
    orientacao("Próximo passo", "Acesse o painel para consultar sua assinatura, kits e trocas.", "Os kits aparecerão no painel quando forem montados."));
  conteudo.replaceChildren(el("div", { class: "fluxo__grade fluxo__grade--conta" }, formulario, apoio));
  history.replaceState(null, "", TELAS.C03);
  focarTitulo();
}

// ---------- Reativação ----------
function renderizarReativacao() {
  const p = planoEscolhido();
  const completo = completoParaAssinar();
  const indisponivel = p.ativo === false;
  etapas.hidden = true;
  raiz.classList.remove("area-cliente--sem-faixa");
  definirTitulo("Reativar assinatura");

  const alterar = el("button", { class: "link", type: "button", "data-alterar-plano": true }, "Escolher outro plano");
  alterar.addEventListener("click", () => dialogo.abrir(alterar));
  const cartaoPlano = cartaoPlanoAtual(p, { chamada: "Plano para reativar", chipEstado: chip("Em revisão", "aviso", "◷") });
  cartaoPlano.append(alterar);

  let confirmacao;
  if (!completo) {
    confirmacao = cartaoAcao("Complete seu perfil", "Informe tamanho, equipe favorita e rival antes de reativar. A assinatura será reativada somente após salvar um perfil válido.",
      el("a", { class: "botao botao--primaria", href: linkPerfil() }, "Completar perfil"));
  } else if (indisponivel) {
    const botao = el("button", { class: "botao botao--primaria", type: "button" }, "Escolher outro plano");
    botao.addEventListener("click", () => dialogo.abrir(botao));
    confirmacao = cartaoAcao("Plano indisponível", "Este plano está indisponível. Escolha outro plano disponível. Nenhuma assinatura foi reativada.", botao);
  } else {
    const botao = el("button", { class: "botao botao--primaria", type: "button", "data-confirmar": true }, "Confirmar reativação");
    botao.addEventListener("click", () => confirmarReativacao(botao));
    confirmacao = cartaoAcao("Confirmar reativação", "Reativação demonstrativa, sem cobrança e sem entrega física. O histórico e a utilização das trocas serão preservados.", botao);
  }

  conteudo.replaceChildren(
    el("div", { class: "area-cliente__topo" },
      el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, "Reativar assinatura"),
      el("p", { class: "area-cliente__sub" }, "Revise o plano antes de retomar sua assinatura."),
      el("div", { class: "area-cliente__aviso", "data-avisos": true },
        alerta("info", "Seu histórico será preservado", "As camisas já registradas e as trocas utilizadas continuam vinculadas à sua conta."))),
    el("div", { class: "painel-grade" },
      el("div", { class: "painel-grade__principal" },
        cartaoPlano,
        caixaPreferencias(dados.perfil, dados.nomes, { editarHref: linkPerfil(), grande: true }),
        confirmacao),
      el("div", { class: "painel-grade__lateral" }, ...colunaBeneficio())));
}

function cartaoAcao(titulo, texto, botao) {
  return el("section", { class: "cartao", "aria-labelledby": "titulo-acao", "data-cartao-acao": true },
    el("h2", { class: "cartao__titulo", id: "titulo-acao" }, titulo),
    el("p", { class: "cartao__texto", "data-acao-texto": true }, texto),
    el("div", { class: "acoes-cartao" },
      el("a", { class: "link", href: TELAS.C04 }, "Voltar à assinatura"),
      botao));
}

async function confirmarReativacao(botao) {
  if (botao.disabled) return;
  processando(botao, true, "Reativando…");
  bloquearDuranteOperacao(true);
  const avisos = conteudo.querySelector("[data-avisos]");
  try {
    const { error } = await supabase.rpc("reativar_assinatura", { p_plano: planoEscolhido().nome });
    if (error) throw error;
    location.assign(`${TELAS.C04}?reativada=1`);
  } catch (erro) {
    console.error(erro);
    if (await tratarCodigo(codigoDoErro(erro))) return;
    // Resultado incerto: pedir a conferência antes de repetir.
    processando(botao, false);
    bloquearDuranteOperacao(false);
    const aviso = alerta("erro", "Não foi possível confirmar a reativação", "Consulte a situação da assinatura antes de repetir a operação.", { foco: true });
    avisos.replaceChildren(aviso);
    const cartao = conteudo.querySelector("[data-cartao-acao]");
    cartao.querySelector("h2").textContent = "Conferir situação da assinatura";
    cartao.querySelector("[data-acao-texto]").textContent = "Uma falha de comunicação pode impedir a confirmação do resultado. Consulte a situação atual antes de repetir a ação.";
    const conferir = el("button", { class: "botao botao--primaria", type: "button" }, "Conferir assinatura");
    conferir.addEventListener("click", () => conferirReativacao(conferir));
    botao.replaceWith(conferir);
    aviso.focus();
  }
}

async function conferirReativacao(botao) {
  processando(botao, true, "Conferindo…");
  try {
    const atual = await carregarAssinatura();
    if (atual?.status === "ativa") {
      location.assign(`${TELAS.C04}?reativada=1`);
      return;
    }
    dados.assinatura = atual;
    renderizar();
    conteudo.querySelector("[data-avisos]").replaceChildren(alerta("info", "A assinatura continua cancelada", "Nenhuma reativação foi registrada. Você pode confirmar novamente."));
    focarTitulo();
  } catch (erro) {
    console.error(erro);
    processando(botao, false);
  }
}

// ---------- Assinatura já ativa ----------
function renderizarJaAtiva() {
  const p = dados.assinatura.plano;
  etapas.hidden = true;
  raiz.classList.remove("area-cliente--sem-faixa");
  definirTitulo("Você já tem uma assinatura ativa");
  conteudo.replaceChildren(
    el("div", { class: "area-cliente__topo" },
      el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, "Você já tem uma assinatura ativa"),
      el("p", { class: "area-cliente__sub" }, "Gerencie sua assinatura atual pelo painel. Não é necessário confirmar um novo plano.")),
    el("div", { class: "fluxo__grade fluxo__grade--conta fluxo__grade--colado" },
      el("section", { class: "cartao-form", "aria-label": "Assinatura atual" },
        alerta("info", "Acesso à sua assinatura atual", "Consulte seu plano pelo painel. Uma nova assinatura não será criada."),
        el("section", { class: "dados-caixa", "aria-label": "Assinatura atual" },
          el("div", { class: "dados-caixa__topo" }, el("h2", { class: "dados-caixa__titulo" }, "Assinatura atual")),
          el("dl", { class: "dados" },
            el("div", {}, el("dt", {}, "Plano"), el("dd", {}, p.nome)),
            el("div", {}, el("dt", {}, "Situação"), el("dd", {}, chip("Ativa", "sucesso", "✓"))))),
        el("a", { class: "botao botao--primaria botao--largo", href: TELAS.C04 }, "Ver minha assinatura"),
        el("p", { class: "nota-rodape" }, "Mudança direta de plano durante a assinatura ativa não faz parte do serviço.")),
      el("aside", { class: "apoio", "aria-label": "Assinatura atual" },
        el("div", { class: "cartao-apoio" },
          el("p", { class: "chamada chamada--no-escuro" }, "Assinatura atual"),
          el("p", { class: "cartao-apoio__titulo" }, "Gerencie sua assinatura"),
          el("p", {}, "Consulte o plano e a situação da assinatura atual pelo painel.")))));
}

// ---------- Estados de carga ----------
function renderizarFalhaCarga() {
  etapas.hidden = true;
  raiz.classList.remove("area-cliente--sem-faixa");
  const tentar = el("button", { class: "botao botao--primaria", type: "button" }, "Tentar novamente");
  tentar.addEventListener("click", async () => {
    tentar.disabled = true;
    await iniciar();
  });
  conteudo.replaceChildren(
    el("div", { class: "area-cliente__topo" },
      el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, "Assinatura"),
      el("p", { class: "area-cliente__sub" }, "Tente carregar as informações novamente.")),
    el("section", { class: "cartao cartao--falha", role: "alert" },
      el("span", { class: "cartao--falha__icone", "aria-hidden": "true" }, "!"),
      el("h2", { class: "cartao__titulo" }, "Não foi possível carregar a assinatura"),
      el("p", { class: "cartao__texto" }, "Verifique sua conexão e tente novamente. Nenhuma assinatura foi alterada."),
      tentar));
  tentar.focus();
}

function renderizar() {
  if (dados.assinatura?.status === "ativa") return renderizarJaAtiva();
  preencherEscolha();
  if (!slug) return renderizarEscolhaNaPagina();
  if (modo() === "reativacao") return renderizarReativacao();
  return renderizarAtivacao();
}

async function iniciar() {
  raiz.setAttribute("aria-busy", "true");
  try {
    dados = await carregar();
    mostrarNome(dados.perfil.nome);
    renderizar();
    if (new URLSearchParams(location.search).get("escolher") && dados.assinatura?.status !== "ativa") {
      history.replaceState(null, "", comContexto(TELAS.C03, { plano: slug, destino: null }));
      dialogo.abrir(conteudo.querySelector("[data-alterar-plano]") || conteudo.querySelector("h1"));
    }
  } catch (erro) {
    console.error(erro);
    renderizarFalhaCarga();
  } finally {
    raiz.setAttribute("aria-busy", "false");
  }
}

(async () => {
  if (!supabase) return;
  if (!(await exigirSessao(contexto))) return;
  await iniciar();
})();
