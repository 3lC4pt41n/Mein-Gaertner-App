import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://hqyrcmohlvmyqafadrte.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxeXJjbW9obHZteXFhZmFkcnRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEwMjQ0ODYsImV4cCI6MjA2NjYwMDQ4Nn0.zdAuOMVE_6sBam9QtToGBQgbguwJZH9HGmTABpHkWDg';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);