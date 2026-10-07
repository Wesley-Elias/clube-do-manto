// C06 — Detalhes do kit: composição atual por posição, ações de troca e a seção
// expansível com a composição original e as alterações registradas.
// Os rótulos descrevem registros do sistema, não recebimento ou transporte físico.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { exigirCliente, montarCabecalho, mostrarNome, carregarPerfil, el, chip, competenciaExtenso, dataCurta } from "./cliente.js";
import { carregarAssinatura } from "./assinatura-comum.js";
import {
  carregarKits, carregarItens, carregarTrocas, carregarCamisas, situacaoDasTrocas,
  composicaoRegistrada, descricaoCamisa, tipoDaCamisa, camisaDoKit, faixaDeDados, chipDeTroca, MODALIDADES,
} from "./kits-comum.js";

avisarSemConfiguracao();
montarCabecalho("C05");

const raiz = document.querySelector("[data-c06]");
const conteudo = raiz.querySelector("[data-conteudo]");
const parametros = new URLSearchParams(location.search);
const competencia = parametros.get("competencia");
const origem = parametros.get("origem") === "historico" ? `${TELAS.C05}?aba=historico` : TELAS.C05;
document.querySelector("[data-voltar]").setAttribute("href", origem);

let dados = null;

async function carregar() {
  const [kits, itens, trocas, assinatura] = await Promise.all([carregarKits(), carregarItens(competencia), carregarTrocas(), carregarAssinatura()]);
  const kit = kits.find((k) => k.competencia === competencia) || null;
  const situacao = assinatura ? await situacaoDasTrocas() : "sem_assinatura";
  const doKit = trocas.filter((t) => itens.some((i) => i.camisa_id === t.camisa_original_id));
  const substitutas = await carregarCamisas(doKit.map((t) => t.camisa_substituta_id));
  return { kit, itens, trocas: doKit, assinatura, situacao, substitutas };
}

// ---------- Composição atual ----------
function acaoDaCamisa(item) {
  const pendente = dados.trocas.find((t) => t.camisa_original_id === item.camisa_id && t.estado === "solicitada");
  if (pendente) {
    return {
      chipEstado: chip("Troca solicitada", "aviso", "◷"),
      acao: el("a", { class: "link", href: `${TELAS.C08}?troca=${pendente.id}` }, "Ver solicitação"),
    };
  }
  if (dados.situacao === "disponivel") {
    return {
      chipEstado: chip("Atual", "sucesso", "●"),
      acao: el("a", { class: "botao botao--escura", href: `${TELAS.C07}?camisa=${item.camisa_id}` }, "Solicitar troca"),
    };
  }
  const motivos = {
    limite_atingido: "Limite de trocas esgotado.",
    cancelada: "A assinatura precisa estar ativa para solicitar troca.",
    sem_assinatura: "A assinatura precisa estar ativa para solicitar troca.",
  };
  return { chipEstado: chip("Atual", "sucesso", "●"), motivo: motivos[dados.situacao] };
}

function composicaoAtual() {
  const atuais = dados.itens.filter((i) => i.estado === "atual").sort((a, b) => a.posicao - b.posicao);
  const blocos = atuais.map((item) => {
    const { chipEstado, acao, motivo } = acaoDaCamisa(item);
    return camisaDoKit(item, { rotulo: `Camisa ${item.posicao}`, chipEstado, acao, motivo });
  });
  return el("section", { class: "secao-conta", "aria-labelledby": "titulo-composicao" },
    el("h2", { class: "secao-conta__titulo", id: "titulo-composicao" }, "Composição atual"),
    el("p", { class: "secao-conta__texto" }, "A camisa exibida em cada posição considera as trocas concluídas."),
    ...blocos);
}

// ---------- Composição original e alterações ----------
function composicaoOriginal() {
  const originais = dados.itens.filter((i) => i.origem === "kit").sort((a, b) => a.posicao - b.posicao);
  const concluidas = dados.trocas.filter((t) => t.estado === "concluida");
  const coluna = el("div", { class: "expansivel__coluna" },
    el("h3", { class: "expansivel__subtitulo" }, "Composição original"),
    el("p", { class: "pequeno" }, "Itens registrados na montagem deste kit. Modelos substituídos permanecem no histórico."),
    ...originais.map((item) => camisaDoKit(item, {
      rotulo: `Camisa ${item.posicao}`,
      chipEstado: item.estado === "atual" ? chip("Original", "neutro", "•") : chip("Substituída", "neutro", "→"),
    })));

  const alteracoes = el("div", { class: "expansivel__coluna expansivel__coluna--alteracoes" },
    el("h3", { class: "expansivel__subtitulo" }, "Alterações do kit"));
  if (concluidas.length) {
    for (const troca of concluidas) {
      const antes = dados.itens.find((i) => i.camisa_id === troca.camisa_original_id);
      const depois = dados.substitutas[troca.camisa_substituta_id];
      alteracoes.append(el("div", { class: "evento" },
        el("p", { class: "evento__data" }, dataCurta(troca.concluida_em)),
        el("p", { class: "evento__titulo" }, `${MODALIDADES[troca.modalidade]} • Camisa ${antes?.posicao ?? "—"}`),
        el("div", { class: "evento__lados" },
          ladoDoEvento("Antes da troca", antes?.camisas, troca.tamanho_original),
          ladoDoEvento("Após a troca", depois, troca.tamanho_destino))));
    }
  } else {
    alteracoes.append(el("p", { class: "pequeno" }, "Nenhuma troca concluída neste kit."));
  }

  const corpo = el("div", { class: "expansivel__corpo", id: "composicao-original", hidden: true },
    el("div", { class: "expansivel__grade" }, coluna, alteracoes));

  const botao = el("button", { class: "expansivel__botao", type: "button", "aria-expanded": "false", "aria-controls": "composicao-original" },
    el("span", {}, "Composição original e alterações"),
    el("span", { class: "expansivel__sinal", "aria-hidden": "true" }, "+"));
  botao.addEventListener("click", () => {
    const abrir = botao.getAttribute("aria-expanded") !== "true";
    botao.setAttribute("aria-expanded", String(abrir));
    botao.querySelector(".expansivel__sinal").textContent = abrir ? "−" : "+";
    corpo.hidden = !abrir;
  });
  return el("section", { class: "expansivel" }, el("h2", {}, botao), corpo);
}

