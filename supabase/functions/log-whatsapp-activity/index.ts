import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: jsonHeaders,
      });
    }

    const secret = Deno.env.get("WHATSAPP_LOG_WEBHOOK_SECRET");
    const providedSecret = req.headers.get("x-webhook-secret");
    if (!secret || providedSecret !== secret) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    let body: { telefone?: string; mensagem?: string; direction?: string; nome?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const { telefone, mensagem, direction, nome } = body ?? {};
    if (
      typeof telefone !== "string" ||
      typeof mensagem !== "string" ||
      (direction !== "in" && direction !== "out")
    ) {
      return new Response(JSON.stringify({ error: "invalid_body" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const digits = telefone.replace(/\D/g, "");
    if (digits.length < 8) {
      return new Response(JSON.stringify({ matched: false }), {
        status: 200,
        headers: jsonHeaders,
      });
    }
    const last11 = digits.slice(-11);
    const last10 = digits.slice(-10);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Match by suffix (last 10 or 11 digits) of the stored phone
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from("leads")
      .select("id, phone, tenant_id");

    if (leadsError) {
      return new Response(
        JSON.stringify({ error: "lead_lookup_failed", details: leadsError.message }),
        { status: 500, headers: jsonHeaders },
      );
    }

    let lead = (leads ?? []).find((l) => {
      const leadDigits = (l.phone ?? "").replace(/\D/g, "");
      if (!leadDigits) return false;
      const leadLast11 = leadDigits.slice(-11);
      const leadLast10 = leadDigits.slice(-10);
      return (
        leadLast11 === last11 ||
        leadLast10 === last10 ||
        leadLast11 === last10 ||
        leadLast10 === last11
      );
    });

    let createdLead = false;
    if (!lead) {
      // No matching lead: auto-create one under a "default" tenant.
      // Strategy: use the tenant_id of the most recently created existing lead
      // as the automation's default tenant. This works because the CRM is
      // effectively single-tenant per automation deployment (the n8n workflow
      // is wired to one company's WhatsApp instance), and it avoids requiring
      // an env-var/config change every time. If no leads exist at all, fall
      // back to the tenant of the most recently created profile.
      let defaultTenantId: string | null = null;
      const { data: recentLead } = await supabaseAdmin
        .from("leads")
        .select("tenant_id")
        .not("tenant_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      defaultTenantId = recentLead?.tenant_id ?? null;
      if (!defaultTenantId) {
        const { data: recentProfile } = await supabaseAdmin
          .from("profiles")
          .select("tenant_id")
          .not("tenant_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        defaultTenantId = recentProfile?.tenant_id ?? null;
      }
      if (!defaultTenantId) {
        return new Response(
          JSON.stringify({ error: "no_default_tenant" }),
          { status: 500, headers: jsonHeaders },
        );
      }

      const formattedPhone = digits;
      const leadName = (typeof nome === "string" && nome.trim().length > 0)
        ? nome.trim()
        : formattedPhone;

      const { data: newLead, error: newLeadError } = await supabaseAdmin
        .from("leads")
        .insert({
          name: leadName,
          phone: formattedPhone,
          source: "other",
          stage: "new",
          tenant_id: defaultTenantId,
        })
        .select("id, phone, tenant_id")
        .single();

      if (newLeadError || !newLead) {
        return new Response(
          JSON.stringify({ error: "lead_insert_failed", details: newLeadError?.message }),
          { status: 500, headers: jsonHeaders },
        );
      }
      lead = newLead;
      createdLead = true;
    }

    const prefix = direction === "in" ? "[Auto - recebida] " : "[Auto - enviada] ";
    const description = prefix + mensagem;

    const { data: activity, error: activityError } = await supabaseAdmin
      .from("activities")
      .insert({
        lead_id: lead.id,
        tenant_id: lead.tenant_id,
        type: "whatsapp",
        description,
        created_by: null,
      })
      .select("id")
      .single();

    if (activityError) {
      return new Response(
        JSON.stringify({ error: "activity_insert_failed", details: activityError.message }),
        { status: 500, headers: jsonHeaders },
      );
    }

    return new Response(
      JSON.stringify({ matched: true, created: createdLead, lead_id: lead.id, activity_id: activity.id }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "internal_error", details: String(err) }),
      { status: 500, headers: jsonHeaders },
    );
  }
});