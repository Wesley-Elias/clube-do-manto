// A10 — Processamento da troca. Concluir revalida tudo no banco, define a camisa
// substituta e registra a substituição com a baixa de estoque em uma operação
// (admin_concluir_troca). Rejeitar registra só o estado; o modelo não tem motivo
// nem data de rejeição. Pedido encerrado não oferece novo processamento.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { el, chip, dataCurta } from "./cliente.js";
import { criarDialogo } from "./dialogo.js";
import { processando } from "./formulario.js";
import { montarCabecalhoAdmin, exigirAdministrador, mostrarFalhaGeral, codigoDoErro, falhaIncerta } from "./admin.js";
import { camisaDoKit, chipDeTroca, MODALIDADES } from "./kits-comum.js";
import { alerta, chipAssinatura, textoTrocasDoPlano, linkDoAssinante, retornoSeguro, rotuloCompetencia } from "./admin-operacao.js";

avisarSemConfiguracao();
montarCabecalhoAdmin("A09");

const principal = document.querySelector("[data-tela]");
const params = new URLSearchParams(location.search);
const trocaId = params.get("troca") || "";
const voltar = retornoSeguro(params.get("voltar"), TELAS.A09, [TELAS.A09]);
let dados = null;
let abertaNoCarregamento = true; // título "Processamento" ou "Registro"
let aviso = null; // { tipo, titulo, texto, bloquearConclusao, estoque }

function topo() {
  const titulo = abertaNoCarregamento ? "Processamento da troca" : "Registro da troca";
  return el("div", { class: "area-cliente__topo" },
    el("a", { class: "area-cliente__voltar", href: voltar }, el("span", { "aria-hidden": "true" }, "←"), "Voltar às solicitações"),
    el("p", { class: "chamada chamada--no-escuro" }, `Administração / Trocas${dados ? ` / ${dados.numero}` : ""}`),
    el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, titulo),
    el("p", { class: "area-cliente__sub" }, abertaNoCarregamento
      ? "Confira a solicitação e confirme a operação administrativa."
      : "Consulte o pedido encerrado e os dados preservados."));
}

async function carregar() {
  const { data, error } = await supabase.rpc("admin_troca", { p_troca: trocaId });
  if (error) throw error;
  dados = data;
}

// ---------- Blocos ----------
function alertaDoEstado() {
  if (aviso) return alerta(aviso.tipo, aviso.titulo, aviso.texto, { role: aviso.tipo === "erro" ? "alert" : null, tabindex: "-1", "data-foco": true });
  if (dados.estado === "concluida") {
    return alerta("sucesso", "Troca concluída", `Troca concluída em ${dataCurta(dados.concluida_em)}. O kit preserva a origem e apresenta a composição atual.`);
  }
  if (dados.estado === "rejeitada") {
    return alerta("aviso", "Solicitação rejeitada", "O pedido não alterou a composição do kit. Este registro permanece consultável.");
  }
  return alerta("info", "Solicitação em aberto", "Confira os dados antes de concluir ou rejeitar. A composição do kit permanece até a conclusão.");
}

function textoTamanho() {
  return dados.modalidade === "modelo"
    ? `Origem: ${dados.tamanho_original} • Solicitado: ${dados.tamanho_destino} (mantido)`
    : `Origem: ${dados.tamanho_original} • Solicitado: ${dados.tamanho_destino}`;
}

function grade() {
  const pares = [
    ["Solicitada em", dataCurta(dados.solicitada_em)],
    ["Kit", `${rotuloCompetencia(dados.kit.competencia)} • Camisa ${dados.item.posicao}`],
    ["Plano registrado no kit", dados.kit.plano],
    ["Modalidade", MODALIDADES[dados.modalidade]],
    ["Tamanho", textoTamanho()],
  ];
  return el("dl", { class: "grade-troca" }, ...pares.map(([r, v]) => el("div", {}, el("dt", {}, r), el("dd", {}, v))));
}

function itemDoPedido() {
  const item = { grupo: dados.item.grupo, camisas: dados.item.camisas, tamanho_atual: dados.tamanho_original };
  const chipItem = dados.item.estado === "atual" ? chip("Atual", "sucesso", "●") : chip("Substituída", "neutro", "→");
  return el("div", { class: "coluna-troca" },
    el("h3", { class: "chamada chamada--neutra" }, "Item no momento do pedido"),
    camisaDoKit(item, { rotulo: `Camisa ${dados.item.posicao}`, chipEstado: chipItem }),
    el("p", { class: "cartao__texto" }, "O registro de origem permanece no histórico do assinante."));
}

