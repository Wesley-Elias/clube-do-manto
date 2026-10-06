// P03 — Nova senha a partir do link de recuperação.
// Salvar a senha não autentica: a sessão temporária do link é encerrada e a pessoa volta ao login.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { lerContexto, propagarContexto } from "./contexto.js";
import { marcarErro, limparErros, ativarMostrarSenha, processando, mostrarAlerta, ehFalhaDeComunicacao } from "./formulario.js";

avisarSemConfiguracao();

const contexto = lerContexto();
propagarContexto(contexto);
ativarMostrarSenha();

const cartao = document.querySelector(".cartao-form");
const form = document.querySelector("form");
const alerta = form.querySelector("[data-alerta]");
const botao = form.querySelector("[data-enviar]");
const { senha, confirmacao } = form.elements;

function mostrarEtapa(nome) {
  cartao.setAttribute("aria-busy", "false");
  document.querySelectorAll("[data-etapa]").forEach((el) => (el.hidden = el.dataset.etapa !== nome));
  document.querySelector(`[data-etapa="${nome}"] h1`)?.focus();
}

// Erros do link chegam na query (PKCE) ou no fragmento (#error_code=otp_expired).
function erroDoLink() {
  const params = new URLSearchParams(location.search);
  const fragmento = new URLSearchParams(location.hash.slice(1));
  return params.get("error_code") || fragmento.get("error_code") || params.get("error") || fragmento.get("error");
}

async function validarLink() {
  const erro = erroDoLink();
  if (erro) return mostrarEtapa(/expired/.test(erro) ? "expirado" : "invalido");
  if (!supabase) return mostrarEtapa("invalido");
  // getSession aguarda a troca do código do link pela sessão de recuperação.
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error(error);
    return mostrarEtapa(/expired/i.test(error.message || "") ? "expirado" : "invalido");
  }
  mostrarEtapa(data.session ? "nova-senha" : "invalido");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (botao.disabled) return;
  limparErros(form);
  alerta.hidden = true;
  if (!senha.value || senha.value !== confirmacao.value) {
    marcarErro(senha, "As senhas são obrigatórias e devem ser iguais.");
    marcarErro(confirmacao, "As senhas são obrigatórias e devem ser iguais.");
    mostrarAlerta(alerta, "Confira as senhas", "Preencha os dois campos com a mesma senha para continuar.");
    senha.focus();
    return;
  }
  if (senha.value.length < 6) {
    marcarErro(senha, "Use uma senha com pelo menos 6 caracteres.");
    mostrarAlerta(alerta, "Confira as senhas", "Preencha os dois campos com a mesma senha para continuar.");
    senha.focus();
    return;
  }
  processando(botao, true, "Salvando…");
  try {
    const { error } = await supabase.auth.updateUser({ password: senha.value });
    if (error) throw error;
    await supabase.auth.signOut({ scope: "local" });
    mostrarEtapa("alterada");
  } catch (erro) {
    console.error(erro);
    processando(botao, false);
    if (erro.code === "same_password") {
      marcarErro(senha, "Escolha uma senha diferente da anterior.");
      mostrarAlerta(alerta, "Confira as senhas", "Preencha os dois campos com a mesma senha para continuar.");
      senha.focus();
    } else if (erro.code === "weak_password") {
      marcarErro(senha, "Escolha uma senha mais forte.");
      mostrarAlerta(alerta, "Confira as senhas", "Preencha os dois campos com a mesma senha para continuar.");
      senha.focus();
    } else if (!ehFalhaDeComunicacao(erro) && /session/i.test(erro.message || "")) {
      mostrarEtapa("expirado");
    } else {
      mostrarAlerta(alerta, "Não foi possível salvar", "Ocorreu uma falha de conexão. Os campos foram mantidos; tente novamente.");
    }
  }
});

validarLink();
