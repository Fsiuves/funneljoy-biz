import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Entrada de leads da landing page domintelligence.com, chamada só pelo n8n
// (workflow "DOM • Diagnostico (Landing Page)"). Grava sempre no tenant DOM.
const DOM_TENANT_ID = "6ce1fd3f-38fa-4c6c-93bd-bb22a42ad16d";
const DOM_OWNER_ID = "41f46308-2ed7-4b16-8682-987cc1b282c2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("LEAD_SITE_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = texto(body.name, 200);
  const phone = texto(body.phone, 20).replace(/\D/g, "");
  const email = texto(body.email, 255);
  const company = texto(body.company, 200);
  const notes = texto(body.notes, 4000);

  if (name.length < 2 || phone.length < 10) return json({ error: "invalid_body" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "crm" } },
  );

  const { data, error } = await admin
    .from("leads")
    .insert({
      name,
      phone,
      email: email || null,
      company: company || null,
      notes: notes || null,
      source: "website",
      stage: "new",
      tenant_id: DOM_TENANT_ID,
      created_by: DOM_OWNER_ID,
    })
    .select("id")
    .single();

  if (error) return json({ error: "insert_failed", details: error.message }, 500);
  return json({ id: data.id });
});
