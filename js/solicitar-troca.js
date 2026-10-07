// C07 — Solicitação de troca de uma camisa atual do kit.
// Modalidades: Modelo (mantém o tamanho), Tamanho (mantém o modelo, exige tamanho
// diferente) e Modelo e tamanho. O cliente não escolhe a camisa substituta: ela é
// definida no processamento administrativo. Não há campo de motivo.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { exigirCliente, montarCabecalho, mostrarNome, carregarPerfil, el, chip, competenciaExtenso } from "./cliente.js";
import { carregarAssinatura, alerta, codigoDoErro } from "./assinatura-comum.js";
import { processando, ehFalhaDeComunicacao } from "./formulario.js";
import { carregarKits, carregarItens, carregarTrocas, situacaoDasTrocas, camisaDoKit, faixaDeDados, MODALIDADES } from "./kits-comum.js";

avisarSemConfiguracao();
montarCabecalho("C08");

const raiz = document.querySelector("[data-c07]");
const conteudo = raiz.querySelector("[data-conteudo]");
const subtitulo = raiz.querySelector("[data-subtitulo]");
const voltar = document.querySelector("[data-voltar]");
const camisaId = Number(new URLSearchParams(location.search).get("camisa"));

let dados = null;
let modalidade = null;
let destino = "";

const linkDoKit = () => (dados?.item ? `${TELAS.C06}?competencia=${dados.item.competencia}` : TELAS.C05);

async function carregar() {
  const [itens, kits, trocas, assinatura, tamanhos] = await Promise.all([
    carregarItens(), carregarKits(), carregarTrocas(), carregarAssinatura(), supabase.rpc("tamanhos_do_catalogo"),
  ]);
  if (tamanhos.error) throw tamanhos.error;
  const item = itens.find((i) => i.camisa_id === camisaId) || null;
  const kit = item ? kits.find((k) => k.competencia === item.competencia) : null;
  const pendente = trocas.find((t) => t.camisa_original_id === camisaId && t.estado === "solicitada") || null;
  const situacao = assinatura ? await situacaoDasTrocas() : "sem_assinatura";
  return { item, kit, pendente, assinatura, situacao, tamanhos: tamanhos.data };
}

// ---------- Bloqueios ----------
// Ordem: camisa inexistente → não atual → solicitação aberta → assinatura → limite.
function bloqueio() {
  if (!dados.item) return {
    titulo: "Camisa não encontrada",
    texto: "Esta camisa não faz parte dos seus kits. Consulte seus kits para solicitar uma troca.",
    acao: el("a", { class: "botao botao--primaria", href: TELAS.C05 }, "Ver meus kits"),
  };
  if (dados.item.estado !== "atual") return {
    titulo: "Esta camisa não é mais a atual",
    texto: "O modelo foi substituído. Abra a composição atual do kit para solicitar uma troca na camisa vigente.",
    acao: el("a", { class: "botao botao--primaria", href: linkDoKit() }, "Ver composição atual"),
  };
  if (dados.pendente) return {
    titulo: "Esta camisa já tem uma solicitação",
    texto: "Há um pedido em estado Solicitada para esta camisa. Consulte a solicitação existente.",
    acao: el("a", { class: "botao botao--primaria", href: `${TELAS.C08}?troca=${dados.pendente.id}` }, "Ver solicitação"),
  };
  if (dados.situacao === "cancelada" || dados.situacao === "sem_assinatura") return {
    titulo: dados.situacao === "cancelada" ? "Assinatura cancelada" : "Sem assinatura ativa",
    texto: "É preciso ter uma assinatura ativa para solicitar e concluir uma troca. Seus registros continuam disponíveis.",
    acao: el("a", { class: "botao botao--primaria", href: TELAS.C04 }, "Ver minha assinatura"),
  };
  if (dados.situacao === "limite_atingido") return {
    titulo: "Limite de trocas atingido",
    texto: "Não há trocas disponíveis no ciclo atual. Consulte os benefícios da sua assinatura.",
    acao: el("a", { class: "botao botao--primaria", href: TELAS.C04 }, "Ver minha assinatura"),
  };
  return null;
}

