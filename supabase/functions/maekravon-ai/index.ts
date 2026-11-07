import OpenAI from "npm:openai";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json(401, { error: "Sign in to use MAEKRAVON AI." });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY") || "";
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-6.1-terra";

    if (!supabaseUrl || !supabaseAnonKey) return json(500, { error: "Supabase Edge Function environment is incomplete." });
    if (!openaiApiKey) return json(503, { error: "MAEKRAVON AI is not connected yet. Add the OPENAI_API_KEY Edge Function secret." });

    const body = await request.json();
    const workspaceId = String(body?.workspaceId || "");
    const question = String(body?.question || "").trim();
    const context = body?.context || {};

    if (!workspaceId || !question) return json(400, { error: "workspaceId and question are required." });
    if (question.length > 4000) return json(400, { error: "Question is too long." });

    const db = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });

    const { data: membership, error: membershipError } = await db
      .from("workspace_members")
      .select("id, role")
      .eq("workspace_id", workspaceId)
      .limit(1)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) return json(403, { error: "You do not have access to this workspace." });

    const compactContext = {
      businessName: context.businessName,
      monthlyGoal: context.monthlyGoal,
      leads: Array.isArray(context.leads) ? context.leads.slice(0, 150) : [],
      followUps: Array.isArray(context.followUps) ? context.followUps.slice(0, 100) : [],
      appointments: Array.isArray(context.appointments) ? context.appointments.slice(0, 100) : [],
      financeTransactions: Array.isArray(context.financeTransactions) ? context.financeTransactions.slice(0, 300) : [],
    };

    const system = `You are MAEKRAVON AI, an operator-focused business finance and growth copilot for small and growing businesses.
You receive structured data from one authorized workspace. Use only the supplied workspace data for factual claims about this business.
Your job is to help the owner understand cash flow, revenue, expenses, pipeline, customers, follow-ups, operational risks, and growth opportunities.
Prioritize concrete next actions. Show arithmetic when it materially helps. Separate observed facts from estimates and recommendations.
Never claim that CRM deal values are cash in the bank. Never invent bank balances, tax obligations, invoices, debts, or transactions that are not in the data.
For legal, tax, investment, lending, or regulated financial decisions, provide general planning guidance and state when a licensed professional should verify the decision.
Keep most answers under 500 words unless the user explicitly asks for depth.`;

    const openai = new OpenAI({ apiKey: openaiApiKey });
    const response = await openai.responses.create({
      model,
      instructions: system,
      input: [
        {
          role: "user",
          content: `WORKSPACE DATA\n${JSON.stringify(compactContext)}\n\nUSER QUESTION\n${question}`,
        },
      ],
    });

    return json(200, { answer: response.output_text, model });
  } catch (error) {
    console.error(error);
    return json(500, { error: error instanceof Error ? error.message : "MAEKRAVON AI request failed." });
  }
});
