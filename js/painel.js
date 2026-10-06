// C01 — Painel do cliente.
// Lê só os dados do próprio cliente (RLS): perfil, assinatura, kits e trocas.
// Sem saldo de trocas nem datas de ciclo (decisão de 05/10): o benefício aparece como "Limite do plano".
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { TELAS } from "./sessao.js";
import {
  exigirSessao, montarCabecalho, mostrarNome, perfilCompleto, carregarPerfil,
  el, chip, nomeDoMes, competenciaExtenso, competenciaAtual, dataCurta,
} from "./cliente.js";

avisarSemConfiguracao();
montarCabecalho("C01");

const raiz = document.querySelector("[data-painel]");
const titulo = raiz.querySelector("[data-titulo]");
const subtitulo = raiz.querySelector("[data-subtitulo]");
const conteudo = raiz.querySelector("[data-conteudo]");
const falha = raiz.querySelector("[data-falha]");
const ind = (nome) => raiz.querySelector(`[data-ind="${nome}"]`);

const TIPOS = { clube: "Clube internacional", selecao: "Seleção mundial", especial: "Especial" };
const MODALIDADES = { modelo: "Troca de modelo", tamanho: "Troca de tamanho", ambos: "Troca de modelo e tamanho" };
const ESTADOS_TROCA = {
  solicitada: ["Solicitada", "aviso", "…"],
  concluida: ["Concluída", "sucesso", "✓"],
  rejeitada: ["Rejeitada", "erro", "×"],
};

// ---------- Leitura ----------
async function carregar() {
  const perfil = await carregarPerfil();

  const [assinatura, kits, trocas, equipes] = await Promise.all([
    supabase
      .from("assinaturas")
      .select("status, planos(nome, qtd_comuns, qtd_especiais, possui_brinde)")
      .maybeSingle(),
    supabase
      .from("kits")
      .select("competencia, qtd_comuns_prevista, qtd_especiais_prevista, brinde_previsto")
      .order("competencia", { ascending: false }),
    supabase
      .from("trocas")
      .select("modalidade, estado, solicitada_em, concluida_em, item:kit_itens!fk_trocas_item_original(camisas!kit_itens_camisa_id_fkey(temporada, categoria, equipes(nome)))")
      .order("solicitada_em", { ascending: false })
      .limit(1),
    perfil && (perfil.equipe_preferida_id || perfil.rival_id)
      ? supabase.from("equipes").select("id, nome").in("id", [perfil.equipe_preferida_id, perfil.rival_id].filter(Boolean))
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [assinatura, kits, trocas, equipes]) if (r.error) throw r.error;

  const atual = competenciaAtual();
  const kitDoMes = kits.data.find((k) => k.competencia === atual) || null;
  let itens = [];
  if (assinatura.data?.status === "ativa" && kitDoMes) {
    const r = await supabase
      .from("kit_itens")
      .select("posicao, grupo, tamanho_atual, camisas!kit_itens_camisa_id_fkey(tipo, categoria, temporada, equipes(nome))")
      .eq("competencia", atual)
      .eq("estado", "atual")
      .order("posicao");
    if (r.error) throw r.error;
    itens = r.data;
  }
  const nomes = Object.fromEntries(equipes.data.map((e) => [e.id, e.nome]));
  return { perfil, assinatura: assinatura.data, kits: kits.data, kitDoMes, itens, troca: trocas.data[0] || null, nomes, atual };
}

// ---------- Textos de composição ----------
function composicaoMensal(plano) {
  if (plano.qtd_especiais > 0) return [`${plano.qtd_comuns} comuns + ${plano.qtd_especiais} especial/mês.`, "Brinde previsto no kit."];
  const camisas = plano.qtd_comuns === 1 ? "1 camisa comum/mês." : `${plano.qtd_comuns} camisas comuns/mês.`;
  return plano.possui_brinde ? [camisas, "Brinde previsto no kit."] : [camisas];
}
function composicaoDoKit(kit, comBrindeCurto = false) {
  const partes = [];
  partes.push(kit.qtd_comuns_prevista === 1 ? "1 camisa comum" : `${kit.qtd_comuns_prevista} camisas comuns`);
  if (kit.qtd_especiais_prevista) partes.push(`${kit.qtd_especiais_prevista} especial`);
  if (comBrindeCurto) return partes.join(" + ") + (kit.brinde_previsto ? " + brinde" : "");
  return partes.join(" + ") + "." + (kit.brinde_previsto ? " Brinde previsto no kit." : "");
}
function linhas(elemento, textos) {
  elemento.replaceChildren(...textos.flatMap((t, i) => (i ? [el("br"), t] : [t])));
}

// ---------- Ilustração provisória da camisa ----------
function ilustracaoCamisa() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 80 64");
  svg.setAttribute("width", "80");
  svg.setAttribute("height", "64");
  svg.setAttribute("aria-hidden", "true");
  const caminho = document.createElementNS(ns, "path");
  caminho.setAttribute("d", "M27 2 L14 6 L1 18 L10 30 L18 24 L18 62 L62 62 L62 24 L70 30 L79 18 L66 6 L53 2 C50 8 46 10 40 10 C34 10 30 8 27 2 Z");
  caminho.setAttribute("fill", "currentColor");
  svg.append(caminho);
  return svg;
}

