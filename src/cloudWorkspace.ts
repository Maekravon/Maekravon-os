import { supabase } from "./lib";

export type WorkspaceFollowUp = {
  id: string;
  title: string;
  leadId: string;
  dueDate: string;
  priority: "Low" | "Normal" | "High";
  done: boolean;
  createdAt: string;
};

export type WorkspaceAppointment = {
  id: string;
  title: string;
  leadId: string;
  date: string;
  time: string;
  notes: string;
  done: boolean;
  createdAt: string;
};

export type WorkspaceAutomationSettings = {
  newLeadTask: boolean;
  qualifiedTask: boolean;
  appointmentAlerts: boolean;
};

export type WorkspacePreferences = {
  businessName: string;
  ownerName: string;
  monthlyGoal: string;
  currency: string;
  timezone: string;
};

export type WorkspaceTeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "Active";
};

export type CloudWorkspaceSnapshot = {
  followUps: WorkspaceFollowUp[];
  appointments: WorkspaceAppointment[];
  automationSettings: WorkspaceAutomationSettings | null;
  workspaceSettings: WorkspacePreferences | null;
  teamMembers: WorkspaceTeamMember[];
  pendingInvitations: import("./cloudSaas").WorkspaceInvitation[];
};

export type WorkspaceSyncInput = {
  followUps: WorkspaceFollowUp[];
  appointments: WorkspaceAppointment[];
  automationSettings: WorkspaceAutomationSettings;
  workspaceSettings: WorkspacePreferences;
};

function getClient() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function normalizeDate(value: string | null | undefined): string {
  return value ? String(value).slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function normalizeTime(value: string | null | undefined): string {
  return value ? String(value).slice(0, 5) : "09:00";
}

function roleLabel(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Member";
}

export async function loadCloudWorkspace(
  workspaceId: string
): Promise<CloudWorkspaceSnapshot> {
  const client = getClient();

  const [followUpResult, appointmentResult, automationResult, settingsResult, memberResult, invitationResult, leadResult] =
    await Promise.all([
      client
        .from("follow_up_tasks")
        .select("id, legacy_id, lead_id, title, due_date, priority, done, created_at")
        .eq("workspace_id", workspaceId)
        .order("due_date", { ascending: true }),
      client
        .from("appointments")
        .select("id, legacy_id, lead_id, title, appointment_date, appointment_time, notes, done, created_at")
        .eq("workspace_id", workspaceId)
        .order("appointment_date", { ascending: true }),
      client
        .from("workspace_automation_settings")
        .select("new_lead_task, qualified_task, appointment_alerts")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      client
        .from("workspace_settings")
        .select("business_name, owner_name, monthly_goal, currency, timezone")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      client
        .from("workspace_members")
        .select("id, full_name, role, email")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true }),
      client
        .from("workspace_invitations")
        .select("id, email, role, status, created_at, expires_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      client
        .from("leads")
        .select("id, legacy_id")
        .eq("workspace_id", workspaceId),
    ]);

  for (const result of [followUpResult, appointmentResult, automationResult, settingsResult, memberResult, invitationResult, leadResult]) {
    if (result.error) throw result.error;
  }

  const leadIds = new Map<string, string>();
  for (const lead of leadResult.data || []) {
    const displayId = lead.legacy_id || `CLOUD-${lead.id}`;
    leadIds.set(lead.id, displayId);
    leadIds.set(displayId, lead.id);
  }

  const followUps: WorkspaceFollowUp[] = (followUpResult.data || []).map(item => ({
    id: item.legacy_id || `CLOUD-${item.id}`,
    title: item.title,
    leadId: item.lead_id ? (leadIds.get(item.lead_id) || "") : "",
    dueDate: normalizeDate(item.due_date),
    priority: item.priority as WorkspaceFollowUp["priority"],
    done: Boolean(item.done),
    createdAt: item.created_at,
  }));

  const appointments: WorkspaceAppointment[] = (appointmentResult.data || []).map(item => ({
    id: item.legacy_id || `CLOUD-${item.id}`,
    title: item.title,
    leadId: item.lead_id ? (leadIds.get(item.lead_id) || "") : "",
    date: normalizeDate(item.appointment_date),
    time: normalizeTime(item.appointment_time),
    notes: item.notes || "",
    done: Boolean(item.done),
    createdAt: item.created_at,
  }));

  const automationRow = automationResult.data;
  const settingsRow = settingsResult.data;

  return {
    followUps,
    appointments,
    automationSettings: automationRow ? {
      newLeadTask: Boolean(automationRow.new_lead_task),
      qualifiedTask: Boolean(automationRow.qualified_task),
      appointmentAlerts: Boolean(automationRow.appointment_alerts),
    } : null,
    workspaceSettings: settingsRow ? {
      businessName: settingsRow.business_name,
      ownerName: settingsRow.owner_name,
      monthlyGoal: String(settingsRow.monthly_goal ?? 10000),
      currency: settingsRow.currency,
      timezone: settingsRow.timezone,
    } : null,
    teamMembers: (memberResult.data || []).map(member => ({
      id: member.id,
      name: member.full_name,
      email: member.email || "",
      role: roleLabel(member.role),
      status: "Active" as const,
    })),
    pendingInvitations: (invitationResult.data || []).map(invitation => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role as "admin" | "manager" | "member",
      status: invitation.status,
      createdAt: invitation.created_at,
      expiresAt: invitation.expires_at,
    })),
  };
}

