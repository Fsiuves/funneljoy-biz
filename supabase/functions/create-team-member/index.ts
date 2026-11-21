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

    // Client with caller's token to verify identity. As RPCs moram no schema
    // crm desde a migração: sem o schema, o PostgREST procura em public e falha.
    const supabaseCaller = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      db: { schema: "crm" },
    });

    const { data: { user: caller }, error: callerError } = await supabaseCaller.auth.getUser();
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "not_authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, name, password, role, unidade } = await req.json();

    // Admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Step 1: Validate via RPC (uses caller's context)
    // A unidade vai já no convite: as regras da gerente e da atendente são
    // conferidas antes de a conta existir, para não sobrar conta órfã.
    const { data: validation, error: validationError } = await supabaseCaller.rpc("invite_team_member", {
      _email: email,
      _name: name,
      _role: role || "sales",
      _unidade: unidade || null,
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
    let userId: string;

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // Senha escolhida por quem cadastrou: a pessoa cria a dela no primeiro acesso.
      user_metadata: { name, senha_provisoria: true },
    });

    if (createError) {
      // Conta que já existe não é puxada para a empresa de quem cadastra
      // (auditoria de 21/11/2026): era o caminho para tomar a conta de outra
      // pessoa e trocar a senha dela. Quem já tem conta entra pelo suporte.
      const codigo = createError.message.includes("already been registered") ? "conta_existente" : createError.message;
      return new Response(JSON.stringify({ error: codigo }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (!newUser.user) {
      return new Response(JSON.stringify({ error: "failed_to_create_user" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      userId = newUser.user.id;
    }

    // Cadastro que não terminou não deixa conta solta: o e-mail ficaria preso,
    // porque conta que já existe não entra mais pela equipe.
    const desfazerConta = () => supabaseAdmin.auth.admin.deleteUser(userId).catch(() => null);

    // Step 3: Complete setup (profile + role) via RPC with caller's context
    const { data: setupResult, error: setupError } = await supabaseCaller.rpc("complete_team_member_setup", {
      _user_id: userId,
      _email: email,
      _name: name,
      _role: role || "sales",
      _unidade: unidade || null,
    });

    if (setupError) {
      await desfazerConta();
      return new Response(JSON.stringify({ error: setupError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const setup = setupResult as { success: boolean; error?: string };
    if (!setup.success) {
      await desfazerConta();
      return new Response(JSON.stringify({ error: setup.error || "setup_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
