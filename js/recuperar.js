// P03 — Solicitação do link de recuperação.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { lerContexto, comContexto, propagarContexto } from "./contexto.js";
import { marcarErro, limparErros, emailValido, processando, mostrarAlerta, ehFalhaDeComunicacao } from "./formulario.js";

avisarSemConfiguracao();

const contexto = lerContexto();
propagarContexto(contexto);

const form = document.querySelector("form");
const alerta = form.querySelector("[data-alerta]");
const botao = form.querySelector("[data-enviar]");
const email = form.elements.email;
const botaoReenviar = document.querySelector("[data-reenviar]");
const alertaReenvio = document.querySelector("[data-alerta-reenvio]");

// O link volta para a página de nova senha levando a intenção de plano.
async function enviar() {
  if (!supabase) throw new Error("Supabase não configurado");
  const redirectTo = new URL(comContexto("redefinir-senha.html", contexto), location.href).href;
  const { error } = await supabase.auth.resetPasswordForEmail(email.value.trim(), { redirectTo });
  // Limite de envios não é revelado como "conta inexistente"; só falhas de comunicação viram erro.
  if (error && ehFalhaDeComunicacao(error)) throw error;
  if (error) console.warn(error);
}

function mostrarEnviado() {
  document.querySelector('[data-etapa="solicitacao"]').hidden = true;
  const etapa = document.querySelector('[data-etapa="enviado"]');
  etapa.hidden = false;
  etapa.querySelector("h1").focus();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (botao.disabled) return;
  limparErros(form);
  alerta.hidden = true;
  if (!emailValido(email.value)) {
    marcarErro(email, "E-mail obrigatório. Use o formato nome@exemplo.com.");
    mostrarAlerta(alerta, "Confira seu e-mail", "Informe um e-mail válido antes de continuar.");
    email.focus();
    return;
  }
  processando(botao, true, "Enviando…");
  try {
    await enviar();
    mostrarEnviado();
  } catch (erro) {
    console.error(erro);
    mostrarAlerta(alerta, "Não foi possível concluir", "Ocorreu uma falha de conexão. Seu e-mail foi mantido; tente novamente.");
  } finally {
    processando(botao, false);
  }
});

botaoReenviar.addEventListener("click", async () => {
  if (botaoReenviar.disabled) return;
  alertaReenvio.hidden = true;
  processando(botaoReenviar, true, "Reenviando…");
  try {
    await enviar();
  } catch (erro) {
    console.error(erro);
    mostrarAlerta(alertaReenvio, "Não foi possível concluir", "Ocorreu uma falha de conexão. Seu e-mail foi mantido; tente novamente.");
  } finally {
    processando(botaoReenviar, false);
  }
});
