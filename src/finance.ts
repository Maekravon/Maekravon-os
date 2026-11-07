import { supabase } from "./lib";

export type FinanceTransactionKind = "income" | "expense";
export type FinanceTransactionSource = "manual" | "import" | "bank" | "invoice";

export type FinanceTransaction = {
  id: string;
  kind: FinanceTransactionKind;
  amount: number;
  category: string;
  description: string;
  date: string;
  recurring: boolean;
  source: FinanceTransactionSource;
  createdAt: string;
};

export type FinanceTransactionInput = Omit<FinanceTransaction, "id" | "createdAt" | "source"> & {
  source?: FinanceTransactionSource;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function mapRow(row: Record<string, unknown>): FinanceTransaction {
  return {
    id: String(row.legacy_id || `CLOUD-${row.id}`),
    kind: row.kind === "expense" ? "expense" : "income",
    amount: Number(row.amount) || 0,
    category: String(row.category || "Uncategorized"),
    description: String(row.description || ""),
    date: String(row.transaction_date || "").slice(0, 10),
    recurring: Boolean(row.recurring),
    source: (["manual", "import", "bank", "invoice"] as const).includes(row.source as FinanceTransactionSource)
      ? row.source as FinanceTransactionSource
      : "manual",
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export async function loadFinanceTransactions(workspaceId: string): Promise<FinanceTransaction[]> {
  const { data, error } = await client()
    .from("finance_transactions")
    .select("id, legacy_id, kind, amount, category, description, transaction_date, recurring, source, created_at")
    .eq("workspace_id", workspaceId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []).map(row => mapRow(row as Record<string, unknown>));
}

export async function createFinanceTransaction(
  workspaceId: string,
  input: FinanceTransactionInput,
): Promise<FinanceTransaction> {
  const db = client();
  const { data: authData, error: authError } = await db.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("Please sign in to add financial activity.");

  const legacyId = `FIN-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
  const { data, error } = await db
    .from("finance_transactions")
    .insert({
      workspace_id: workspaceId,
      legacy_id: legacyId,
      kind: input.kind,
      amount: Math.max(0, Number(input.amount) || 0),
      category: input.category.trim() || "Uncategorized",
      description: input.description.trim(),
      transaction_date: input.date,
      recurring: input.recurring,
      source: input.source || "manual",
      created_by: authData.user.id,
    })
    .select("id, legacy_id, kind, amount, category, description, transaction_date, recurring, source, created_at")
    .single();

  if (error) throw error;
  return mapRow(data as Record<string, unknown>);
}

export async function deleteFinanceTransaction(workspaceId: string, transactionId: string): Promise<void> {
  const db = client();
  let query = db
    .from("finance_transactions")
    .delete()
    .eq("workspace_id", workspaceId);

  query = transactionId.startsWith("CLOUD-")
    ? query.eq("id", transactionId.slice("CLOUD-".length))
    : query.eq("legacy_id", transactionId);

  const { error } = await query;
  if (error) throw error;
}
