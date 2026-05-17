import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const IS_TEST = process.env.NODE_ENV === 'test';
const TEST_SUPABASE_URL = 'https://example.supabase.co';
const TEST_SUPABASE_ANON_KEY = 'test-anon-key';

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || (IS_TEST ? TEST_SUPABASE_URL : '');
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || (IS_TEST ? TEST_SUPABASE_ANON_KEY : '');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
