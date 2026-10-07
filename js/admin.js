// Área administrativa: exige sessão e papel de administrador (decidido no banco),
// monta o cabeçalho administrativo e reúne rótulos e formatação de A01–A05.
import { supabase } from "./supabase.js";
import { TELAS } from "./sessao.js";
import { el, montarCabecalhoArea } from "./cliente.js";
import { exigirSessao } from "./cliente.js";

const ITENS = [
  { tela: "A01", rotulo: "Painel" },
  { tela: "A02", rotulo: "Catálogo" },
  { tela: "A05", rotulo: "Estoque" },
  { tela: "A06", rotulo: "Assinantes" },
  { tela: "A09", rotulo: "Trocas" },
];

export function montarCabecalhoAdmin(telaAtual) {
  montarCabecalhoArea({ itens: ITENS, telaAtual, rotulo: "Administração", inicio: TELAS.A01, idMenu: "menu-admin", nomeFixo: "Administrador" });
}

// Sem sessão → login. Sessão sem papel administrativo → aviso "sem autorização"
// com retorno à área do cliente. Ocultar o menu não é o controle: as funções do
// banco recusam quem não é administrador.
export async function exigirAdministrador(principal) {
  const sessao = await exigirSessao();
  if (!sessao) return false;
  let autorizado = false;
  try {
    const { data, error } = await supabase.rpc("eh_administrador");
    if (error) throw error;
    autorizado = data === true;
  } catch (erro) {
    console.error(erro);
    mostrarFalhaGeral(principal, "Não foi possível confirmar seu acesso", () => location.reload());
    return false;
  }
  if (!autorizado) {
    principal.setAttribute("aria-busy", "false");
    principal.replaceChildren(el("div", { class: "container" },
      el("div", { class: "area-cliente__topo" },
        el("p", { class: "chamada chamada--no-escuro" }, "Administração"),
        el("h1", { class: "area-cliente__titulo", tabindex: "-1" }, "Acesso não autorizado")),
      el("section", { class: "cartao cartao--falha", role: "alert" },
        el("span", { class: "cartao--falha__icone", "aria-hidden": "true" }, "!"),
        el("h2", { class: "cartao__titulo" }, "Você não possui acesso a esta área"),
        el("p", { class: "cartao__texto" }, "Esta área é exclusiva da administração do Clube do Manto."),
        el("a", { class: "botao botao--primaria", href: TELAS.C01 }, "Retornar à sua área"))));
    principal.querySelector("h1").focus();
    return false;
  }
  return true;
}

export function mostrarFalhaGeral(alvo, titulo, aoTentar) {
  const caixa = el("section", { class: "cartao cartao--falha", role: "alert" },
    el("span", { class: "cartao--falha__icone", "aria-hidden": "true" }, "!"),
    el("h2", { class: "cartao__titulo" }, titulo),
    el("p", { class: "cartao__texto" }, "Verifique sua conexão e tente novamente."),
    el("button", { class: "botao botao--primaria", type: "button" }, "Tentar novamente"));
  caixa.querySelector("button").addEventListener("click", aoTentar);
  alvo.setAttribute("aria-busy", "false");
  alvo.replaceChildren(el("div", { class: "container" }, caixa));
}

// ---------- Rótulos ----------
export const NATUREZAS = { clube: "Clube", selecao: "Seleção" };
export const TIPOS_CAMISA = { clube: "Clube", selecao: "Seleção", especial: "Especial" };
export const CATEGORIAS = ["Home", "Away", "Third"];
export const TAMANHOS = ["P", "M", "G", "GG"];

