import { supabase } from "./lib";
import type { FinanceTransaction } from "./finance";

type LeadContext = {
  name: string;
  company: string;
  status: string;
  source: string;
  value: number;
  createdAt: string;
};

type FollowUpContext = { title: string; dueDate: string; priority: string; done: boolean };
type AppointmentContext = { title: string; date: string; time: string; done: boolean };

export type BusinessAssistantContext = {
  businessName: string;
  monthlyGoal: number;
  leads: LeadContext[];
  followUps: FollowUpContext[];
  appointments: AppointmentContext[];
  financeTransactions: FinanceTransaction[];
};

export type AssistantMode = "everyday" | "deep";

export async function askMaekravonAI(
  workspaceId: string,
  question: string,
  context: BusinessAssistantContext,
  mode: AssistantMode = "everyday",
): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.functions.invoke("maekravon-ai", {
    body: { workspaceId, question, context, mode },
  });

  if (error) {
    let detail = error.message || "MAEKRAVON AI request failed.";
    const context = (error as { context?: Response }).context;

    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown; message?: unknown };
        if (payload?.error) detail = String(payload.error);
        else if (payload?.message) detail = String(payload.message);
      } catch {
        try {
          const bodyText = await context.clone().text();
          if (bodyText.trim()) detail = bodyText.trim();
        } catch {
          // Keep the original Supabase error message.
        }
      }
    }

    throw new Error(detail);
  }
  if (data?.error) throw new Error(String(data.error));
  if (!data?.answer) throw new Error("MAEKRAVON AI returned an empty response.");
  return String(data.answer);
}
