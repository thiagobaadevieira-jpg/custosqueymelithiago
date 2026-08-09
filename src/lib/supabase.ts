import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  {
    auth: {
      // Storage key próprio evita que outros apps/instâncias no mesmo domínio
      // sobrescrevam a sessão (padrão é 'sb-<ref>-auth-token').
      storageKey: 'gastos-queymeli-auth',
      persistSession: true,      // salva sessão no localStorage entre reloads
      autoRefreshToken: true,    // renova o access token antes de expirar
      detectSessionInUrl: true,  // pra magic links / OAuth se um dia usar
    },
  }
);
