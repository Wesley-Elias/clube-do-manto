// A04 — Camisa: cadastro e edição.
// Identidade do modelo = equipe + temporada + categoria. Tipo (Clube/Seleção/Especial)
// é diferente de categoria (Home/Away/Third). Modelo já usado em kit não tem equipe,
// tipo, categoria ou temporada redefinidos; a gravação passa por admin_salvar_camisa().
import { supabase, avisarSemConfiguracao } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { el } from "./cliente.js";
import { marcarErro, limparErros, processando } from "./formulario.js";
import { criarBuscaEquipe } from "./busca-equipe.js";
import {
  montarCabecalhoAdmin, exigirAdministrador, mostrarFalhaGeral,
  TIPOS_CAMISA, CATEGORIAS, NATUREZAS, codigoDoErro, falhaIncerta,
} from "./admin.js";

avisarSemConfiguracao();
montarCabecalhoAdmin("A02");

const principal = document.querySelector("[data-tela]");
const params = new URLSearchParams(location.search);
let id = params.get("id");
const equipeInicial = params.get("equipe");
const voltar = seguro(params.get("voltar")) || `${TELAS.A02}?aba=camisas`;
let camisa = null;
let emUso = false;
let equipes = [];
let buscaEquipe = null;

function seguro(endereco) {
  return endereco && /^catalogo\.html(\?[\w=&%.\-+]*)?$/.test(endereco) ? endereco : null;
}

async function carregar() {
  const consultas = [supabase.from("equipes").select("id, nome, pais_codigo, natureza, ativo")];
  if (id) {
    consultas.push(
      supabase.from("camisas").select("id, equipe_id, tipo, categoria, temporada, descricao, ativo").eq("id", Number(id)).maybeSingle(),
      supabase.rpc("admin_uso_da_camisa", { p_camisa: Number(id) }));
  }
  const [r1, r2, r3] = await Promise.all(consultas);
  const erro = r1.error || r2?.error || r3?.error;
  if (erro) throw erro;
  equipes = r1.data.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (id) {
    camisa = r2.data;
    emUso = r3.data === true;
  }
}

const equipePorId = (valor) => equipes.find((e) => String(e.id) === String(valor)) || null;

function campoErro(nome) {
  return el("p", { class: "campo__erro", id: `erro-${nome}` });
}

function grupoRadios(nome, legenda, opcoes, valor, bloqueado, ajuda) {
  return el("fieldset", { class: "campo campo--grupo" },
    el("legend", { class: "campo__rotulo" }, legenda),
    el("div", { class: "radios" }, ...opcoes.map(([v, r]) =>
      el("label", { class: "radio" },
        el("input", { type: "radio", name: nome, value: v, checked: v === valor, disabled: bloqueado }),
        el("span", {}, r)))),
    ajuda ? el("p", { class: "campo__ajuda" }, ajuda) : null,
    campoErro(nome));
}

