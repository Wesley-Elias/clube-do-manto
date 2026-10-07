// A03 — Equipe: cadastro e edição.
// Campos: nome, país e natureza (Clube/Seleção); situação só na edição.
// A gravação passa por admin_salvar_equipe(), que recusa registro equivalente e
// impede mudanças que contornariam a identidade de equipes com camisas ou histórico.
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { el } from "./cliente.js";
import { marcarErro, limparErros, processando } from "./formulario.js";
import {
  montarCabecalhoAdmin, exigirAdministrador, mostrarFalhaGeral,
  PAISES, nomeDoPais, codigoDoErro, falhaIncerta,
} from "./admin.js";

avisarSemConfiguracao();
montarCabecalhoAdmin("A02");

const principal = document.querySelector("[data-tela]");
const params = new URLSearchParams(location.search);
let id = params.get("id");
const voltar = seguro(params.get("voltar")) || `${TELAS.A02}?aba=equipes`;
let equipe = null;
let uso = { tem_camisas: false, tem_historico: false };

// Só aceita retorno para o próprio catálogo
function seguro(endereco) {
  return endereco && /^catalogo\.html(\?[\w=&%.\-+]*)?$/.test(endereco) ? endereco : null;
}

async function carregar() {
  if (!id) return;
  const [r1, r2] = await Promise.all([
    supabase.from("equipes").select("id, nome, pais_codigo, natureza, ativo").eq("id", Number(id)).maybeSingle(),
    supabase.rpc("admin_uso_da_equipe", { p_equipe: Number(id) }),
  ]);
  if (r1.error || r2.error) throw r1.error || r2.error;
  equipe = r1.data;
  uso = (Array.isArray(r2.data) ? r2.data[0] : r2.data) || uso;
}

function campoErro(idCampo) {
  return el("p", { class: "campo__erro", id: `erro-${idCampo}` });
}

function grupoRadios(nome, legenda, opcoes, valor, bloqueado, ajuda) {
  return el("fieldset", { class: "campo campo--grupo", "aria-describedby": ajuda ? `ajuda-${nome}` : null },
    el("legend", { class: "campo__rotulo" }, legenda),
    el("div", { class: "radios" }, ...opcoes.map(([v, r]) =>
      el("label", { class: "radio" },
        el("input", { type: "radio", name: nome, value: v, checked: v === valor, disabled: bloqueado }),
        el("span", {}, r)))),
    ajuda ? el("p", { class: "campo__ajuda", id: `ajuda-${nome}` }, ajuda) : null,
    campoErro(nome));
}

function formulario() {
  const edicao = Boolean(equipe);
  const bloqueiaIdentidade = uso.tem_historico;
  const bloqueiaNatureza = uso.tem_camisas;
  const pais = equipe?.pais_codigo || "";
  const opcoesPais = PAISES.some(([c]) => c === pais) || !pais ? PAISES : [[pais, pais], ...PAISES];

  const form = el("form", { class: "form-admin", novalidate: true },
    el("div", { class: "alerta", role: "alert", tabindex: "-1", hidden: true, "data-alerta": true },
      el("span", { class: "alerta__icone", "aria-hidden": "true" }, "!"),
      el("div", {}, el("p", { class: "alerta__titulo" }), el("p", { class: "alerta__texto" }))),
    bloqueiaIdentidade || bloqueiaNatureza
      ? el("div", { class: "alerta alerta--info" },
          el("span", { class: "alerta__icone", "aria-hidden": "true" }, "i"),
          el("div", {},
            el("p", { class: "alerta__titulo" }, "Campos bloqueados"),
            el("p", { class: "alerta__texto" }, bloqueiaIdentidade
              ? "Camisas desta equipe já entraram em kits. Nome, país e natureza ficam preservados para não alterar o histórico."
              : "Esta equipe já tem camisas no catálogo. A natureza fica preservada para manter a classificação das camisas.")))
      : null,
    el("p", { class: "obrigatorios" }, "Campos obrigatórios: nome, país e natureza."),
    el("div", { class: "campo" },
      el("label", { class: "campo__rotulo", for: "nome" }, "Nome da equipe"),
      el("div", { class: "campo__caixa" },
        el("input", { class: "campo__entrada", id: "nome", name: "nome", type: "text", maxlength: "80", autocomplete: "off", value: equipe?.nome || "", placeholder: "Ex.: Real Madrid", disabled: bloqueiaIdentidade, "aria-describedby": "ajuda-nome" })),
      el("p", { class: "campo__ajuda", id: "ajuda-nome" }, "Use o nome padronizado, sem apelidos, para evitar registros duplicados."),
      campoErro("nome")),
    el("div", { class: "campo" },
      el("label", { class: "campo__rotulo", for: "pais" }, "País"),
      el("div", { class: "campo__caixa campo__caixa--selecao" },
        el("select", { class: "campo__entrada", id: "pais", name: "pais", disabled: bloqueiaIdentidade },
          el("option", { value: "" }, "Selecione o país"),
          ...opcoesPais.map(([c, n]) => el("option", { value: c, selected: c === pais }, `${n} (${c})`))),
        el("span", { class: "campo__seta", "aria-hidden": "true" })),
      campoErro("pais")),
    grupoRadios("natureza", "Natureza", [["clube", "Clube"], ["selecao", "Seleção"]], equipe?.natureza || "", bloqueiaNatureza || bloqueiaIdentidade,
      "Clubes brasileiros não recebem camisas no catálogo; a seleção brasileira é permitida."),
    edicao ? grupoRadios("situacao", "Situação", [["ativa", "Ativa"], ["inativa", "Inativa"]], equipe.ativo ? "ativa" : "inativa", false,
      "Equipes inativas deixam de ser oferecidas em novos cadastros; o histórico é mantido.") : null,
    el("div", { class: "acoes-form" },
      el("a", { class: "link", href: voltar }, "Voltar ao catálogo"),
      el("button", { class: "botao botao--primaria", type: "submit" }, "Salvar equipe")));

  form.addEventListener("submit", salvar);
  return form;
}

