import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const configured = !!url && !!anon && !url.includes('your_supabase')

/**
 * Cliente de Supabase (navegador). Es `null` si aún no configuras las claves
 * en .env.local — así la app sigue funcionando en modo demo hasta que conectes.
 */
export const supabase: SupabaseClient | null = configured
  ? createClient(url!, anon!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null

export const isSupabaseReady = configured
