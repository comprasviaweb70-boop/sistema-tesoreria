require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('FALTAN credenciales de Supabase en .env (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY)');
}

const customSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

module.exports = { customSupabaseClient };