export async function syncCloudWorkspace(
  workspaceId: string,
  input: WorkspaceSyncInput
): Promise<{ followUpsSynced: number; appointmentsSynced: number }> {
  const client = getClient();

  const { data: leadRows, error: leadError } = await client
    .from("leads")
    .select("id, legacy_id")
    .eq("workspace_id", workspaceId);
  if (leadError) throw leadError;

  const leadIdMap = new Map<string, string>();
  for (const lead of leadRows || []) {
    leadIdMap.set(lead.id, lead.id);
    if (lead.legacy_id) leadIdMap.set(lead.legacy_id, lead.id);
  }

  const resolveLeadId = (leadId: string): string | null => {
    if (!leadId) return null;
    const direct = leadId.startsWith("CLOUD-") ? leadId.slice("CLOUD-".length) : leadId;
    return leadIdMap.get(leadId) || leadIdMap.get(direct) || null;
  };

  const followUpRecord = (task: WorkspaceFollowUp) => ({
    workspace_id: workspaceId,
    legacy_id: task.id.startsWith("CLOUD-") ? null : task.id,
    lead_id: resolveLeadId(task.leadId),
    title: task.title,
    due_date: task.dueDate,
    priority: task.priority,
    done: task.done,
    created_at: task.createdAt || new Date().toISOString(),
  });

  for (const task of input.followUps.filter(item => item.id.startsWith("CLOUD-"))) {
    const databaseId = task.id.slice("CLOUD-".length);
    const { error } = await client
      .from("follow_up_tasks")
      .update(followUpRecord(task))
      .eq("id", databaseId)
      .eq("workspace_id", workspaceId);
    if (error) throw error;
  }

  const localFollowUps = input.followUps.filter(item => !item.id.startsWith("CLOUD-"));
  if (localFollowUps.length) {
    const { error } = await client
      .from("follow_up_tasks")
      .upsert(localFollowUps.map(followUpRecord), { onConflict: "workspace_id,legacy_id" });
    if (error) throw error;
  }

  const appointmentRecord = (item: WorkspaceAppointment) => ({
    workspace_id: workspaceId,
    legacy_id: item.id.startsWith("CLOUD-") ? null : item.id,
    lead_id: resolveLeadId(item.leadId),
    title: item.title,
    appointment_date: item.date,
    appointment_time: item.time.length === 5 ? `${item.time}:00` : item.time,
    notes: item.notes || "",
    done: item.done,
    created_at: item.createdAt || new Date().toISOString(),
  });

  for (const item of input.appointments.filter(entry => entry.id.startsWith("CLOUD-"))) {
    const databaseId = item.id.slice("CLOUD-".length);
    const { error } = await client
      .from("appointments")
      .update(appointmentRecord(item))
      .eq("id", databaseId)
      .eq("workspace_id", workspaceId);
    if (error) throw error;
  }

  const localAppointments = input.appointments.filter(item => !item.id.startsWith("CLOUD-"));
  if (localAppointments.length) {
    const { error } = await client
      .from("appointments")
      .upsert(localAppointments.map(appointmentRecord), { onConflict: "workspace_id,legacy_id" });
    if (error) throw error;
  }

  const { error: settingsError } = await client
    .from("workspace_settings")
    .upsert({
      workspace_id: workspaceId,
      business_name: input.workspaceSettings.businessName || "My Workspace",
      owner_name: input.workspaceSettings.ownerName || "Workspace Owner",
      monthly_goal: Math.max(0, Number(input.workspaceSettings.monthlyGoal) || 0),
      currency: input.workspaceSettings.currency || "USD",
      timezone: input.workspaceSettings.timezone || "America/Chicago",
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id" });
  if (settingsError) throw settingsError;

  const { error: automationError } = await client
    .from("workspace_automation_settings")
    .upsert({
      workspace_id: workspaceId,
      new_lead_task: input.automationSettings.newLeadTask,
      qualified_task: input.automationSettings.qualifiedTask,
      appointment_alerts: input.automationSettings.appointmentAlerts,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id" });
  if (automationError) throw automationError;

  return {
    followUpsSynced: input.followUps.length,
    appointmentsSynced: input.appointments.length,
  };
}