// ---------- Renderização ----------
function renderizar(d) {
  const { perfil, assinatura, kits, kitDoMes, itens, troca, nomes } = d;
  const completo = perfilCompleto(perfil);
  const status = assinatura?.status || null;
  const plano = assinatura?.planos || null;
  mostrarNome(perfil?.nome);

  titulo.textContent = "Seu painel";
  if (status === "ativa") subtitulo.textContent = "Acompanhe sua assinatura, seus kits e suas trocas.";
  else if (status === "cancelada") subtitulo.textContent = "Consulte seu histórico e gerencie a assinatura cancelada.";
  else if (!completo) subtitulo.textContent = "Complete seu perfil antes de confirmar uma assinatura.";
  else subtitulo.textContent = "Seu perfil está pronto. Escolha um plano para começar sua coleção.";

  // Indicador: assinatura
  const acaoAssinatura = ind("assinatura-acao");
  if (status) {
    ind("assinatura-chip").replaceChildren(status === "ativa" ? chip("Ativa", "sucesso", "✓") : chip("Cancelada", "erro", "×"));
    ind("assinatura-valor").textContent = plano.nome;
    linhas(ind("assinatura-texto"), status === "ativa" ? composicaoMensal(plano) : ["Novos kits ficam indisponíveis.", "Histórico e ciclo preservados."]);
    acaoAssinatura.textContent = "Gerenciar assinatura";
    acaoAssinatura.href = TELAS.C04;
  } else {
    ind("assinatura-chip").replaceChildren(chip("Sem plano", "neutro", "–"));
    ind("assinatura-valor").textContent = "Sem plano";
    ind("assinatura-texto").textContent = "Escolha um plano para começar sua coleção.";
    acaoAssinatura.textContent = completo ? "Escolher plano" : "Completar perfil";
    acaoAssinatura.href = completo ? TELAS.C03 : TELAS.C02;
  }

  // Indicador: kits montados
  ind("kits-valor").textContent = String(kits.length);
  if (kits.length) ind("kits-texto").textContent = `Último kit: ${competenciaExtenso(kits[0].competencia)}`;
  else if (status === "ativa") ind("kits-texto").textContent = "Seu primeiro kit aguarda montagem.";
  else if (status === "cancelada") ind("kits-texto").textContent = "Ainda não há kit registrado.";
  else ind("kits-texto").textContent = "Disponíveis após ativar a assinatura.";

  // Indicador: benefício de trocas (sem saldo nem datas de ciclo)
  if (status) {
    ind("trocas-valor").textContent = "Limite do plano";
    linhas(ind("trocas-texto"), ["Uso registrado no histórico.", "Consulte a elegibilidade antes de solicitar."]);
  } else {
    ind("trocas-valor").replaceChildren(el("span", { class: "traco", "aria-hidden": "true" }), el("span", { class: "visualmente-oculto" }, "Indisponível"));
    ind("trocas-texto").textContent = "O benefício estará disponível após ativar a assinatura.";
  }
  ["assinatura-acao", "kits-acao", "trocas-acao"].forEach((n) => (ind(n).hidden = false));

  renderizarDestaque(d, completo, status);
  renderizarAnteriores(status === "ativa" && kitDoMes ? kits.filter((k) => k !== kitDoMes) : kits);
  renderizarPreferencias(perfil, nomes);
  renderizarTroca(troca);
}