function formulario() {
  const edicao = Boolean(camisa);
  const form = el("form", { class: "form-admin", novalidate: true },
    el("div", { class: "alerta", role: "alert", tabindex: "-1", hidden: true, "data-alerta": true },
      el("span", { class: "alerta__icone", "aria-hidden": "true" }, "!"),
      el("div", {}, el("p", { class: "alerta__titulo" }), el("p", { class: "alerta__texto" }))),
    emUso ? el("div", { class: "alerta alerta--info" },
      el("span", { class: "alerta__icone", "aria-hidden": "true" }, "i"),
      el("div", {},
        el("p", { class: "alerta__titulo" }, "Modelo já usado em kits"),
        el("p", { class: "alerta__texto" }, "Equipe, tipo, categoria e temporada ficam bloqueados para preservar o histórico. Descrição e situação podem ser alteradas."))) : null,
    el("p", { class: "obrigatorios" }, "Campos obrigatórios: equipe, tipo, categoria e temporada. A descrição é opcional."),
    el("div", { class: "campo busca-equipe", "data-busca": "equipe" },
      el("label", { class: "campo__rotulo", for: "equipe" }, "Equipe"),
      el("div", { class: "campo__caixa" },
        el("input", { class: "campo__entrada", id: "equipe", name: "equipe", type: "text", role: "combobox", "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": "lista-equipe", autocomplete: "off", spellcheck: "false", placeholder: "Busque ou selecione uma equipe", "aria-describedby": "ajuda-equipe", disabled: emUso }),
        el("button", { class: "busca-equipe__abrir", type: "button", tabindex: "-1", "aria-label": "Mostrar equipes", disabled: emUso })),
      el("ul", { class: "busca-equipe__lista", id: "lista-equipe", role: "listbox", "aria-label": "Equipes", hidden: true }),
      el("p", { class: "campo__ajuda", id: "ajuda-equipe" }, "Somente equipes cadastradas e ativas. Para uma equipe nova, cadastre-a antes no catálogo."),
      campoErro("equipe")),
    grupoRadios("tipo", "Tipo", Object.entries(TIPOS_CAMISA), camisa?.tipo || "", emUso,
      "Clube e Seleção seguem a natureza da equipe. Especial é uma peça retrô ou histórica de qualquer equipe permitida."),
    grupoRadios("categoria", "Categoria", CATEGORIAS.map((c) => [c, c]), camisa?.categoria || "", emUso),
    el("div", { class: "campo" },
      el("label", { class: "campo__rotulo", for: "temporada" }, "Temporada"),
      el("div", { class: "campo__caixa" },
        el("input", { class: "campo__entrada", id: "temporada", name: "temporada", type: "text", inputmode: "numeric", maxlength: "9", autocomplete: "off", value: camisa?.temporada || "", placeholder: "2025/2026 ou 2026", disabled: emUso, "aria-describedby": "ajuda-temporada" })),
      el("p", { class: "campo__ajuda", id: "ajuda-temporada" }, "Use AAAA ou AAAA/AAAA."),
      campoErro("temporada")),
    el("div", { class: "campo" },
      el("label", { class: "campo__rotulo", for: "descricao" }, "Descrição (opcional)"),
      el("div", { class: "campo__caixa campo__caixa--texto" },
        el("textarea", { class: "campo__entrada", id: "descricao", name: "descricao", rows: "3", maxlength: "280", "aria-describedby": "ajuda-descricao" }, camisa?.descricao || "")),
      el("p", { class: "campo__ajuda", id: "ajuda-descricao" }, "Até 280 caracteres. Sem promessa de disponibilidade."),
      campoErro("descricao")),
    edicao ? grupoRadios("situacao", "Situação", [["ativa", "Ativa"], ["inativa", "Inativa"]], camisa.ativo ? "ativa" : "inativa", false,
      "Camisas inativas saem da coleção e de novas montagens; o histórico é mantido.") : null,
    el("div", { class: "acoes-form" },
      el("a", { class: "link", href: voltar }, "Voltar ao catálogo"),
      el("button", { class: "botao botao--primaria", type: "submit" }, "Salvar camisa")));

  // A lista oferece equipes ativas; a equipe atual aparece mesmo se inativa.
  const atual = camisa ? equipePorId(camisa.equipe_id) : null;
  const opcoes = equipes.filter((e) => e.ativo || e.id === atual?.id);
  buscaEquipe = criarBuscaEquipe(form.querySelector('[data-busca="equipe"]'), opcoes);
  const inicial = camisa?.equipe_id || equipeInicial;
  if (inicial && opcoes.some((e) => String(e.id) === String(inicial))) buscaEquipe.definir(inicial);

  form.addEventListener("submit", salvar);
  return form;
}