// Países para o cadastro de equipe (código ISO de 2 letras, como no banco).
// Lista de apoio da tela; o banco aceita qualquer código de 2 letras.
export const PAISES = [
  ["AF", "Afeganistão"], ["ZA", "África do Sul"], ["AL", "Albânia"], ["DE", "Alemanha"], ["AD", "Andorra"],
  ["AO", "Angola"], ["AI", "Anguila"], ["AG", "Antígua e Barbuda"], ["SA", "Arábia Saudita"],
  ["DZ", "Argélia"], ["AR", "Argentina"], ["AM", "Armênia"], ["AW", "Aruba"], ["AU", "Austrália"],
  ["AT", "Áustria"], ["AZ", "Azerbaijão"], ["BS", "Bahamas"], ["BD", "Bangladesh"], ["BB", "Barbados"],
  ["BH", "Barein"], ["BE", "Bélgica"], ["BZ", "Belize"], ["BJ", "Benin"], ["BM", "Bermudas"],
  ["BY", "Bielorrússia"], ["BO", "Bolívia"], ["BA", "Bósnia e Herzegovina"], ["BW", "Botsuana"],
  ["BR", "Brasil"], ["BN", "Brunei"], ["BG", "Bulgária"], ["BF", "Burquina Faso"], ["BI", "Burundi"],
  ["BT", "Butão"], ["CV", "Cabo Verde"], ["CM", "Camarões"], ["KH", "Camboja"], ["CA", "Canadá"],
  ["QA", "Catar"], ["KZ", "Cazaquistão"], ["TD", "Chade"], ["CL", "Chile"], ["CN", "China"],
  ["CY", "Chipre"], ["VA", "Cidade do Vaticano"], ["CO", "Colômbia"], ["KM", "Comores"],
  ["KP", "Coreia do Norte"], ["KR", "Coreia do Sul"], ["CI", "Costa do Marfim"], ["CR", "Costa Rica"],
  ["HR", "Croácia"], ["CU", "Cuba"], ["CW", "Curaçao"], ["DK", "Dinamarca"], ["DJ", "Djibuti"],
  ["DM", "Dominica"], ["EG", "Egito"], ["SV", "El Salvador"], ["AE", "Emirados Árabes Unidos"],
  ["EC", "Equador"], ["ER", "Eritreia"], ["SK", "Eslováquia"], ["SI", "Eslovênia"], ["ES", "Espanha"],
  ["SZ", "Essuatíni"], ["US", "Estados Unidos"], ["EE", "Estônia"], ["ET", "Etiópia"], ["FJ", "Fiji"],
  ["PH", "Filipinas"], ["FI", "Finlândia"], ["FR", "França"], ["GA", "Gabão"], ["GM", "Gâmbia"],
  ["GH", "Gana"], ["GE", "Geórgia"], ["GI", "Gibraltar"], ["GD", "Granada"], ["GR", "Grécia"],
  ["GL", "Groenlândia"], ["GP", "Guadalupe"], ["GU", "Guam"], ["GT", "Guatemala"], ["GG", "Guernsey"],
  ["GY", "Guiana"], ["GF", "Guiana Francesa"], ["GN", "Guiné"], ["GQ", "Guiné Equatorial"],
  ["GW", "Guiné-Bissau"], ["HT", "Haiti"], ["NL", "Holanda"], ["HN", "Honduras"], ["HK", "Hong Kong"],
  ["HU", "Hungria"], ["YE", "Iêmen"], ["CX", "Ilha Christmas"], ["IM", "Ilha de Man"],
  ["NF", "Ilha Norfolk"], ["AX", "Ilhas Åland"], ["KY", "Ilhas Cayman"], ["CC", "Ilhas Cocos (Keeling)"],
  ["CK", "Ilhas Cook"], ["FO", "Ilhas Faroé"], ["FK", "Ilhas Malvinas"], ["MP", "Ilhas Marianas do Norte"],
  ["MH", "Ilhas Marshall"], ["PN", "Ilhas Pitcairn"], ["SB", "Ilhas Salomão"],
  ["TC", "Ilhas Turcas e Caicos"], ["VI", "Ilhas Virgens Americanas"], ["VG", "Ilhas Virgens Britânicas"],
  ["IN", "Índia"], ["ID", "Indonésia"], ["GB", "Inglaterra / Reino Unido"], ["IR", "Irã"], ["IQ", "Iraque"],
  ["IE", "Irlanda"], ["IS", "Islândia"], ["IL", "Israel"], ["IT", "Itália"], ["JM", "Jamaica"],
  ["JP", "Japão"], ["JE", "Jersey"], ["JO", "Jordânia"], ["XK", "Kosovo"], ["KW", "Kuwait"], ["LA", "Laos"],
  ["LS", "Lesoto"], ["LV", "Letônia"], ["LB", "Líbano"], ["LR", "Libéria"], ["LY", "Líbia"],
  ["LI", "Liechtenstein"], ["LT", "Lituânia"], ["LU", "Luxemburgo"], ["MO", "Macau"],
  ["MK", "Macedônia do Norte"], ["MG", "Madagascar"], ["MY", "Malásia"], ["MW", "Malaui"],
  ["MV", "Maldivas"], ["ML", "Mali"], ["MT", "Malta"], ["MA", "Marrocos"], ["MQ", "Martinica"],
  ["MU", "Maurício"], ["MR", "Mauritânia"], ["YT", "Mayotte"], ["MX", "México"],
  ["MM", "Mianmar (Birmânia)"], ["FM", "Micronésia"], ["MZ", "Moçambique"], ["MD", "Moldávia"],
  ["MC", "Mônaco"], ["MN", "Mongólia"], ["ME", "Montenegro"], ["MS", "Montserrat"], ["NA", "Namíbia"],
  ["NR", "Nauru"], ["NP", "Nepal"], ["NI", "Nicarágua"], ["NE", "Níger"], ["NG", "Nigéria"], ["NU", "Niue"],
  ["NO", "Noruega"], ["NC", "Nova Caledônia"], ["NZ", "Nova Zelândia"], ["OM", "Omã"],
  ["BQ", "Países Baixos Caribenhos"], ["PW", "Palau"], ["PS", "Palestina"], ["PA", "Panamá"],
  ["PG", "Papua-Nova Guiné"], ["PK", "Paquistão"], ["PY", "Paraguai"], ["PE", "Peru"],
  ["PF", "Polinésia Francesa"], ["PL", "Polônia"], ["PR", "Porto Rico"], ["PT", "Portugal"],
  ["KE", "Quênia"], ["KG", "Quirguistão"], ["KI", "Quiribati"], ["CF", "República Centro-Africana"],
  ["CD", "República Democrática do Congo"], ["CG", "República do Congo"], ["DO", "República Dominicana"],
  ["CZ", "República Tcheca"], ["RE", "Reunião"], ["RO", "Romênia"], ["RW", "Ruanda"], ["RU", "Rússia"],
  ["EH", "Saara Ocidental"], ["WS", "Samoa"], ["AS", "Samoa Americana"], ["SM", "San Marino"],
  ["SH", "Santa Helena"], ["LC", "Santa Lúcia"], ["BL", "São Bartolomeu"], ["KN", "São Cristóvão e Névis"],
  ["MF", "São Martinho"], ["PM", "São Pedro e Miquelão"], ["ST", "São Tomé e Príncipe"],
  ["VC", "São Vicente e Granadinas"], ["SC", "Seicheles"], ["SN", "Senegal"], ["SL", "Serra Leoa"],
  ["RS", "Sérvia"], ["SG", "Singapura"], ["SX", "Sint Maarten"], ["SY", "Síria"], ["SO", "Somália"],
  ["LK", "Sri Lanka"], ["SD", "Sudão"], ["SS", "Sudão do Sul"], ["SE", "Suécia"], ["CH", "Suíça"],
  ["SR", "Suriname"], ["SJ", "Svalbard e Jan Mayen"], ["TJ", "Tadjiquistão"], ["TH", "Tailândia"],
  ["TW", "Taiwan"], ["TZ", "Tanzânia"], ["TL", "Timor-Leste"], ["TG", "Togo"], ["TK", "Tokelau"],
  ["TO", "Tonga"], ["TT", "Trinidad e Tobago"], ["TN", "Tunísia"], ["TM", "Turcomenistão"],
  ["TR", "Turquia"], ["TV", "Tuvalu"], ["UA", "Ucrânia"], ["UG", "Uganda"], ["UY", "Uruguai"],
  ["UZ", "Uzbequistão"], ["VU", "Vanuatu"], ["VE", "Venezuela"], ["VN", "Vietnã"], ["WF", "Wallis e Futuna"],
  ["ZM", "Zâmbia"], ["ZW", "Zimbábue"],
];
const NOMES_PAISES = new Map(PAISES);
export function nomeDoPais(codigo) {
  return NOMES_PAISES.get(codigo) || codigo;
}