function cabecalhoCartao(texto, etiqueta) {
  return el("div", { class: "cartao__topo" }, el("h2", { class: "cartao__titulo", id: "titulo-destaque" }, texto), etiqueta);
}

function renderizarDestaque(d, completo, status) {
  const cartao = raiz.querySelector("[data-destaque]");
  const filhos = [];
  if (!status) {
    filhos.push(
      cabecalhoCartao("Comece sua coleção", chip("Sem assinatura", "neutro", "–")),
      el("p", { class: "cartao__texto" }, "Escolha um plano para começar sua coleção e acompanhar os kits pelo painel."),
      el("div", {}, completo
        ? el("a", { class: "botao botao--primaria", href: TELAS.C03 }, "Escolher meu plano")
        : el("a", { class: "botao botao--primaria", href: TELAS.C02 }, "Completar perfil")),
      el("p", { class: "cartao__aviso" }, "Sua conta está criada. A assinatura será ativada após a confirmação do plano."),
    );
  } else if (status === "cancelada") {
    filhos.push(
      cabecalhoCartao("Assinatura cancelada", chip("Cancelada", "erro", "×")),
      el("p", { class: "cartao__texto" }, "Você pode consultar os kits anteriores. Reative a assinatura para permitir a montagem de novos kits."),
      el("div", {}, el("a", { class: "botao botao--escura", href: TELAS.C04 }, "Gerenciar assinatura")),
      el("p", { class: "cartao__aviso" }, "Reativar não reinicia o histórico nem as trocas utilizadas neste ciclo."),
    );
  } else if (d.kitDoMes) {
    const grade = el("div", { class: "camisas" });
    for (const item of d.itens) {
      const c = item.camisas;
      const especial = item.grupo === "especial";
      grade.append(el("article", { class: "camisa" },
        el("div", { class: "camisa__imagem" }, ilustracaoCamisa(), especial ? el("span", { class: "selo-especial" }, "Especial") : null),
        el("div", { class: "camisa__dados" },
          el("h3", { class: "camisa__equipe" }, c.equipes.nome),
          el("p", {}, `${c.temporada} • ${c.categoria}`),
          el("p", {}, `${TIPOS[c.tipo] || c.tipo} • ${item.tamanho_atual}`))));
    }
    filhos.push(
      cabecalhoCartao(`Seu kit de ${nomeDoMes(d.kitDoMes.competencia)}`, chip("Montado", "sucesso", "✓")),
      el("p", { class: "cartao__texto" }, composicaoDoKit(d.kitDoMes)),
      grade,
      el("a", { class: "link", href: `${TELAS.C06}?competencia=${d.kitDoMes.competencia}` }, "Ver detalhes do kit"),
    );
  } else if (!d.kits.length) {
    filhos.push(
      cabecalhoCartao("Seu primeiro kit", chip("Aguardando montagem", "aviso", "…")),
      el("p", { class: "cartao__texto" }, "Seu primeiro kit ainda não foi montado. Quando estiver pronto, os detalhes aparecerão aqui."),
      el("a", { class: "link", href: TELAS.C04 }, "Ver minha assinatura"),
    );
  } else {
    filhos.push(
      cabecalhoCartao(`Seu kit de ${nomeDoMes(d.atual)}`, chip("Aguardando montagem", "aviso", "…")),
      el("p", { class: "cartao__texto" }, "Ainda não há um kit registrado para este mês."),
      el("a", { class: "link", href: TELAS.C05 }, "Ver kits e histórico"),
    );
  }
  cartao.replaceChildren(...filhos);
}