function resultado() {
  const filhos = [el("h3", { class: "chamada chamada--neutra" }, "Resultado")];
  if (dados.estado === "concluida") {
    const tamanhoMantido = dados.modalidade === "tamanho";
    filhos.push(
      camisaDoKit({ grupo: dados.item.grupo, camisas: dados.substituta, tamanho_atual: dados.tamanho_destino },
        { rotulo: `Camisa ${dados.item.posicao}`, chipEstado: chip("Atual", "sucesso", "●") }),
      el("p", { class: "cartao__texto" }, `Concluída em ${dataCurta(dados.concluida_em)}.`),
      el("p", { class: "cartao__texto" }, tamanhoMantido
        ? "O mesmo modelo segue na posição do kit, agora no tamanho solicitado."
        : "A nova camisa ocupa a mesma posição do kit. A origem permanece registrada como substituída."));
  } else if (dados.estado === "rejeitada") {
    filhos.push(
      el("p", { class: "cartao__texto" }, "Nenhuma alteração registrada por este pedido."),
      el("p", { class: "cartao__texto" }, "A rejeição não substituiu o item de origem."));
  } else {
    filhos.push(
      el("p", { class: "cartao__texto" }, dados.modalidade === "tamanho"
        ? "O modelo é o mesmo; muda apenas o tamanho."
        : "Modelo de destino ainda não confirmado."),
      el("p", { class: "cartao__texto" }, dados.modalidade === "modelo"
        ? `Tamanho solicitado: ${dados.tamanho_destino} (mantido na troca de modelo).`
        : `Tamanho solicitado: ${dados.tamanho_destino}.`),
      el("p", { class: "cartao__texto" }, "O resultado será apresentado somente após a conclusão confirmada."));
  }
  return el("div", { class: "coluna-troca" }, ...filhos);
}

function verificacoes() {
  return el("div", { class: "verificacoes" },
    el("p", { class: "verificacoes__titulo" }, "Verificações antes de concluir"),
    el("ul", { class: "lista-regras" },
      el("li", {}, "Solicitação ainda aberta, assinatura ativa e benefício válido no ciclo vinculado ao pedido."),
      el("li", {}, "Item atual e pertencente ao solicitante."),
      el("li", {}, dados.modalidade === "tamanho"
        ? "Mesmo modelo, no tamanho solicitado."
        : "Modelo inédito para o assinante, ativo, do mesmo grupo do item e sem a equipe rival."),
      el("li", {}, "Estoque no tamanho solicitado e registro integral da substituição.")));
}

function acoes() {
  if (dados.estado !== "solicitada") {
    return el("div", { class: "acoes-linha acoes-linha--botoes" },
      el("a", { class: dados.estado === "concluida" ? "botao botao--primaria" : "botao botao--sec-claro", href: linkDoAssinante(dados.assinante.usuario_id, { kit: dados.kit.competencia }) }, "Ver kit do assinante"));
  }
  const concluir = el("button", { class: "botao botao--primaria", type: "button", "data-concluir": true }, "Concluir troca");
  concluir.addEventListener("click", () => abrirConfirmacao("concluir", concluir));
  const rejeitar = el("button", { class: "botao botao--sec-claro", type: "button" }, "Rejeitar solicitação");
  rejeitar.addEventListener("click", () => abrirConfirmacao("rejeitar", rejeitar));
  if (aviso?.bloquearConclusao) concluir.disabled = true;
  // Troca de tamanho: o estoque abre filtrado pelo modelo; nas demais, a substituta pode ser outro modelo
  const linkEstoque = dados.modalidade === "tamanho" && dados.item.camisas?.id ? `${TELAS.A05}?camisa=${dados.item.camisas.id}` : TELAS.A05;
  const estoque = aviso?.estoque ? el("a", { class: "botao botao--sec-claro", href: linkEstoque }, "Consultar estoque") : null;
  return el("div", { class: "acoes-linha acoes-linha--botoes" }, estoque || concluir, rejeitar);
}

