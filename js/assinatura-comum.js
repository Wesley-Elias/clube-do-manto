// Peças compartilhadas pela C03 (confirmação e reativação) e pela C04 (minha assinatura).
// Sem saldo de trocas e sem datas de ciclo na interface (decisão de 05/10/2026).
import { supabase } from "./supabase.js";
import { PLANOS, deLinha, slugDoNome, formatarValor, composicaoCurta, textoTrocas } from "./planos.js";
import { TELAS } from "./sessao.js";
import { el, chip } from "./cliente.js";

// Planos da tabela, por slug (torcedor, fanatico, colecionador), com ativo/indisponível.
export async function carregarPlanos() {
  const { data, error } = await supabase
    .from("planos")
    .select("nome, qtd_comuns, qtd_especiais, trocas_anuais, possui_brinde, valor_mensal, ativo")
    .order("valor_mensal");
  if (error) throw error;
  const porSlug = {};
  for (const linha of data) {
    const slug = slugDoNome(linha.nome);
    if (PLANOS[slug]) porSlug[slug] = deLinha(linha);
  }
  return porSlug;
}

export async function carregarAssinatura() {
  const { data, error } = await supabase
    .from("assinaturas")
    .select("status, ativada_em, cancelada_em, inicio_beneficios_em, planos(nome, qtd_comuns, qtd_especiais, trocas_anuais, possui_brinde, valor_mensal, ativo)")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, slug: slugDoNome(data.planos.nome), plano: deLinha(data.planos) };
}

export async function nomesDasEquipes(perfil) {
  const ids = [perfil?.equipe_preferida_id, perfil?.rival_id].filter(Boolean);
  if (!ids.length) return {};
  const { data, error } = await supabase.from("equipes").select("id, nome").in("id", ids);
  if (error) throw error;
  return Object.fromEntries(data.map((e) => [e.id, e.nome]));
}

// "2 camisas comuns por mês" / "2 camisas comuns + 1 especial por mês"
export function composicaoMensal(p) {
  const comuns = p.comuns === 1 ? "1 camisa comum" : `${p.comuns} camisas comuns`;
  return p.especiais ? `${comuns} + ${p.especiais} especial por mês` : `${comuns} por mês`;
}

// ---------- Resumo do plano (cartão escuro) ----------
export function resumoPlano(p, { chamada = "Plano selecionado", alterar = null } = {}) {
  const lista = el("ul", { class: "resumo-plano__lista" },
    el("li", {}, textoTrocas(p)),
    el("li", {}, "Garantia anti-repetição"),
    el("li", {}, "Bloqueio do time rival"),
    el("li", {}, "Sem fidelidade"));
  const bloco = el("div", { class: "resumo-plano" },
    el("p", { class: "chamada chamada--no-escuro" }, chamada),
    el("p", { class: "resumo-plano__nome" }, p.nome),
    el("p", { class: "resumo-plano__preco" },
      el("span", { class: "resumo-plano__valor" }, `R$ ${formatarValor(p.valor)}`),
      el("span", { class: "resumo-plano__periodo" }, "/ mês")),
    el("p", { class: "resumo-plano__composicao" }, composicaoCurta(p).replace("+ brinde", "+ brinde previsto")),
    el("hr", { class: "resumo-plano__picote" }),
    lista,
    el("hr", { class: "resumo-plano__picote" }));
  if (alterar) bloco.append(alterar);
  return bloco;
}

// ---------- Preferências usadas na assinatura ----------
export function caixaPreferencias(perfil, nomes, { editarHref, titulo = "Suas preferências", grande = false } = {}) {
  const valor = (t) => t || "Não informado";
  const linhas = el("dl", { class: "dados" },
    el("div", {}, el("dt", {}, "Tamanho da camisa"), el("dd", {}, valor(perfil?.tamanho))),
    el("div", {}, el("dt", {}, "Equipe favorita"), el("dd", {}, valor(nomes[perfil?.equipe_preferida_id]))),
    el("div", {}, el("dt", {}, "Equipe rival"), el("dd", {}, valor(nomes[perfil?.rival_id]))));
  const cabecalho = el("div", { class: "dados-caixa__topo" },
    grande ? el("h2", { class: "cartao__titulo" }, titulo) : el("h2", { class: "dados-caixa__titulo" }, titulo),
    editarHref ? el("a", { class: "link", href: editarHref }, "Editar preferências") : null);
  return el("section", { class: grande ? "cartao" : "dados-caixa", "aria-label": titulo }, cabecalho, linhas);
}

