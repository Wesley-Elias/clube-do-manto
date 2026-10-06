// C04 — Minha assinatura: situação, plano, composição e benefícios; cancelar (diálogo)
// e reativar (pela C03). Sem saldo de trocas e sem datas de ciclo (decisão de 05/10).
// Não há mudança direta de plano durante a assinatura ativa.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { exigirSessao, montarCabecalho, mostrarNome, carregarPerfil, el, chip, dataCurta } from "./cliente.js";
import { criarDialogo } from "./dialogo.js";
import { processando, ehFalhaDeComunicacao } from "./formulario.js";
import { carregarAssinatura, cartaoPlanoAtual, colunaBeneficio, chipSituacao, alerta, codigoDoErro } from "./assinatura-comum.js";

avisarSemConfiguracao();
montarCabecalho("C04");

const raiz = document.querySelector("[data-c04]");
const titulo = raiz.querySelector("[data-titulo]");
const subtitulo = raiz.querySelector("[data-subtitulo]");
const avisos = raiz.querySelector("[data-avisos]");
const conteudo = raiz.querySelector("[data-conteudo]");

const reativada = new URLSearchParams(location.search).get("reativada") === "1";
if (reativada) history.replaceState(null, "", TELAS.C04);

let assinatura = null;

// ---------- Renderização ----------
function renderizar({ aviso = null } = {}) {
  avisos.replaceChildren();
  titulo.textContent = "Minha assinatura";
  if (!assinatura) return renderizarSemAssinatura();
  const ativa = assinatura.status === "ativa";
  const p = assinatura.plano;
  const inicio = dataCurta(assinatura.inicio_beneficios_em);

  if (aviso) avisos.append(aviso);
  else if (!ativa) avisos.append(alerta("aviso", "Assinatura cancelada", "Sua conta e o histórico permanecem disponíveis. Novos kits e operações de troca exigem uma assinatura ativa."));
  subtitulo.textContent = ativa
    ? (aviso ? "Seu plano está ativo novamente. O histórico foi preservado." : "Acompanhe seu plano, seus benefícios e o ciclo de trocas.")
    : "Consulte seu último plano e retome a assinatura quando desejar.";

  const plano = cartaoPlanoAtual(p, {
    chamada: ativa ? "Plano atual" : "Último plano",
    chipEstado: chipSituacao(assinatura.status),
    inicio,
    rodape: ativa ? "Composição aplicada aos próximos kits elegíveis." : "A composição voltará a valer após a reativação.",
  });

  let gestao;
  if (ativa) {
    const cancelar = el("button", { class: "botao botao--sec-claro", type: "button", "data-cancelar": true }, "Cancelar assinatura");
    cancelar.addEventListener("click", () => abrirCancelamento(cancelar));
    gestao = el("section", { class: "cartao", "aria-labelledby": "titulo-gestao" },
      el("h2", { class: "cartao__titulo", id: "titulo-gestao" }, "Gerenciar assinatura"),
      el("p", { class: "cartao__texto" }, "Ao cancelar, novos kits e novas operações de troca ficam indisponíveis. Sua conta e seu histórico permanecem acessíveis."),
      el("div", { class: "acoes-cartao" }, el("a", { class: "link", href: TELAS.C01 }, "Voltar ao painel"), cancelar));
  } else {
    gestao = el("section", { class: "cartao", "aria-labelledby": "titulo-gestao" },
      el("h2", { class: "cartao__titulo", id: "titulo-gestao" }, "Reativar assinatura"),
      el("p", { class: "cartao__texto" }, "Escolha um plano e revise a reativação. Seu histórico e o uso de trocas do ciclo aplicável serão preservados."),
      el("div", { class: "acoes-cartao" },
        el("a", { class: "link", href: TELAS.C01 }, "Voltar ao painel"),
        el("a", { class: "botao botao--primaria", href: TELAS.C03 }, "Reativar assinatura")));
  }

  conteudo.replaceChildren(el("div", { class: "painel-grade painel-grade--colado" },
    el("div", { class: "painel-grade__principal" }, plano, gestao),
    el("div", { class: "painel-grade__lateral" }, ...colunaBeneficio())));
  document.querySelector("[data-cancelar-plano]").textContent = p.nome;
}

function renderizarSemAssinatura() {
  subtitulo.textContent = "Acompanhe seu plano, seus benefícios e o ciclo de trocas.";
  conteudo.replaceChildren(el("section", { class: "cartao cartao--estado", "aria-labelledby": "titulo-sem" },
    chip("Sem assinatura", "neutro", "–"),
    el("h2", { class: "cartao__titulo", id: "titulo-sem" }, "Você ainda não tem uma assinatura"),
    el("p", { class: "cartao__texto" }, "Sua conta está pronta. Escolha um dos três planos para revisar e confirmar sua primeira assinatura."),
    el("a", { class: "botao botao--primaria", href: TELAS.C03 }, "Escolher plano")));
}

