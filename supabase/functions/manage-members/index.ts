import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json(500, { error: "Server environment is incomplete." });

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json(401, { error: "Sign in is required." });
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData.user) return json(401, { error: "Your session is invalid or expired." });
  const user = authData.user;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let payload: { action?: string; workspaceId?: string; email?: string; role?: string; memberId?: string; invitationId?: string };
  try { payload = await req.json(); } catch { return json(400, { error: "Invalid JSON request." }); }
  const { action, workspaceId } = payload;
  if (!workspaceId || typeof workspaceId !== "string") return json(400, { error: "Workspace ID is required." });

  const { data: actor, error: actorError } = await admin.from("workspace_members")
    .select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (actorError || !actor) return json(403, { error: "You are not a member of this workspace." });
  const actorRole = String(actor.role);

  const canManage = (targetRole: string, assignedRole?: string) => {
    if (actorRole === "owner") return targetRole !== "owner" && (!assignedRole || assignedRole !== "owner");
    if (actorRole === "admin") return ["manager", "member"].includes(targetRole) && (!assignedRole || ["manager", "member"].includes(assignedRole));
    if (actorRole === "manager") return targetRole === "member" && (!assignedRole || assignedRole === "member");
    return false;
  };

  if (action === "invite") {
    const email = String(payload.email || "").trim().toLowerCase();
    const role = String(payload.role || "member");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "Enter a valid email address." });
    if (!["admin", "manager", "member"].includes(role) || !canManage(role)) return json(403, { error: "Your role cannot invite someone with that access level." });

    const { data: existingMember } = await admin.from("workspace_members").select("id")
      .eq("workspace_id", workspaceId).ilike("email", email).maybeSingle();
    if (existingMember) return json(409, { error: "That email already belongs to this workspace." });
    const { data: existingInvite } = await admin.from("workspace_invitations").select("id")
      .eq("workspace_id", workspaceId).ilike("email", email).eq("status", "pending").maybeSingle();
    if (existingInvite) return json(409, { error: "A pending invitation already exists for that email." });

    const { data: invitation, error: invitationError } = await admin.from("workspace_invitations").insert({
      workspace_id: workspaceId, email, role, invited_by: user.id,
    }).select("id").single();
    if (invitationError || !invitation) return json(400, { error: invitationError?.message || "Could not create invitation." });

    const redirectTo = Deno.env.get("NEXORA_APP_URL") || "http://localhost:5173";
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { workspace_invitation_id: invitation.id },
      redirectTo,
    });
    if (inviteError || !inviteData.user) {
      await admin.from("workspace_invitations").delete().eq("id", invitation.id);
      return json(400, { error: inviteError?.message || "Supabase did not return an invited user." });
    }
    const { error: updateError } = await admin.from("workspace_invitations")
      .update({ invited_user_id: inviteData.user.id }).eq("id", invitation.id);
    if (updateError) return json(500, { error: "Invitation email was sent but its workspace link could not be saved. Contact the workspace owner." });
    return json(200, { success: true, invitationId: invitation.id, message: `Invitation sent to ${email}.` });
  }

  if (action === "update_role") {
    const memberId = String(payload.memberId || "");
    const role = String(payload.role || "");
    if (!["admin", "manager", "member"].includes(role) || !memberId) return json(400, { error: "A valid member and role are required." });
    const { data: target, error: targetError } = await admin.from("workspace_members").select("id,user_id,role")
      .eq("workspace_id", workspaceId).eq("id", memberId).maybeSingle();
    if (targetError || !target) return json(404, { error: "Workspace member not found." });
    if (target.user_id === user.id) return json(400, { error: "You cannot change your own role." });
    if (!canManage(String(target.role), role)) return json(403, { error: "Your role cannot change this member's access." });
    const { error } = await admin.from("workspace_members").update({ role }).eq("id", memberId).eq("workspace_id", workspaceId);
    if (error) return json(400, { error: error.message });
    return json(200, { success: true, message: "Member role updated." });
  }

  if (action === "remove") {
    const memberId = String(payload.memberId || "");
    const { data: target, error: targetError } = await admin.from("workspace_members").select("id,user_id,role")
      .eq("workspace_id", workspaceId).eq("id", memberId).maybeSingle();
    if (targetError || !target) return json(404, { error: "Workspace member not found." });
    if (target.user_id === user.id) return json(400, { error: "You cannot remove your own workspace access." });
    if (!canManage(String(target.role))) return json(403, { error: "Your role cannot remove this member." });
    const { error } = await admin.from("workspace_members").delete().eq("id", memberId).eq("workspace_id", workspaceId);
    if (error) return json(400, { error: error.message });
    return json(200, { success: true, message: "Member removed from this workspace." });
  }

  if (action === "revoke_invitation") {
    const invitationId = String(payload.invitationId || "");
    const { data: invite, error: inviteError } = await admin.from("workspace_invitations").select("id,role,status")
      .eq("workspace_id", workspaceId).eq("id", invitationId).maybeSingle();
    if (inviteError || !invite) return json(404, { error: "Invitation not found." });
    if (invite.status !== "pending") return json(400, { error: "Only pending invitations can be revoked." });
    if (!canManage(String(invite.role))) return json(403, { error: "Your role cannot revoke this invitation." });
    const { error } = await admin.from("workspace_invitations").update({ status: "revoked" }).eq("id", invitationId);
    if (error) return json(400, { error: error.message });
    return json(200, { success: true, message: "Invitation revoked." });
  }

  return json(400, { error: "Unknown team action." });
});
