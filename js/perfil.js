// C02 — Preferências (primeiro preenchimento ou com plano escolhido) e Meu perfil.
// Salvar o perfil não ativa assinatura. Com plano, segue para a C03; sem plano, para o painel.
// As alterações valem para operações futuras: kits já registrados mantêm seus dados.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { lerContexto, comContexto, propagarContexto } from "./contexto.js";
import { preencherResumo } from "./planos.js";
import { TELAS } from "./sessao.js";
import { exigirSessao, montarCabecalho, mostrarNome, perfilCompleto, carregarPerfil } from "./cliente.js";
import { criarBuscaEquipe } from "./busca-equipe.js";
import { marcarErro, limparErros, processando, mostrarAlerta } from "./formulario.js";

avisarSemConfiguracao();
montarCabecalho("C02");

const contexto = lerContexto();
propagarContexto(contexto);

const raiz = document.querySelector("[data-perfil]");
const carregando = raiz.querySelector("[data-carregando]");
const falhaCarga = raiz.querySelector("[data-falha-carga]");
const etapaForm = raiz.querySelector('[data-etapa="formulario"]');
const etapaSalvo = raiz.querySelector('[data-etapa="salvo"]');
const form = raiz.querySelector("form");
const botao = form.querySelector("[data-enviar]");
const sucesso = form.querySelector("[data-sucesso]");
const nota = form.querySelector("[data-nota]");
const { nome, tamanho } = form.elements;

let modo = "meu-perfil"; // "preferencias" (primeiro preenchimento ou com plano) | "meu-perfil"
let alerta = null;
let favorita = null;
let rival = null;

const mostrar = (seletor, visivel = true) => document.querySelectorAll(seletor).forEach((el) => (el.hidden = !visivel));

// ---------- Carga ----------
async function carregar() {
  const [perfil, equipes, tamanhos] = await Promise.all([
    carregarPerfil(),
    supabase.from("equipes").select("id, nome, natureza").eq("ativo", true).order("nome"),
    supabase.rpc("tamanhos_do_catalogo"),
  ]);
  if (equipes.error) throw equipes.error;
  if (tamanhos.error) throw tamanhos.error;
  if (!perfil) throw new Error("Perfil não encontrado");
  return { perfil, equipes: equipes.data, tamanhos: tamanhos.data };
}

function prepararTela({ perfil, equipes, tamanhos }, email) {
  const completo = perfilCompleto(perfil);
  modo = contexto.plano || !completo ? "preferencias" : "meu-perfil";
  mostrarNome(perfil.nome);

  // Tamanhos oferecidos (lista oficial pendente no Guia §9; o banco decide a lista)
  for (const t of tamanhos) {
    const opcao = document.createElement("option");
    opcao.value = t;
    opcao.textContent = t;
    tamanho.append(opcao);
  }
  if (perfil.tamanho && !tamanhos.includes(perfil.tamanho)) {
    tamanho.append(new Option(perfil.tamanho, perfil.tamanho));
  }
  tamanho.value = perfil.tamanho || "";

  favorita = criarBuscaEquipe(form.querySelector('[data-busca="favorita"]'), equipes);
  rival = criarBuscaEquipe(form.querySelector('[data-busca="rival"]'), equipes);
  favorita.definir(perfil.equipe_preferida_id);
  rival.definir(perfil.rival_id);

  const secao = raiz.querySelector("section.cartao-form");
  if (modo === "preferencias") {
    raiz.classList.add("area-cliente--sem-faixa");
    mostrar("[data-onboarding]");
    alerta = form.querySelector("[data-alerta-topo]");
    if (contexto.plano) {
      mostrar("[data-com-plano]");
      mostrar('[data-apoio="com-plano"]');
      preencherResumo(document.querySelector("[data-resumo-plano]"), contexto.plano);
      botao.textContent = completo ? "Salvar e revisar assinatura" : "Salvar e continuar";
      nota.textContent = "Na próxima etapa, você revisa o plano e as preferências antes de confirmar a assinatura.";
    } else {
      mostrar('[data-apoio="sem-plano"]');
      botao.textContent = "Salvar e continuar";
      nota.textContent = "Depois, você acessa seu painel. Uma assinatura pode ser contratada quando quiser.";
    }
    document.title = "Defina suas preferências · Clube do Manto";
  } else {
    mostrar("[data-meu-perfil]");
    mostrar('[data-apoio="meu-perfil"]');
    alerta = form.querySelector("[data-alerta-base]");
    secao.setAttribute("aria-label", "Dados do perfil");
    secao.removeAttribute("aria-labelledby");
    nome.value = perfil.nome || "";
    raiz.querySelector("[data-email]").textContent = email;
    botao.textContent = "Salvar alterações";
    nota.textContent = "As alterações orientam operações futuras. Kits já registrados mantêm seus dados.";
  }
  carregando.hidden = true;
  etapaForm.hidden = false;
}

// ---------- Validação ----------
function validar() {
  const erros = [];
  const preferencias = modo === "preferencias";
  if (!preferencias && !nome.value.trim()) erros.push([nome, "Campo obrigatório."]);
  if (!tamanho.value) erros.push([tamanho, preferencias ? "Selecione um tamanho." : "Tamanho da camisa obrigatório."]);
  if (!favorita.valor) erros.push([favorita.entrada, preferencias ? "Selecione sua equipe favorita." : "Equipe favorita obrigatória."]);
  const iguais = favorita.valor && rival.valor && favorita.valor === rival.valor;
  if (!rival.valor) erros.push([rival.entrada, preferencias ? "Selecione uma equipe rival." : "Equipe rival obrigatória e diferente da favorita."]);
  else if (iguais) erros.push([rival.entrada, preferencias ? "Escolha uma equipe diferente da favorita." : "Equipe rival obrigatória e diferente da favorita."]);
  return { erros, faltando: erros.length > (iguais ? 1 : 0), iguais };
}

