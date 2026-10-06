// Cliente único do Supabase para todas as páginas.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const configurado = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = configurado
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    })
  : null;

// Mostra uma faixa discreta no topo quando a configuração ainda não foi feita.
// É um aviso de desenvolvimento, não um recurso da aplicação final.
export function avisarSemConfiguracao() {
  if (configurado || document.querySelector(".aviso-config")) return;
  const aviso = document.createElement("p");
  aviso.className = "aviso-config";
  aviso.setAttribute("role", "status");
  aviso.textContent = "Ambiente de desenvolvimento: preencha js/config.js com a URL e a chave pública do Supabase.";
  document.body.prepend(aviso);
}