function renderizarAnteriores(lista) {
  const cartao = raiz.querySelector("[data-anteriores]");
  const filhos = [el("h2", { class: "cartao__titulo", id: "titulo-anteriores" }, "Kits anteriores")];
  if (!lista.length) {
    filhos.push(el("p", { class: "cartao__texto" }, "Os kits montados aparecerão aqui."));
  } else {
    const ul = el("ul", { class: "linhas-kit" });
    for (const kit of lista.slice(0, 3)) {
      ul.append(el("li", { class: "linha-kit" },
        el("span", { class: "linha-kit__mes" }, competenciaExtenso(kit.competencia)),
        el("span", { class: "linha-kit__composicao" }, composicaoDoKit(kit, true)),
        chip("Montado", "sucesso", "✓")));
    }
    filhos.push(ul, el("a", { class: "link", href: TELAS.C05 }, "Ver histórico completo"));
  }
  cartao.replaceChildren(...filhos);
}

function renderizarPreferencias(perfil, nomes) {
  const valor = (texto) => texto || "Não informado";
  raiz.querySelector('[data-pref="tamanho"]').textContent = valor(perfil?.tamanho);
  raiz.querySelector('[data-pref="favorita"]').textContent = valor(nomes[perfil?.equipe_preferida_id]);
  raiz.querySelector('[data-pref="rival"]').textContent = valor(nomes[perfil?.rival_id]);
  raiz.querySelector('[data-pref="nota"]').textContent = "A favorita orienta a curadoria, sem garantir recebimento. O rival fica excluído.";
  raiz.querySelector('[data-pref="acao"]').hidden = false;
}

function renderizarTroca(troca) {
  const cartao = raiz.querySelector("[data-trocas]");
  const filhos = [el("h2", { class: "cartao__titulo", id: "titulo-trocas" }, "Trocas recentes")];
  if (!troca) {
    filhos.push(el("p", { class: "cartao__texto" }, "Você ainda não possui solicitações de troca."));
  } else {
    const camisa = troca.item?.camisas;
    const [rotulo, familia, simbolo] = ESTADOS_TROCA[troca.estado];
    const quando = troca.estado === "concluida" ? `Concluída em ${dataCurta(troca.concluida_em)}` : `Solicitada em ${dataCurta(troca.solicitada_em)}`;
    filhos.push(el("div", { class: "troca-recente" },
      el("h3", { class: "troca-recente__titulo" }, MODALIDADES[troca.modalidade]),
      camisa ? el("p", {}, `${camisa.equipes.nome} • ${camisa.temporada} • ${camisa.categoria}`) : null,
      el("p", {}, quando),
      el("div", {}, chip(rotulo, familia, simbolo))));
    filhos.push(el("a", { class: "link", href: TELAS.C08 }, "Ver minhas trocas"));
  }
  cartao.replaceChildren(...filhos);
}

// ---------- Ciclo da tela ----------
let carregando = false;
async function iniciar() {
  if (carregando) return;
  carregando = true;
  raiz.setAttribute("aria-busy", "true");
  try {
    const dados = await carregar();
    falha.hidden = true;
    conteudo.hidden = false;
    renderizar(dados);
  } catch (erro) {
    console.error(erro);
    titulo.textContent = "Meu painel";
    subtitulo.textContent = "Tente carregar as informações novamente.";
    conteudo.hidden = true;
    falha.hidden = false;
    falha.querySelector("[data-tentar]").focus();
  } finally {
    raiz.setAttribute("aria-busy", "false");
    carregando = false;
  }
}

falha.querySelector("[data-tentar]").addEventListener("click", async (e) => {
  const botao = e.currentTarget;
  botao.disabled = true;
  await iniciar();
  botao.disabled = false;
});

(async () => {
  if (!supabase) return;
  if (!(await exigirSessao())) return;
  await iniciar();
})();
