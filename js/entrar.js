// P03 — Login.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { lerContexto, propagarContexto } from "./contexto.js";
import { preencherResumo } from "./planos.js";
import { resolverDestino, sessaoAtual } from "./sessao.js";
import { marcarErro, limparErros, emailValido, ativarMostrarSenha, processando, mostrarAlerta, ehFalhaDeComunicacao } from "./formulario.js";

avisarSemConfiguracao();

const contexto = lerContexto();
propagarContexto(contexto);
ativarMostrarSenha();

if (contexto.plano) {
  document.querySelectorAll("[data-com-plano]").forEach((el) => (el.hidden = false));
  document.querySelectorAll("[data-sem-plano]").forEach((el) => (el.hidden = true));
  document.querySelector("[data-subtitulo]").textContent = "Entre para continuar com o plano escolhido.";
  preencherResumo(document.querySelector("[data-resumo-plano]"), contexto.plano);
}

const form = document.querySelector("form");
const alerta = form.querySelector("[data-alerta]");
const botao = form.querySelector("[data-enviar]");
const { email, senha } = form.elements;

// Quem já tem sessão (por exemplo, voltando da confirmação de e-mail) segue direto.
(async () => {
  try {
    if (await sessaoAtual()) location.replace(await resolverDestino(contexto));
  } catch (erro) {
    console.error(erro);
  }
})();

// Erros do link de confirmação chegam na URL.
const erroNaUrl = new URLSearchParams(location.hash.slice(1)).get("error_description");
if (erroNaUrl) {
  mostrarAlerta(alerta, "Não foi possível entrar", "O link de confirmação não pôde ser validado. Entre com seu e-mail e senha ou crie a conta novamente.");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (botao.disabled) return;
  limparErros(form);
  alerta.hidden = true;

  const erros = [];
  if (!emailValido(email.value)) erros.push([email, "Informe um e-mail válido."]);
  if (!senha.value) erros.push([senha, "Informe sua senha."]);
  if (erros.length) {
    erros.forEach(([campo, msg]) => marcarErro(campo, msg));
    mostrarAlerta(alerta, "Confira os campos informados", "Preencha seu e-mail e sua senha para continuar.");
    erros[0][0].focus();
    return;
  }

  processando(botao, true, "Entrando…");
  try {
    if (!supabase) throw new Error("Supabase não configurado");
    const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: senha.value });
    if (error) throw error;
    // O papel vem do banco (private.administradores), nunca de uma escolha na tela.
    location.assign(await resolverDestino(contexto));
  } catch (erro) {
    console.error(erro);
    processando(botao, false);
    if (erro.code === "invalid_credentials" || (!ehFalhaDeComunicacao(erro) && erro.status === 400 && !erro.code)) {
      mostrarAlerta(alerta, "E-mail ou senha incorretos", "Confira seus dados e tente novamente.");
    } else if (erro.code === "email_not_confirmed") {
      mostrarAlerta(alerta, "Confirmação de e-mail necessária", "Confirme seu e-mail antes de entrar para continuar o cadastro.");
    } else {
      mostrarAlerta(alerta, "Não foi possível entrar", "Verifique sua conexão ou tente novamente em alguns instantes.");
      botao.textContent = "Tentar novamente";
      botao.dataset.rotulo = "Tentar novamente";
    }
  }
});