// ---------- Cartão branco do plano (C04 e revisão da reativação) ----------
export function cartaoPlanoAtual(p, { chamada, chipEstado, inicio = null, rodape = "Composição aplicada aos próximos kits elegíveis." }) {
  const especial = p.especiais ? " e especiais retrô/históricas" : "";
  return el("section", { class: "cartao plano-atual", "aria-labelledby": "titulo-plano-atual" },
    el("div", { class: "cartao__topo" }, el("p", { class: "chamada" }, chamada), chipEstado),
    el("h2", { class: "plano-atual__titulo", id: "titulo-plano-atual" },
      el("span", { class: "plano-atual__nome" }, p.nome),
      el("span", { class: "plano-atual__preco" }, `R$ ${formatarValor(p.valor)}`),
      el("span", { class: "plano-atual__periodo" }, "/ mês")),
    el("div", { class: "plano-atual__composicao" },
      el("p", { class: "plano-atual__comp-titulo" }, composicaoMensal(p)),
      el("p", {}, p.brinde ? "Brinde previsto no kit." : "Sem brinde neste plano.")),
    el("ul", { class: "lista-check lista-check--compacta" },
      el("li", {}, `${textoTrocas(p)} de assinatura.`),
      el("li", {}, `As camisas comuns podem ser de clubes internacionais ou seleções${especial}.`),
      el("li", {}, "Bloqueio da equipe rival · Não repetição de modelos")),
    el("div", { class: "plano-atual__nota" },
      el("p", {}, inicio ? `Assinante desde ${inicio}. Histórico de ativação preservado.` : "Histórico de ativação preservado."),
      el("p", {}, rodape)));
}

// ---------- Coluna de benefício de trocas (C04 e reativação) ----------
export function colunaBeneficio() {
  return [
    el("section", { class: "indicador", "aria-labelledby": "titulo-beneficio" },
      el("h2", { class: "chamada", id: "titulo-beneficio" }, "Benefício de trocas"),
      el("p", { class: "indicador__valor" }, "Limite do plano"),
      el("p", { class: "indicador__texto" }, "Uso registrado no histórico.", el("br"), "Consulte a elegibilidade antes de solicitar."),
      el("a", { class: "indicador__acao", href: TELAS.C08 }, "Ver minhas trocas")),
    el("section", { class: "cartao cartao--ciclo", "aria-labelledby": "titulo-ciclo" },
      el("p", { class: "cartao--ciclo__chamada" }, "Seu ciclo de trocas"),
      el("h2", { class: "cartao__titulo", id: "titulo-ciclo" }, "12 meses de assinatura"),
      el("p", { class: "cartao__texto" }, "O limite do plano é válido por um ciclo de 12 meses de assinatura."),
      el("p", { class: "cartao__texto" }, "Cancelar ou reativar preserva o histórico de utilização das trocas.")),
  ];
}

export function chipSituacao(status) {
  return status === "ativa" ? chip("Ativa", "sucesso", "✓") : chip("Cancelada", "erro", "×");
}

// Alerta montado por script (erro, aviso, sucesso ou informação)
export function alerta(tipo, titulo, texto, { foco = false } = {}) {
  const icones = { erro: "!", aviso: "!", sucesso: "✓", info: "i" };
  const classe = { erro: "alerta", aviso: "alerta alerta--aviso", sucesso: "alerta alerta--sucesso", info: "alerta alerta--info" }[tipo];
  return el("div", { class: classe, role: tipo === "erro" ? "alert" : "status", tabindex: foco ? "-1" : null },
    el("span", { class: "alerta__icone", "aria-hidden": "true" }, icones[tipo]),
    el("div", {}, el("p", { class: "alerta__titulo" }, titulo), texto ? el("p", { class: "alerta__texto" }, texto) : null));
}

// Mensagem fixa vinda das funções do banco (RAISE EXCEPTION '<codigo>')
export function codigoDoErro(erro) {
  return /^[a-z_]+$/.test(erro?.message || "") ? erro.message : null;
}
