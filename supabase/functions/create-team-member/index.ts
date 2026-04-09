import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "not_authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with caller's token to verify identity
    const supabaseCaller = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: callerError } = await supabaseCaller.auth.getUser();
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "not_authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, name, password, role } = await req.json();

    // Admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Step 1: Validate via RPC (uses caller's context)
    const { data: validation, error: validationError } = await supabaseCaller.rpc("invite_team_member", {
      _email: email,
      _name: name,
      _role: role || "sales",
    });

    if (validationError) {
      return new Response(JSON.stringify({ error: validationError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validationResult = validation as { success: boolean; error?: string };
    if (!validationResult.success) {
      return new Response(JSON.stringify({ error: validationResult.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Create user via Admin API (does NOT affect caller's session)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!newUser.user) {
      return new Response(JSON.stringify({ error: "failed_to_create_user" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Complete setup (profile + role) via RPC with caller's context
    const { data: setupResult, error: setupError } = await supabaseCaller.rpc("complete_team_member_setup", {
      _user_id: newUser.user.id,
      _email: email,
      _name: name,
      _role: role || "sales",
    });

    if (setupError) {
      return new Response(JSON.stringify({ error: setupError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const setup = setupResult as { success: boolean; error?: string };
    if (!setup.success) {
      return new Response(JSON.stringify({ error: setup.error || "setup_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, user_id: newUser.user.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