// ---------- Formulário ----------
function opcoesDeModalidade() {
  const grupo = el("div", { class: "opcoes", role: "radiogroup", "aria-labelledby": "titulo-modalidade" });
  const textos = {
    modelo: "Outro modelo, mesmo tamanho.",
    tamanho: "Mesmo modelo, outro tamanho.",
    ambos: "Outro modelo e outro tamanho.",
  };
  for (const chave of ["modelo", "tamanho", "ambos"]) {
    const id = `modalidade-${chave}`;
    const entrada = el("input", { class: "opcao__radio", type: "radio", name: "modalidade", id, value: chave });
    entrada.checked = modalidade === chave;
    entrada.addEventListener("change", () => {
      modalidade = chave;
      renderizarFormulario();
      document.getElementById(id)?.focus();
    });
    grupo.append(el("label", { class: "opcao" + (modalidade === chave ? " opcao--selecionada" : ""), for: id },
      entrada,
      el("span", { class: "opcao__textos" },
        el("span", { class: "opcao__titulo" }, MODALIDADES[chave]),
        el("span", { class: "opcao__texto" }, textos[chave]))));
  }
  return grupo;
}

function campoTamanho() {
  const atual = dados.item.tamanho_atual;
  // O tamanho atual fica na lista: escolhê-lo mostra o erro junto ao campo
  const erro = destino && destino === atual;
  const select = el("select", {
    class: "campo__entrada", id: "tamanho-destino",
    "aria-describedby": erro ? "ajuda-tamanho erro-tamanho" : "ajuda-tamanho",
    "aria-invalid": erro ? "true" : null,
  },
    el("option", { value: "" }, "Selecione o tamanho"),
    ...dados.tamanhos.map((t) => el("option", { value: t }, t === atual ? `${t} (tamanho atual)` : t)));
  select.value = destino;
  select.addEventListener("change", () => {
    destino = select.value;
    renderizarFormulario();
    document.getElementById("tamanho-destino")?.focus();
  });
  return el("div", { class: "campo" + (erro ? " campo--erro" : "") },
    el("label", { class: "campo__rotulo", for: "tamanho-destino" }, "Tamanho de destino"),
    el("div", { class: "campo__caixa campo__caixa--selecao" }, select, el("span", { class: "campo__seta", "aria-hidden": "true" })),
    el("p", { class: "campo__ajuda", id: "ajuda-tamanho" }, `Tamanho atual: ${atual}. O destino precisa ser diferente.`),
    el("p", { class: "campo__erro", id: "erro-tamanho" }, "Escolha um tamanho diferente do atual."));
}

function resumoDoPedido() {
  const atual = dados.item.tamanho_atual;
  const linhas = [];
  if (modalidade === "modelo") linhas.push(`Tamanho: ${atual} → ${atual} (mantido)`, "Modelo substituto definido no processamento da troca.");
  else if (modalidade === "tamanho") linhas.push(`Tamanho: ${atual} → ${destino || "—"}`, "O modelo desta camisa será mantido.");
  else linhas.push(`Tamanho: ${atual} → ${destino || "—"}`, "Modelo substituto definido no processamento da troca.");
  return el("div", { class: "resumo-pedido" },
    el("p", { class: "resumo-pedido__titulo" }, `Modalidade: ${MODALIDADES[modalidade]}`),
    ...linhas.map((t) => el("p", {}, t)));
}