function lateral() {
  const a = dados.assinatura;
  return el("section", { class: "cartao cartao--lateral", "aria-labelledby": "titulo-solicitante" },
    el("p", { class: "chamada chamada--neutra" }, "Assinante"),
    el("h2", { class: "cartao-lateral__nome", id: "titulo-solicitante" }, dados.assinante.nome),
    el("p", { class: "cartao__nota" }, `Referência: ${dados.assinante.referencia}`),
    el("dl", { class: "dados-lateral" },
      el("div", {}, el("dt", {}, "Plano atual"), el("dd", {}, a?.plano || "Sem assinatura")),
      el("div", {}, el("dt", {}, "Equipe rival"), el("dd", {}, dados.assinante.rival || "Não informada"))),
    el("p", { class: "cartao-lateral__linha" }, dados.estado === "solicitada" ? "Assinatura na consulta:" : "Assinatura:", chipAssinatura(a?.status)),
    a ? el("p", { class: "cartao__texto" }, textoTrocasDoPlano(a.trocas_anuais)) : null,
    dados.estado === "solicitada"
      ? el("p", { class: "cartao__texto" }, "Ciclo vinculado à solicitação • 12 meses de assinatura. A elegibilidade será conferida na conclusão.")
      : null,
    el("a", { class: "link", href: linkDoAssinante(dados.assinante.usuario_id) }, "Ver assinante"));
}

function renderizar() {
  document.title = `${dados.numero} · Trocas · Administração · Clube do Manto`;
  principal.replaceChildren(el("div", { class: "container" },
    topo(),
    el("div", { class: "painel-grade painel-grade--admin" },
      el("div", { class: "painel-grade__principal" },
        el("section", { class: "cartao cartao--admin cartao--troca", "aria-labelledby": "titulo-troca" },
          el("div", { class: "cartao__topo" },
            el("h2", { class: "cartao-lateral__nome cartao-lateral__nome--grande", id: "titulo-troca" }, dados.numero),
            chipDeTroca(dados.estado)),
          alertaDoEstado(),
          grade(),
          el("div", { class: "colunas-troca" }, itemDoPedido(), resultado()),
          dados.estado === "solicitada" ? verificacoes() : null,
          acoes())),
      el("div", { class: "painel-grade__lateral" }, lateral()))),
    caixa);
  principal.querySelector("[data-foco]")?.focus();
}

// ---------- Diálogos de confirmação ----------
const caixa = el("dialog", { class: "dialogo", "aria-labelledby": "titulo-confirmacao" },
  el("div", { class: "dialogo__caixa" },
    el("h2", { class: "dialogo__titulo", id: "titulo-confirmacao", tabindex: "-1" }),
    el("p", { class: "dialogo__texto", "data-texto": true }),
    el("div", { class: "dialogo__acoes" },
      el("button", { class: "botao botao--sec-claro", type: "button", "data-fechar-dialogo": true }, "Voltar sem confirmar"),
      el("button", { class: "botao", type: "button", "data-confirmar": true }))));
const dialogo = criarDialogo(caixa);
let operacao = null;

function abrirConfirmacao(tipo, gatilho) {
  operacao = tipo;
  const concluir = tipo === "concluir";
  caixa.querySelector("#titulo-confirmacao").textContent = concluir ? "Confirmar conclusão da troca?" : `Rejeitar a solicitação ${dados.numero}?`;
  caixa.querySelector("[data-texto]").textContent = concluir
    ? (dados.modalidade === "tamanho"
      ? "A operação verificará novamente os critérios e o estoque e registrará a mudança de tamanho do mesmo modelo. O kit manterá a quantidade de camisas."
      : "A operação verificará novamente os critérios e o estoque, definirá a substituta e registrará a troca completa. O kit manterá a quantidade de camisas.")
    : "A rejeição encerrará este pedido e preservará a composição do kit. O mesmo pedido não poderá ser processado novamente.";
  const botao = caixa.querySelector("[data-confirmar]");
  botao.className = `botao ${concluir ? "botao--primaria" : "botao--escura"}`;
  botao.textContent = concluir ? "Confirmar conclusão" : "Confirmar rejeição";
  dialogo.abrir(gatilho);
}