export function chipSituacao(ativo) {
  return el("span", { class: `chip ${ativo ? "chip--sucesso" : "chip--neutro"}` },
    el("span", { "aria-hidden": "true" }, ativo ? "●" : "○"), ativo ? "Ativo" : "Inativo");
}

export function chipSaldo(quantidade) {
  return quantidade > 0
    ? el("span", { class: "chip chip--sucesso" }, el("span", { "aria-hidden": "true" }, "✓"), "Disponível")
    : el("span", { class: "chip chip--neutro" }, el("span", { "aria-hidden": "true" }, "–"), "Sem saldo");
}

// "Real Madrid · Clube · Home · 2025/2026"
export function nomeDoModelo(camisa) {
  return `${camisa.equipes.nome} · ${TIPOS_CAMISA[camisa.tipo]} · ${camisa.categoria} · ${camisa.temporada}`;
}

export function dataHora(iso) {
  const d = new Date(iso);
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${data} • ${hora}`;
}

// Mensagem fixa vinda do banco (RAISE EXCEPTION 'codigo')
export function codigoDoErro(erro) {
  return (erro?.message || "").trim();
}

// Falha de comunicação: não prova que nada foi gravado
export function falhaIncerta(erro) {
  const status = erro?.status ?? 0;
  return !erro?.code && (status === 0 || status >= 500 || /fetch|network/i.test(erro?.message || ""));
}

export function normalizar(texto) {
  return (texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function linhaDado(rotulo, valor) {
  return el("div", {}, el("dt", {}, rotulo), el("dd", {}, valor));
}