function estrutura() {
  const titulo = equipe ? "Editar equipe" : "Nova equipe";
  document.title = `${titulo} · Administração · Clube do Manto`;
  return el("div", { class: "container" },
    el("div", { class: "area-cliente__topo" },
      el("a", { class: "area-cliente__voltar", href: voltar }, el("span", { "aria-hidden": "true" }, "←"), "Voltar ao catálogo"),
      el("p", { class: "chamada chamada--no-escuro" }, "Administração / Catálogo"),
      el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, titulo),
      el("p", { class: "area-cliente__sub" }, equipe ? `${equipe.nome} · ${nomeDoPais(equipe.pais_codigo)}` : "Cadastre uma equipe para receber modelos de camisa.")),
    el("section", { class: "cartao cartao--admin cartao--form-admin", "aria-labelledby": "titulo-dados" },
      el("h2", { class: "cartao__titulo", id: "titulo-dados" }, "Dados da equipe"),
      el("div", { "data-sucesso": true, role: "status" }),
      formulario()));
}

const MENSAGENS = {
  nome_invalido: ["nome", "Informe o nome da equipe (até 80 caracteres)."],
  pais_invalido: ["pais", "Selecione o país da equipe."],
  natureza_invalida: ["natureza", "Escolha se a equipe é um clube ou uma seleção."],
  equipe_equivalente: ["nome", "Já existe uma equipe com este nome, país e natureza."],
  natureza_bloqueada: ["natureza", "A natureza não pode mudar porque a equipe já tem camisas no catálogo."],
  equipe_com_historico: ["nome", "Nome e país não podem mudar porque camisas desta equipe já entraram em kits."],
  clube_brasileiro: ["pais", "Esta equipe tem camisas no catálogo e não pode virar um clube brasileiro."],
};

