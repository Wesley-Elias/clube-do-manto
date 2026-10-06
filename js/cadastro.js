// P02 — Cadastro.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { lerContexto, comContexto, propagarContexto } from "./contexto.js";
import { preencherResumo } from "./planos.js";
import { marcarErro, limparErros, emailValido, ativarMostrarSenha, processando, mostrarAlerta, ehFalhaDeComunicacao } from "./formulario.js";

avisarSemConfiguracao();

const contexto = lerContexto();
propagarContexto(contexto);
ativarMostrarSenha();

// Com plano: etapas, faixa escura e Resumo do plano. Pelo menu: nenhum plano é assumido.
if (contexto.plano) {
  document.querySelectorAll("[data-com-plano]").forEach((el) => (el.hidden = false));
  document.querySelectorAll("[data-sem-plano]").forEach((el) => (el.hidden = true));
  document.querySelector("[data-subtitulo]").textContent = "Crie seu acesso e continue configurando a assinatura.";
  preencherResumo(document.querySelector("[data-resumo-plano]"), contexto.plano);
}

const form = document.querySelector("form");
const alerta = form.querySelector("[data-alerta]");
const botao = form.querySelector("[data-enviar]");
const campos = {
  nome: form.elements.nome,
  email: form.elements.email,
  senha: form.elements.senha,
  confirmacao: form.elements.confirmacao,
};

function validar() {
  const erros = [];
  if (!campos.nome.value.trim()) erros.push([campos.nome, "Informe seu nome."]);
  if (!emailValido(campos.email.value)) erros.push([campos.email, "Informe um e-mail válido."]);
  if (campos.senha.value.length < 6) erros.push([campos.senha, "Crie uma senha com pelo menos 6 caracteres."]);
  if (!campos.confirmacao.value || campos.confirmacao.value !== campos.senha.value) {
    erros.push([campos.confirmacao, "As senhas não coincidem."]);
  }
  erros.forEach(([campo, msg]) => marcarErro(campo, msg));
  return erros;
}

function mostrarEtapa(nome) {
  document.querySelectorAll("[data-etapa]").forEach((el) => (el.hidden = el.dataset.etapa !== nome));
  const titulo = document.querySelector(`[data-etapa="${nome}"] h1`);
  titulo?.focus();
  // A etapa 1 passa a concluída quando a conta existe.
  const primeira = document.querySelector(".etapa-fluxo--atual");
  if (nome !== "formulario" && primeira) {
    primeira.classList.replace("etapa-fluxo--atual", "etapa-fluxo--concluida");
    primeira.removeAttribute("aria-current");
    primeira.querySelector(".etapa-fluxo__sub").textContent = "Concluída";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (botao.disabled) return;
  limparErros(form);
  alerta.hidden = true;

  const erros = validar();
  if (erros.length) {
    mostrarAlerta(alerta, "Confira os campos destacados", "Corrija os dados indicados para continuar.");
    erros[0][0].focus();
    return;
  }

  processando(botao, true, "Criando conta…");
  try {
    if (!supabase) throw new Error("Supabase não configurado");
    const redirecionar = new URL(comContexto("entrar.html", contexto), location.href).href;
    const { data, error } = await supabase.auth.signUp({
      email: campos.email.value.trim(),
      password: campos.senha.value,
      options: { data: { nome: campos.nome.value.trim() }, emailRedirectTo: redirecionar },
    });
    if (error) throw error;
    // Com a confirmação de e-mail ligada, o Supabase não devolve erro para um
    // e-mail já cadastrado: responde com um usuário sem identidades.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw Object.assign(new Error("User already registered"), { code: "user_already_exists" });
    }
    // Sem sessão: o projeto exige confirmar o e-mail antes do primeiro acesso.
    mostrarEtapa(data.session ? "sucesso" : "confirmacao");
  } catch (erro) {
    console.error(erro);
    processando(botao, false);
    if (erro.code === "user_already_exists" || /already registered/i.test(erro.message || "")) {
      marcarErro(campos.email, "Já existe uma conta com este e-mail. Entre ou recupere sua senha.");
      mostrarAlerta(alerta, "Confira os campos destacados", "Corrija os dados indicados para continuar.");
    } else if (erro.code === "weak_password") {
      marcarErro(campos.senha, "Escolha uma senha mais forte.");
      mostrarAlerta(alerta, "Confira os campos destacados", "Corrija os dados indicados para continuar.");
    } else {
      // Falha de comunicação ou outra falha: os dados digitados são mantidos.
      mostrarAlerta(alerta, "Não foi possível criar sua conta", "Seus dados foram mantidos. Tente novamente em alguns instantes.");
      botao.textContent = "Tentar novamente";
      botao.dataset.rotulo = "Tentar novamente";
      if (!ehFalhaDeComunicacao(erro)) console.warn("Falha não relacionada à conexão:", erro.message);
    }
  }
});
