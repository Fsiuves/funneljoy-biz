import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://sjspfkzxyfipuamvbswd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqc3Bma3p4eWZpcHVhbXZic3dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODE4MzUsImV4cCI6MjA4NDI1NzgzNX0.UtQNcAlgxuVndCfeay2nRQW9xi4MbblzKGXwXED5xpQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