async function salvar(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const alerta = form.querySelector("[data-alerta]");
  const sucesso = principal.querySelector("[data-sucesso]");
  alerta.hidden = true;
  sucesso.replaceChildren();
  limparErros(form);
  form.querySelectorAll("fieldset.campo--erro").forEach((f) => f.classList.remove("campo--erro"));

  const nome = form.nome.value.trim().replace(/\s+/g, " ");
  const pais = form.pais.value;
  const natureza = form.querySelector("input[name=natureza]:checked")?.value || "";
  const situacao = form.querySelector("input[name=situacao]:checked")?.value;

  const erros = [];
  if (!nome) erros.push(["nome", "Informe o nome da equipe."]);
  if (!pais) erros.push(["pais", "Selecione o país da equipe."]);
  if (!natureza) erros.push(["natureza", "Escolha se a equipe é um clube ou uma seleção."]);
  if (erros.length) {
    erros.forEach(([campo, msg]) => erroNoCampo(form, campo, msg));
    focarCampo(form, erros[0][0]);
    return;
  }

  const botao = form.querySelector("button[type=submit]");
  processando(botao, true, "Salvando…");
  const { data, error } = await supabase.rpc("admin_salvar_equipe", {
    p_id: equipe ? equipe.id : null,
    p_nome: nome,
    p_pais: pais,
    p_natureza: natureza,
    p_ativo: situacao ? situacao === "ativa" : true,
  });
  processando(botao, false);

  if (error) {
    console.error(error);
    const conhecido = MENSAGENS[codigoDoErro(error)];
    if (conhecido) {
      erroNoCampo(form, conhecido[0], conhecido[1]);
      if (codigoDoErro(error) === "equipe_equivalente") mostrar(alerta, "Registro equivalente", "Já existe uma equipe com este nome, país e natureza. Edite o registro existente em vez de criar outro.");
      focarCampo(form, conhecido[0]);
    } else if (falhaIncerta(error)) {
      mostrar(alerta, "Não foi possível confirmar o resultado", "Consulte o catálogo antes de tentar novamente: a equipe pode ter sido salva.");
    } else {
      mostrar(alerta, "Não foi possível salvar a equipe", "Tente novamente em instantes.");
    }
    return;
  }

  const novo = !equipe;
  equipe = data;
  id = String(data.id);
  history.replaceState(null, "", `${TELAS.A03}?id=${data.id}&voltar=${encodeURIComponent(voltar)}`);
  try {
    await carregar();
  } catch (erro) {
    console.error(erro);
  }
  principal.replaceChildren(estrutura());
  const podeTerCamisas = !(data.natureza === "clube" && data.pais_codigo === "BR") && data.ativo;
  principal.querySelector("[data-sucesso]").append(el("div", { class: "alerta alerta--sucesso", tabindex: "-1" },
    el("span", { class: "alerta__icone", "aria-hidden": "true" }, "✓"),
    el("div", { class: "pilha" },
      el("p", { class: "alerta__titulo" }, novo ? "Equipe cadastrada" : "Equipe atualizada"),
      el("p", { class: "alerta__texto" }, `${data.nome} foi salva no catálogo.`),
      el("div", { class: "acoes-linha" },
        el("a", { class: "link", href: voltar }, "Voltar ao catálogo"),
        podeTerCamisas ? el("a", { class: "link", href: `${TELAS.A04}?equipe=${data.id}` }, "Cadastrar camisa desta equipe") : null))));
  principal.querySelector("[data-sucesso] .alerta").focus();
}

function erroNoCampo(form, campo, mensagem) {
  if (campo === "natureza" || campo === "situacao") {
    const grupo = form.querySelector(`input[name=${campo}]`).closest("fieldset");
    grupo.classList.add("campo--erro");
    grupo.querySelector(".campo__erro").textContent = mensagem;
    grupo.setAttribute("aria-describedby", `erro-${campo}`);
    return;
  }
  marcarErro(form[campo], mensagem);
}
function focarCampo(form, campo) {
  (form.querySelector(`input[name=${campo}]:not(:disabled)`) || form[campo])?.focus?.();
}
function mostrar(alerta, titulo, texto) {
  alerta.querySelector(".alerta__titulo").textContent = titulo;
  alerta.querySelector(".alerta__texto").textContent = texto;
  alerta.hidden = false;
  alerta.focus();
}

(async () => {
  if (!(await exigirAdministrador(principal))) return;
  try {
    await carregar();
  } catch (erro) {
    console.error(erro);
    mostrarFalhaGeral(principal, "Não foi possível carregar a equipe", () => location.reload());
    return;
  }
  if (id && !equipe) {
    principal.setAttribute("aria-busy", "false");
    principal.replaceChildren(el("div", { class: "container" },
      el("div", { class: "area-cliente__topo" }, el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, "Equipe não encontrada")),
      el("section", { class: "cartao cartao--admin" },
        el("p", { class: "cartao__texto" }, "Este registro não existe no catálogo."),
        el("a", { class: "botao botao--primaria", href: voltar }, "Voltar ao catálogo"))));
    return;
  }
  principal.replaceChildren(estrutura());
  principal.setAttribute("aria-busy", "false");
})();