function mostrarErros({ erros, faltando, iguais }) {
  erros.forEach(([campo, mensagem]) => marcarErro(campo, mensagem));
  if (modo === "preferencias") {
    if (faltando) mostrarAlerta(alerta, "Complete suas preferências", "Selecione seu tamanho, uma equipe favorita e uma rival.");
    else mostrarAlerta(alerta, "A favorita e a rival precisam ser diferentes", "Escolha outra equipe rival para continuar.");
  } else {
    mostrarAlerta(alerta, "Preencha nome, tamanho e as duas equipes.", "A favorita deve ser diferente da rival.");
  }
  erros[0][0].focus();
}

// Erros vindos do banco (salvar_perfil) viram mensagens junto ao campo.
const ERROS_DO_BANCO = {
  equipes_iguais: () => mostrarErros({ erros: [[rival.entrada, modo === "preferencias" ? "Escolha uma equipe diferente da favorita." : "Equipe rival obrigatória e diferente da favorita."]], faltando: false, iguais: true }),
  tamanho_invalido: () => mostrarErros({ erros: [[tamanho, "Escolha um tamanho disponível no catálogo."]], faltando: true }),
  favorita_invalida: () => mostrarErros({ erros: [[favorita.entrada, "Selecione sua equipe favorita."]], faltando: true }),
  rival_invalida: () => mostrarErros({ erros: [[rival.entrada, "Selecione uma equipe rival."]], faltando: true }),
  nome_obrigatorio: () => mostrarErros({ erros: [[nome, "Campo obrigatório."]], faltando: true }),
};

function limparMensagens() {
  limparErros(form);
  alerta.hidden = true;
  sucesso.hidden = true;
}

// ---------- Envio ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (botao.disabled) return;
  limparMensagens();

  const validacao = validar();
  if (validacao.erros.length) return mostrarErros(validacao);

  processando(botao, true, "Salvando…");
  try {
    const parametros = {
      p_tamanho: tamanho.value,
      p_equipe_preferida_id: favorita.valor,
      p_rival_id: rival.valor,
    };
    if (modo === "meu-perfil") parametros.p_nome = nome.value.trim();
    const { data, error } = await supabase.rpc("salvar_perfil", parametros);
    if (error) throw error;
    processando(botao, false);
    concluir(data);
  } catch (erro) {
    console.error(erro);
    processando(botao, false);
    const tratar = ERROS_DO_BANCO[erro?.message];
    if (tratar) return tratar();
    if (modo === "preferencias") {
      mostrarAlerta(alerta, "Não foi possível salvar suas preferências", "Suas escolhas foram mantidas. Tente novamente em alguns instantes.");
    } else {
      mostrarAlerta(alerta, "Não foi possível salvar.", "Confira os campos e use equipes diferentes para favorita e rival. Seus dados foram mantidos.");
    }
    botao.textContent = "Tentar novamente";
    botao.dataset.rotulo = "Tentar novamente";
  }
});

function concluir(perfil) {
  if (modo === "meu-perfil") {
    nome.value = perfil.nome;
    mostrarNome(perfil.nome);
    botao.textContent = "Salvar alterações";
    botao.dataset.rotulo = "Salvar alterações";
    sucesso.hidden = false;
    sucesso.focus();
    return;
  }
  raiz.querySelector('[data-salvo="tamanho"]').textContent = perfil.tamanho;
  raiz.querySelector('[data-salvo="favorita"]').textContent = favorita.nome;
  raiz.querySelector('[data-salvo="rival"]').textContent = rival.nome;
  const continuar = raiz.querySelector("[data-continuar]");
  if (contexto.plano) {
    continuar.textContent = "Continuar para confirmação";
    continuar.href = comContexto(TELAS.C03, { plano: contexto.plano, destino: null });
    raiz.querySelector("[data-nota-salvo]").textContent = "Seu perfil foi salvo. Continue para revisar e confirmar o plano escolhido.";
  } else {
    continuar.href = TELAS.C01;
  }
  // Etapa 2 concluída
  const etapa = document.querySelector("[data-etapa-preferencias]");
  etapa.classList.replace("etapa-fluxo--atual", "etapa-fluxo--concluida");
  etapa.removeAttribute("aria-current");
  etapa.querySelector("[data-etapa-numero]").textContent = "✓";
  etapa.querySelector("[data-etapa-numero]").setAttribute("aria-hidden", "true");
  etapa.querySelector("[data-etapa-sub]").textContent = "Preferências salvas";
  if (contexto.plano) {
    const terceira = etapa.parentElement.querySelector("li.etapa-fluxo[data-com-plano]");
    terceira.classList.add("etapa-fluxo--atual");
    terceira.setAttribute("aria-current", "step");
  }

  etapaForm.hidden = true;
  etapaSalvo.hidden = false;
  raiz.querySelector("section.cartao-form").setAttribute("aria-labelledby", "titulo-salvo");
  raiz.querySelector("#titulo-salvo").focus();
}

// ---------- Início ----------
async function iniciar(sessao) {
  carregando.hidden = false;
  falhaCarga.hidden = true;
  try {
    prepararTela(await carregar(), sessao.user.email);
  } catch (erro) {
    console.error(erro);
    carregando.hidden = true;
    falhaCarga.hidden = false;
  }
}

raiz.querySelector("[data-recarregar]").addEventListener("click", () => location.reload());

(async () => {
  if (!supabase) return;
  const sessao = await exigirSessao(contexto);
  if (sessao) await iniciar(sessao);
})();