function renderizarFalha() {
  avisos.replaceChildren();
  const tentar = el("button", { class: "botao botao--primaria", type: "button" }, "Tentar novamente");
  tentar.addEventListener("click", async () => {
    tentar.disabled = true;
    await iniciar();
  });
  conteudo.replaceChildren(el("section", { class: "cartao cartao--falha", role: "alert" },
    el("span", { class: "cartao--falha__icone", "aria-hidden": "true" }, "!"),
    el("h2", { class: "cartao__titulo" }, "Não foi possível carregar sua assinatura"),
    el("p", { class: "cartao__texto" }, "Tente consultar novamente antes de realizar uma alteração."),
    tentar));
  tentar.focus();
}

// ---------- Cancelamento ----------
const dialogoEl = document.querySelector("[data-dialogo-cancelar]");
const tituloDialogo = dialogoEl.querySelector("#titulo-cancelar");
const textoDialogo = dialogoEl.querySelector("#texto-cancelar");
const botaoManter = dialogoEl.querySelector("[data-manter]");
const botaoConfirmar = dialogoEl.querySelector("[data-confirmar-cancelamento]");
const dialogo = criarDialogo(dialogoEl);
let modoDialogo = "confirmar"; // "confirmar" | "falha"

function estadoDialogo(estado) {
  modoDialogo = estado;
  dialogoEl.classList.toggle("dialogo--erro", estado === "falha");
  botaoManter.hidden = estado === "processando";
  if (estado === "confirmar") {
    tituloDialogo.textContent = "Cancelar sua assinatura?";
    textoDialogo.textContent = "Novos kits e operações de troca ficam indisponíveis. Sua conta, seus kits e as trocas já usadas permanecem no histórico.";
    botaoManter.textContent = "Manter assinatura";
    botaoConfirmar.textContent = "Confirmar cancelamento";
    botaoConfirmar.disabled = false;
    botaoConfirmar.removeAttribute("aria-busy");
  } else if (estado === "processando") {
    tituloDialogo.textContent = "Cancelando assinatura";
    textoDialogo.textContent = "Aguarde a confirmação antes de realizar outra ação.";
    processando(botaoConfirmar, true, "Cancelando…");
  } else {
    processando(botaoConfirmar, false);
    tituloDialogo.textContent = "Não foi possível confirmar o cancelamento";
    textoDialogo.textContent = "Confira a situação da assinatura antes de tentar novamente.";
    botaoManter.textContent = "Fechar";
    botaoConfirmar.textContent = "Conferir assinatura";
  }
}

function abrirCancelamento(gatilho) {
  estadoDialogo("confirmar");
  dialogo.abrir(gatilho);
}

botaoConfirmar.addEventListener("click", async () => {
  if (botaoConfirmar.disabled) return;
  if (modoDialogo === "falha") return conferirDepoisDaFalha();
  dialogo.bloquear(true);
  estadoDialogo("processando");
  tituloDialogo.focus();
  try {
    const { error } = await supabase.rpc("cancelar_assinatura");
    if (error) throw error;
    await concluirCancelamento();
  } catch (erro) {
    console.error(erro);
    const codigo = codigoDoErro(erro);
    if (codigo === "assinatura_nao_ativa" || codigo === "assinatura_inexistente") return concluirCancelamento(false);
    if (!codigo || ehFalhaDeComunicacao(erro)) {
      try {
        const atual = await carregarAssinatura();
        if (atual?.status === "cancelada") return concluirCancelamento();
      } catch (e) {
        console.error(e);
      }
    }
    dialogo.bloquear(false);
    estadoDialogo("falha");
    tituloDialogo.focus();
  }
});

async function concluirCancelamento() {
  try {
    assinatura = await carregarAssinatura();
  } catch (erro) {
    console.error(erro);
  }
  dialogo.bloquear(false);
  dialogo.fechar();
  renderizar();
  titulo.focus();
}

async function conferirDepoisDaFalha() {
  dialogo.bloquear(true);
  processando(botaoConfirmar, true, "Conferindo…");
  try {
    assinatura = await carregarAssinatura();
    dialogo.bloquear(false);
    dialogo.fechar();
    renderizar();
    titulo.focus();
  } catch (erro) {
    console.error(erro);
    dialogo.bloquear(false);
    estadoDialogo("falha");
  }
}

// ---------- Início ----------
async function iniciar() {
  raiz.setAttribute("aria-busy", "true");
  try {
    const [perfil, atual] = await Promise.all([carregarPerfil(), carregarAssinatura()]);
    mostrarNome(perfil?.nome);
    assinatura = atual;
    const aviso = reativada && atual?.status === "ativa"
      ? alerta("sucesso", "Assinatura reativada", "Seu plano está ativo. Reativar não cria um kit nem reinicia as utilizações do ciclo.", { foco: true })
      : null;
    renderizar({ aviso });
    aviso?.focus();
  } catch (erro) {
    console.error(erro);
    renderizarFalha();
  } finally {
    raiz.setAttribute("aria-busy", "false");
  }
}

(async () => {
  if (!supabase) return;
  if (!(await exigirSessao({ destino: "C04" }))) return;
  await iniciar();
})();