function estrutura() {
  const titulo = camisa ? "Editar camisa" : "Nova camisa";
  const equipe = camisa ? equipePorId(camisa.equipe_id) : null;
  document.title = `${titulo} · Administração · Clube do Manto`;
  return el("div", { class: "container" },
    el("div", { class: "area-cliente__topo" },
      el("a", { class: "area-cliente__voltar", href: voltar }, el("span", { "aria-hidden": "true" }, "←"), "Voltar ao catálogo"),
      el("p", { class: "chamada chamada--no-escuro" }, "Administração / Catálogo"),
      el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, titulo),
      el("p", { class: "area-cliente__sub" }, camisa && equipe
        ? `${equipe.nome} · ${camisa.categoria} · ${camisa.temporada}`
        : "Cadastre um modelo de camisa de uma equipe do catálogo.")),
    el("section", { class: "cartao cartao--admin cartao--form-admin", "aria-labelledby": "titulo-dados" },
      el("h2", { class: "cartao__titulo", id: "titulo-dados" }, "Dados do modelo"),
      el("div", { "data-sucesso": true, role: "status" }),
      formulario()));
}

const MENSAGENS = {
  equipe_invalida: ["equipe", "Selecione uma equipe cadastrada."],
  tipo_invalido: ["tipo", "Escolha o tipo da camisa."],
  categoria_invalida: ["categoria", "Escolha a categoria: Home, Away ou Third."],
  temporada_invalida: ["temporada", "Use o formato AAAA ou AAAA/AAAA."],
  descricao_longa: ["descricao", "A descrição pode ter até 280 caracteres."],
  classificacao_incoerente: ["tipo", "O tipo não corresponde à natureza da equipe."],
  clube_brasileiro: ["equipe", "Clubes brasileiros não fazem parte do catálogo, inclusive nas especiais."],
  modelo_duplicado: ["temporada", "Já existe uma camisa desta equipe com a mesma temporada e categoria."],
  modelo_em_uso: ["equipe", "Este modelo já foi usado em kits e não pode ter a identidade alterada."],
  equipe_inativa: ["equipe", "A equipe está inativa. Reative a equipe antes de cadastrar ou reativar camisas dela."],
};

function validar(valores) {
  const erros = [];
  const equipe = equipePorId(valores.equipe);
  if (!equipe) erros.push(["equipe", "Selecione uma equipe cadastrada."]);
  if (!valores.tipo) erros.push(["tipo", "Escolha o tipo da camisa."]);
  if (!valores.categoria) erros.push(["categoria", "Escolha a categoria: Home, Away ou Third."]);
  if (!/^\d{4}(\/\d{4})?$/.test(valores.temporada)) erros.push(["temporada", valores.temporada ? "Use o formato AAAA ou AAAA/AAAA." : "Informe a temporada."]);
  if (equipe && !emUso) {
    if (equipe.natureza === "clube" && equipe.pais_codigo === "BR") erros.push(["equipe", MENSAGENS.clube_brasileiro[1]]);
    else if ((valores.tipo === "clube" || valores.tipo === "selecao") && valores.tipo !== equipe.natureza) {
      erros.push(["tipo", `${equipe.nome} é ${NATUREZAS[equipe.natureza].toLowerCase()}. Escolha ${TIPOS_CAMISA[equipe.natureza]} ou Especial.`]);
    }
  }
  return erros;
}

