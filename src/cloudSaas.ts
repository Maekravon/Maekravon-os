import { supabase } from "./lib";

export type WorkspaceNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  targetId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type WorkspaceInvitation = {
  id: string;
  email: string;
  role: "admin" | "manager" | "member";
  status: string;
  createdAt: string;
  expiresAt: string;
};

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function loadWorkspaceNotifications(workspaceId: string): Promise<WorkspaceNotification[]> {
  const db = client();
  const { data: authData, error: authError } = await db.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("Please sign in to view notifications.");
  const { data, error } = await db
    .from("workspace_notifications")
    .select("id, kind, title, body, target_id, read_at, created_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", authData.user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data || []).map(item => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    body: item.body,
    targetId: item.target_id,
    readAt: item.read_at,
    createdAt: item.created_at,
  }));
}

export async function markWorkspaceNotificationRead(notificationId: string): Promise<void> {
  const { error } = await client().rpc("mark_workspace_notification_read", {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}

async function invokeMemberAction(body: Record<string, unknown>) {
  const { data, error } = await client().functions.invoke("manage-members", { body });
  if (error) {
    const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
    if (context?.json) {
      try {
        const detail = await context.json() as { error?: string };
        if (detail?.error) throw new Error(detail.error);
      } catch (inner) {
        if (inner instanceof Error && inner.message !== "Invalid JSON") throw inner;
      }
    }
    throw error;
  }
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export function inviteWorkspaceMember(workspaceId: string, email: string, role: "admin" | "manager" | "member") {
  return invokeMemberAction({ action: "invite", workspaceId, email, role });
}

export function changeWorkspaceMemberRole(workspaceId: string, memberId: string, role: "admin" | "manager" | "member") {
  return invokeMemberAction({ action: "update_role", workspaceId, memberId, role });
}

export function removeWorkspaceMember(workspaceId: string, memberId: string) {
  return invokeMemberAction({ action: "remove", workspaceId, memberId });
}

export function revokeWorkspaceInvitation(workspaceId: string, invitationId: string) {
  return invokeMemberAction({ action: "revoke_invitation", workspaceId, invitationId });
}