function renderizarFormulario({ aviso = null, enviando = false } = {}) {
  const precisaTamanho = modalidade === "tamanho" || modalidade === "ambos";
  const pronto = modalidade && (!precisaTamanho || (destino && destino !== dados.item.tamanho_atual));
  const botao = el("button", { class: "botao botao--primaria", type: "submit", disabled: pronto ? null : true, "aria-disabled": pronto ? null : "true" }, "Solicitar troca");
  const form = el("form", { class: "formulario-troca", novalidate: true },
    el("h2", { class: "secao-conta__titulo", id: "titulo-modalidade" }, "O que você deseja trocar?"),
    el("p", { class: "secao-conta__texto" }, "Escolha a modalidade para esta camisa do kit."),
    aviso,
    opcoesDeModalidade(),
    precisaTamanho ? campoTamanho() : null,
    modalidade ? resumoDoPedido() : el("p", { class: "pequeno" }, "Selecione uma modalidade para continuar."),
    botao,
    el("p", { class: "nota-rodape" }, "Solicitar uma troca não altera a composição do kit imediatamente."));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    enviar(form.querySelector("button[type=submit]"));
  });
  const area = conteudo.querySelector("[data-formulario]");
  area.replaceChildren(form);
  if (enviando) processando(form.querySelector("button[type=submit]"), true, "Enviando…");
  return form;
}

async function enviar(botao) {
  if (botao.disabled) return;
  processando(botao, true, "Enviando…");
  botao.closest("form").querySelectorAll("input, select").forEach((c) => (c.disabled = true));
  try {
    const { error } = await supabase.rpc("solicitar_troca", {
      p_camisa_id: camisaId,
      p_modalidade: modalidade,
      p_tamanho_destino: modalidade === "modelo" ? null : destino,
    });
    if (error) throw error;
    renderizarRegistrada();
  } catch (erro) {
    console.error(erro);
    const codigo = codigoDoErro(erro);
    // Regras recusadas pelo banco: recarrega e mostra o bloqueio correspondente.
    if (["item_nao_atual", "solicitacao_existente", "limite_atingido", "assinatura_inativa", "item_inexistente"].includes(codigo)) {
      return iniciar();
    }
    if (codigo === "tamanho_igual" || codigo === "tamanho_invalido") {
      destino = "";
      return renderizarFormulario({ aviso: alerta("erro", "Escolha um tamanho diferente do atual", "O pedido sem alteração não é aceito.", { foco: true }) });
    }
    if (!codigo || ehFalhaDeComunicacao(erro)) {
      // Resultado incerto: consulta antes de permitir uma nova tentativa.
      try {
        const trocas = await carregarTrocas();
        if (trocas.some((t) => t.camisa_original_id === camisaId && t.estado === "solicitada")) return renderizarRegistrada();
      } catch (e) {
        console.error(e);
      }
      return renderizarFormulario({ aviso: alerta("erro", "Resultado não confirmado", "Não foi possível confirmar o resultado. Consulte suas trocas antes de tentar novamente.", { foco: true }) });
    }
    renderizarFormulario({ aviso: alerta("erro", "Não foi possível enviar", "Nenhuma solicitação foi registrada. Os dados foram mantidos para tentar novamente.", { foco: true }) });
  }
}

function renderizarRegistrada() {
  const area = conteudo.querySelector("[data-formulario]");
  const bloco = el("div", { class: "formulario-troca" },
    alerta("sucesso", "Solicitação registrada", "O pedido está em Solicitada. Acompanhe o andamento em Minhas trocas.", { foco: true }),
    resumoDoPedido(),
    el("p", { class: "cartao__texto" }, "A camisa atual permanece no kit até a conclusão da troca."),
    el("div", { class: "acoes-cartao" },
      el("a", { class: "link", href: linkDoKit() }, "Voltar ao kit"),
      el("a", { class: "botao botao--primaria", href: TELAS.C08 }, "Ver minhas trocas")));
  area.replaceChildren(bloco);
  area.querySelector(".alerta").focus();
}