function ladoDoEvento(rotulo, camisa, tamanho) {
  return el("div", { class: "evento__lado" },
    el("p", { class: "evento__rotulo" }, rotulo),
    camisa
      ? el("div", {},
          el("p", { class: "evento__equipe" }, camisa.equipes.nome),
          el("p", {}, descricaoCamisa(camisa)),
          el("p", {}, `${tipoDaCamisa(camisa)} • Tamanho ${tamanho}`))
      : el("p", {}, "Modelo não registrado."));
}

// ---------- Coluna lateral ----------
function colunaTrocas() {
  const plano = dados.assinatura?.plano;
  const pendentes = dados.trocas.filter((t) => t.estado === "solicitada");
  const textos = {
    disponivel: "Você pode solicitar a troca de tamanho, modelo ou ambos a partir da camisa atual. A conclusão também exige assinatura ativa.",
    limite_atingido: "Você já usou o limite de trocas do ciclo atual. Consulte os benefícios da sua assinatura.",
    cancelada: "Seus kits e alterações continuam registrados. É preciso reativar a assinatura para solicitar e concluir uma troca.",
    sem_assinatura: "É preciso ter uma assinatura ativa para solicitar e concluir uma troca.",
  };
  const chips = {
    disponivel: chip("Ativa", "sucesso", "✓"),
    limite_atingido: chip("Limite atingido", "neutro", "–"),
    cancelada: chip("Assinatura cancelada", "erro", "×"),
    sem_assinatura: chip("Sem assinatura", "neutro", "–"),
  };
  return el("section", { class: "cartao", "aria-labelledby": "titulo-trocas-kit" },
    el("h2", { class: "cartao__titulo", id: "titulo-trocas-kit" }, "Trocas deste kit"),
    pendentes.length ? chip("Troca solicitada", "aviso", "◷") : chips[dados.situacao],
    plano ? el("p", { class: "cartao__texto cartao__texto--forte" }, `Plano atual: ${plano.nome}`) : null,
    el("p", { class: "cartao__texto" }, pendentes.length
      ? `${pendentes.length === 1 ? "Uma camisa deste kit tem" : `${pendentes.length} camisas deste kit têm`} solicitação em andamento. Abra a solicitação para consultar os detalhes.`
      : textos[dados.situacao]),
    el("a", { class: "link", href: TELAS.C04 }, "Ver minha assinatura"),
    el("p", { class: "cartao__nota" }, "Modelos já registrados no histórico não se tornam elegíveis pela mudança de tamanho ou tipo."));
}

// ---------- Tela ----------
function renderizar() {
  const kit = dados.kit;
  document.querySelector(".area-cliente__titulo").textContent = "Detalhes do kit";
  document.title = `Kit de ${competenciaExtenso(kit.competencia)} · Clube do Manto`;
  conteudo.replaceChildren(
    faixaDeDados([
      ["Mês do kit", competenciaExtenso(kit.competencia)],
      ["Plano registrado", kit.planos?.nome || "—"],
      ["Composição registrada", composicaoRegistrada(kit)],
      ["Brinde", kit.brinde_previsto ? kit.brinde_descricao || "Previsto" : "Sem brinde"],
    ]),
    el("div", { class: "painel-grade" },
      el("div", { class: "painel-grade__principal" }, composicaoAtual(), composicaoOriginal()),
      el("div", { class: "painel-grade__lateral" }, colunaTrocas())));
}

function renderizarFalha(semKit = false) {
  const acao = semKit
    ? el("a", { class: "botao botao--primaria", href: origem }, "Voltar aos kits")
    : el("button", { class: "botao botao--primaria", type: "button" }, "Tentar novamente");
  if (!semKit) {
    acao.addEventListener("click", async () => {
      acao.disabled = true;
      await iniciar();
    });
  }
  conteudo.replaceChildren(el("section", { class: "cartao cartao--falha", role: "alert" },
    el("span", { class: "cartao--falha__icone", "aria-hidden": "true" }, "!"),
    el("h2", { class: "cartao__titulo" }, semKit ? "Kit não encontrado" : "Não foi possível carregar este kit"),
    el("p", { class: "cartao__texto" }, semKit
      ? "Não há kit registrado para este mês na sua conta. Consulte a lista de kits."
      : "Tente consultar novamente para ver a composição e as alterações."),
    acao));
  acao.focus();
}

async function iniciar() {
  raiz.setAttribute("aria-busy", "true");
  try {
    if (!/^\d{4}-\d{2}-01$/.test(competencia || "")) return renderizarFalha(true);
    const [perfil, carga] = await Promise.all([carregarPerfil(), carregar()]);
    mostrarNome(perfil?.nome);
    dados = carga;
    if (!dados.kit) return renderizarFalha(true);
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
  if (!(await exigirCliente({ destino: "C05" }))) return;
  await iniciar();
})();
