import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://hqyrcmohlvmyqafadrte.supabase.co';
const SUPABASE_ANON_KEY = '<SUPABASE-ANON-KEY-REDACTED>';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);