// ---------- Tela ----------
function colunaBeneficio() {
  const plano = dados.assinatura?.plano;
  const estados = {
    disponivel: chip("Ativa", "sucesso", "✓"),
    limite_atingido: chip("Limite atingido", "neutro", "–"),
    cancelada: chip("Cancelada", "erro", "×"),
    sem_assinatura: chip("Sem assinatura", "neutro", "–"),
  };
  return el("section", { class: "cartao", "aria-labelledby": "titulo-beneficio-troca" },
    el("h2", { class: "cartao__titulo", id: "titulo-beneficio-troca" }, "Benefício de troca"),
    estados[dados.situacao],
    plano ? el("p", { class: "cartao__texto cartao__texto--forte" }, `Plano atual: ${plano.nome}`) : null,
    plano ? el("p", { class: "cartao__texto" }, `${plano.trocas} troca${plano.trocas > 1 ? "s" : ""} a cada 12 meses de assinatura.`) : null,
    el("p", { class: "cartao__texto" }, "Solicitar registra um pedido. A camisa do kit só muda após a conclusão da troca."),
    el("a", { class: "link", href: TELAS.C04 }, "Ver minha assinatura"),
    el("p", { class: "cartao__nota" }, "A assinatura precisa estar ativa para solicitar e concluir uma troca."));
}

function renderizar() {
  const impedimento = bloqueio();
  voltar.setAttribute("href", linkDoKit());
  subtitulo.textContent = impedimento ? "Consulte as condições de troca desta camisa do kit." : "Defina como deseja trocar esta camisa do seu kit.";

  if (!dados.item) {
    conteudo.replaceChildren(el("section", { class: "cartao cartao--estado", role: "alert" },
      el("h2", { class: "cartao__titulo" }, impedimento.titulo),
      el("p", { class: "cartao__texto" }, impedimento.texto),
      impedimento.acao));
    return;
  }

  const principal = el("div", { class: "painel-grade__principal" },
    camisaDoKit(dados.item, { rotulo: `Camisa ${dados.item.posicao}`, chipEstado: dados.item.estado === "atual" ? chip("Atual", "sucesso", "●") : chip("Substituída", "neutro", "→") }));

  if (impedimento) {
    principal.append(el("section", { class: "cartao cartao--estado", role: "status" },
      el("h2", { class: "cartao__titulo" }, impedimento.titulo),
      el("p", { class: "cartao__texto" }, impedimento.texto),
      el("div", { class: "acoes-cartao" }, el("a", { class: "link", href: linkDoKit() }, "Voltar ao kit"), impedimento.acao)));
  } else {
    principal.append(el("section", { class: "cartao", "data-formulario": true }));
  }

  conteudo.replaceChildren(
    faixaDeDados([
      ["Kit de origem", competenciaExtenso(dados.item.competencia)],
      ["Plano registrado", dados.kit?.planos?.nome || "—"],
      ["Camisa do kit", `Camisa ${dados.item.posicao}`],
      ["Tamanho atual", dados.item.tamanho_atual],
    ]),
    el("div", { class: "painel-grade" }, principal, el("div", { class: "painel-grade__lateral" }, colunaBeneficio())));

  if (!impedimento) renderizarFormulario();
}

function renderizarFalha() {
  const tentar = el("button", { class: "botao botao--primaria", type: "button" }, "Tentar novamente");
  tentar.addEventListener("click", async () => {
    tentar.disabled = true;
    await iniciar();
  });
  conteudo.replaceChildren(el("section", { class: "cartao cartao--falha", role: "alert" },
    el("span", { class: "cartao--falha__icone", "aria-hidden": "true" }, "!"),
    el("h2", { class: "cartao__titulo" }, "Não foi possível carregar esta camisa"),
    el("p", { class: "cartao__texto" }, "Tente consultar novamente. Nenhuma solicitação foi registrada."),
    tentar));
  tentar.focus();
}

async function iniciar() {
  raiz.setAttribute("aria-busy", "true");
  try {
    const [perfil, carga] = await Promise.all([carregarPerfil(), carregar()]);
    mostrarNome(perfil?.nome);
    dados = carga;
    renderizar();
  } catch (erro) {
    console.error(erro);
    renderizarFalha();
  } finally {
    raiz.setAttribute("aria-busy", "false");
  }
}

(async () => {
  if (!supabase) return;
  if (!(await exigirCliente({}))) return;
  await iniciar();
})();
