import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Check if valid production credentials exist
export const isConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseAnonKey.includes('placeholder')
);

// In production, isDemoMode is strictly false unless explicitly set to 'true'
export const isDemoMode = import.meta.env.VITE_USE_MOCK_DATA === 'true';

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
