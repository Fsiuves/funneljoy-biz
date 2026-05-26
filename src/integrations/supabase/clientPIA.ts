import { createClient } from '@supabase/supabase-js';

const SUPABASE_PIA_URL = "https://sjspfkzxyfipuamvbswd.supabase.co";
const SUPABASE_PIA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqc3Bma3p4eWZpcHVhbXZic3dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2ODE4MzUsImV4cCI6MjA4NDI1NzgzNX0.UtQNcAlgxuVndCfeay2nRQW9xi4MbblzKGXwXED5xpQ";

export const supabasePIA = createClient(SUPABASE_PIA_URL, SUPABASE_PIA_KEY);