const BLOQUEIOS = {
  assinatura_inativa: "A assinatura do solicitante não está ativa. A troca não pode ser concluída; o pedido permanece Solicitada.",
  limite_atingido: "O benefício de trocas do ciclo vinculado ao pedido já foi utilizado. O pedido permanece Solicitada.",
  item_nao_atual: "O item de origem não é mais a camisa atual do kit. O pedido permanece Solicitada.",
};

caixa.querySelector("[data-confirmar]").addEventListener("click", async (e) => {
  const botao = e.currentTarget;
  const concluir = operacao === "concluir";
  processando(botao, true, concluir ? "Concluindo…" : "Rejeitando…");
  caixa.querySelectorAll("[data-fechar-dialogo]").forEach((b) => (b.disabled = true));
  dialogo.bloquear(true);
  const { error } = await supabase.rpc(concluir ? "admin_concluir_troca" : "admin_rejeitar_troca", { p_troca: trocaId });
  processando(botao, false);
  caixa.querySelectorAll("[data-fechar-dialogo]").forEach((b) => (b.disabled = false));
  dialogo.bloquear(false);
  dialogo.fechar();

  aviso = null;
  if (error) {
    console.error(error);
    const codigo = codigoDoErro(error);
    if (codigo === "sem_estoque") {
      aviso = {
        tipo: "erro", estoque: true, titulo: "Estoque elegível indisponível",
        texto: error.hint === "tamanho"
          ? `Não há saldo deste modelo no tamanho ${dados.tamanho_destino}. O pedido permanece Solicitada, sem substituição ou baixa parcial.`
          : `Não há modelo elegível com saldo no tamanho ${dados.tamanho_destino}. O pedido permanece Solicitada, sem substituição ou baixa parcial.`,
      };
    } else if (BLOQUEIOS[codigo]) {
      aviso = { tipo: "erro", bloquearConclusao: true, titulo: "Conclusão indisponível", texto: BLOQUEIOS[codigo] };
    } else if (codigo === "troca_encerrada") {
      aviso = { tipo: "aviso", titulo: "Solicitação já processada", texto: "Este pedido foi encerrado em outra operação. Confira o registro atualizado." };
    } else if (falhaIncerta(error)) {
      aviso = { tipo: "erro", titulo: "Não foi possível confirmar o resultado", texto: "A consulta foi atualizada. Confira o estado do pedido antes de tentar novamente." };
    } else {
      aviso = { tipo: "erro", titulo: concluir ? "Não foi possível concluir a troca" : "Não foi possível rejeitar a solicitação", texto: "Nada foi alterado. Tente novamente em instantes." };
    }
  }
  try {
    await carregar();
  } catch (erro) {
    console.error(erro);
    aviso = { tipo: "erro", bloquearConclusao: true, titulo: "Não foi possível atualizar a consulta", texto: "Recarregue a página para conferir o estado do pedido antes de repetir a operação." };
  }
  renderizar();
  // Depois de um resultado confirmado, o alerta do próprio estado informa o resultado
  if (!error) {
    const alertaEstado = principal.querySelector(".cartao--troca .alerta");
    alertaEstado?.setAttribute("tabindex", "-1");
    alertaEstado?.focus();
  }
});

function naoEncontrada() {
  principal.setAttribute("aria-busy", "false");
  principal.replaceChildren(el("div", { class: "container" },
    topo(),
    el("section", { class: "cartao cartao--falha", role: "alert" },
      el("span", { class: "cartao--falha__icone", "aria-hidden": "true" }, "!"),
      el("h2", { class: "cartao__titulo" }, "Solicitação não encontrada"),
      el("p", { class: "cartao__texto" }, "Este pedido não existe ou o endereço está incompleto. Volte à lista de solicitações."),
      el("a", { class: "botao botao--primaria", href: voltar }, "Voltar às solicitações"))));
}

(async () => {
  if (!(await exigirAdministrador(principal))) return;
  if (!/^[0-9a-f-]{36}$/i.test(trocaId)) return naoEncontrada();
  try {
    await carregar();
  } catch (erro) {
    console.error(erro);
    if (codigoDoErro(erro) === "troca_inexistente") return naoEncontrada();
    mostrarFalhaGeral(principal, "Não foi possível consultar a solicitação", () => location.reload());
    return;
  }
  abertaNoCarregamento = dados.estado === "solicitada";
  principal.setAttribute("aria-busy", "false");
  renderizar();
})();
