// Utilidades de formulário: validação junto ao campo, mostrar senha e envio único.

export function marcarErro(campo, mensagem) {
  const bloco = campo.closest(".campo");
  const erro = bloco.querySelector(".campo__erro");
  bloco.classList.add("campo--erro");
  erro.textContent = mensagem;
  campo.setAttribute("aria-invalid", "true");
  const descritores = new Set((campo.getAttribute("aria-describedby") || "").split(" ").filter(Boolean));
  descritores.add(erro.id);
  campo.setAttribute("aria-describedby", [...descritores].join(" "));
}

export function limparErros(form) {
  form.querySelectorAll(".campo--erro").forEach((bloco) => {
    bloco.classList.remove("campo--erro");
    const campo = bloco.querySelector("input, select, textarea");
    campo.removeAttribute("aria-invalid");
  });
}

export function emailValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim());
}

export function ativarMostrarSenha(raiz = document) {
  raiz.querySelectorAll(".campo__mostrar").forEach((botao) => {
    botao.addEventListener("click", () => {
      const campo = botao.closest(".campo__caixa").querySelector("input");
      const mostrando = campo.type === "text";
      campo.type = mostrando ? "password" : "text";
      botao.textContent = mostrando ? "Mostrar" : "Ocultar";
      botao.setAttribute("aria-pressed", String(!mostrando));
    });
  });
}

// Coloca o botão em processamento: impede cliques duplicados e anuncia o estado.
export function processando(botao, ativo, rotuloProcessando) {
  if (ativo) {
    botao.dataset.rotulo = botao.textContent.trim();
    botao.disabled = true;
    botao.setAttribute("aria-busy", "true");
    botao.innerHTML = `<span class="botao__giro" aria-hidden="true"></span>${rotuloProcessando}`;
  } else {
    botao.disabled = false;
    botao.removeAttribute("aria-busy");
    botao.textContent = botao.dataset.rotulo || botao.textContent;
  }
}

export function mostrarAlerta(alerta, titulo, texto) {
  alerta.querySelector(".alerta__titulo").textContent = titulo;
  alerta.querySelector(".alerta__texto").textContent = texto;
  alerta.hidden = false;
  alerta.focus();
}

// Falhas de rede (fetch rejeitado ou status 0/5xx) são distintas de credenciais erradas.
export function ehFalhaDeComunicacao(erro) {
  if (!erro) return false;
  const status = erro.status ?? 0;
  return erro.name === "AuthRetryableFetchError" || status === 0 || status >= 500 || /fetch|network/i.test(erro.message || "");
}