async function salvar(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const alerta = form.querySelector("[data-alerta]");
  principal.querySelector("[data-sucesso]").replaceChildren();
  alerta.hidden = true;
  limparErros(form);

  const valores = {
    equipe: buscaEquipe.valor,
    tipo: form.querySelector("input[name=tipo]:checked")?.value || "",
    categoria: form.querySelector("input[name=categoria]:checked")?.value || "",
    temporada: form.temporada.value.trim(),
    descricao: form.descricao.value.trim(),
    situacao: form.querySelector("input[name=situacao]:checked")?.value,
  };
  const erros = validar(valores);
  if (erros.length) {
    erros.forEach(([campo, msg]) => erroNoCampo(form, campo, msg));
    focarCampo(form, erros[0][0]);
    return;
  }

  const botao = form.querySelector("button[type=submit]");
  processando(botao, true, "Salvando…");
  const { data, error } = await supabase.rpc("admin_salvar_camisa", {
    p_id: camisa ? camisa.id : null,
    p_equipe_id: valores.equipe,
    p_tipo: valores.tipo,
    p_categoria: valores.categoria,
    p_temporada: valores.temporada,
    p_descricao: valores.descricao || null,
    p_ativo: valores.situacao ? valores.situacao === "ativa" : true,
  });
  processando(botao, false);

  if (error) {
    console.error(error);
    const codigo = codigoDoErro(error);
    const conhecido = MENSAGENS[codigo];
    if (conhecido) {
      erroNoCampo(form, conhecido[0], conhecido[1]);
      if (codigo === "modelo_duplicado") mostrar(alerta, "Modelo duplicado", "Equipe, temporada e categoria identificam o modelo. Edite a camisa existente em vez de criar outra.");
      focarCampo(form, conhecido[0]);
    } else if (falhaIncerta(error)) {
      mostrar(alerta, "Não foi possível confirmar o resultado", "Consulte o catálogo antes de tentar novamente: a camisa pode ter sido salva.");
    } else {
      mostrar(alerta, "Não foi possível salvar a camisa", "Tente novamente em instantes.");
    }
    return;
  }

  const novo = !camisa;
  id = String(data.id);
  history.replaceState(null, "", `${TELAS.A04}?id=${data.id}&voltar=${encodeURIComponent(voltar)}`);
  try {
    await carregar();
  } catch (erro) {
    console.error(erro);
    camisa = data;
  }
  principal.replaceChildren(estrutura());
  principal.querySelector("[data-sucesso]").append(el("div", { class: "alerta alerta--sucesso", tabindex: "-1" },
    el("span", { class: "alerta__icone", "aria-hidden": "true" }, "✓"),
    el("div", { class: "pilha" },
      el("p", { class: "alerta__titulo" }, novo ? "Camisa cadastrada" : "Camisa atualizada"),
      el("p", { class: "alerta__texto" }, novo ? "O modelo foi salvo. Cadastre o saldo por tamanho para que ele possa entrar nos kits." : "As alterações foram salvas no catálogo."),
      el("div", { class: "acoes-linha" },
        data.ativo ? el("a", { class: "link", href: `${TELAS.A05}?camisa=${data.id}${novo ? "&cadastrar=1" : ""}` }, novo ? "Cadastrar estoque" : "Ver estoque") : null,
        el("a", { class: "link", href: voltar }, "Voltar ao catálogo")))));
  principal.querySelector("[data-sucesso] .alerta").focus();
}

function erroNoCampo(form, campo, mensagem) {
  if (["tipo", "categoria", "situacao"].includes(campo)) {
    const grupo = form.querySelector(`input[name=${campo}]`).closest("fieldset");
    grupo.classList.add("campo--erro");
    grupo.querySelector(".campo__erro").textContent = mensagem;
    grupo.setAttribute("aria-describedby", `erro-${campo}`);
    return;
  }
  marcarErro(form[campo], mensagem);
}
function focarCampo(form, campo) {
  const alvo = form.querySelector(`input[name=${campo}]:not(:disabled)`) || form[campo];
  if (alvo && !alvo.disabled) alvo.focus();
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
    mostrarFalhaGeral(principal, "Não foi possível carregar a camisa", () => location.reload());
    return;
  }
  if (id && !camisa) {
    principal.setAttribute("aria-busy", "false");
    principal.replaceChildren(el("div", { class: "container" },
      el("div", { class: "area-cliente__topo" }, el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, "Camisa não encontrada")),
      el("section", { class: "cartao cartao--admin" },
        el("p", { class: "cartao__texto" }, "Este modelo não existe no catálogo."),
        el("a", { class: "botao botao--primaria", href: voltar }, "Voltar ao catálogo"))));
    return;
  }
  principal.replaceChildren(estrutura());
  principal.setAttribute("aria-busy", "false");
})();
