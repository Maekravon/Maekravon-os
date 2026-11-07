import { supabase } from "./lib";

export type CloudActivity = {
  id: string;
  kind: "created" | "note" | "status" | "updated";
  text: string;
  createdAt: string;
};

export type CloudLead = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  service: string;
  value: number;
  status: "New" | "Contacted" | "Qualified" | "Won" | "Lost";
  source: "Website" | "Referral" | "Social Media" | "Phone" | "Walk-in" | "Other";
  createdAt: string;
  activities: CloudActivity[];
};

function getClient() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function leadFields(lead: CloudLead) {
  return {
    name: lead.name,
    company: lead.company || "",
    email: lead.email || "",
    phone: lead.phone || "",
    service: lead.service || "",
    value: lead.value || 0,
    status: lead.status,
    source: lead.source,
    lead_created_on: lead.createdAt
  };
}

export async function loadCloudLeads(
  workspaceId: string
): Promise<CloudLead[]> {
  const client = getClient();

  const { data: leadRows, error: leadError } = await client
    .from("leads")
    .select("id, legacy_id, name, company, email, phone, service, value, status, source, lead_created_on")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (leadError) throw leadError;

  const { data: activityRows, error: activityError } = await client
    .from("lead_activities")
    .select("id, legacy_id, lead_id, kind, body, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (activityError) throw activityError;

  const activityMap = new Map<string, CloudActivity[]>();

  for (const item of activityRows || []) {
    const current = activityMap.get(item.lead_id) || [];
    current.push({
      id: item.legacy_id || `CLOUD-${item.id}`,
      kind: item.kind as CloudActivity["kind"],
      text: item.body,
      createdAt: item.created_at
    });
    activityMap.set(item.lead_id, current);
  }

  return (leadRows || []).map(lead => ({
    id: lead.legacy_id || `CLOUD-${lead.id}`,
    name: lead.name,
    company: lead.company,
    email: lead.email,
    phone: lead.phone,
    service: lead.service,
    value: Number(lead.value) || 0,
    status: lead.status as CloudLead["status"],
    source: lead.source as CloudLead["source"],
    createdAt: lead.lead_created_on,
    activities: activityMap.get(lead.id) || []
  }));
}

export async function syncCloudLeads(
  workspaceId: string,
  leads: CloudLead[]
): Promise<{ leadsSynced: number; activitiesSynced: number }> {
  const client = getClient();

  const {
    data: { user },
    error: userError
  } = await client.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("You must be signed in.");

  const localLeads = leads.filter(lead => !lead.id.startsWith("CLOUD-"));
  const existingCloudLeads = leads.filter(lead => lead.id.startsWith("CLOUD-"));

  for (const lead of existingCloudLeads) {
    const databaseId = lead.id.slice("CLOUD-".length);
    const { error } = await client
      .from("leads")
      .update(leadFields(lead))
      .eq("id", databaseId)
      .eq("workspace_id", workspaceId);

    if (error) throw error;
  }

  if (localLeads.length > 0) {
    const records = localLeads.map(lead => ({
      workspace_id: workspaceId,
      legacy_id: lead.id,
      ...leadFields(lead)
    }));

    const { error } = await client
      .from("leads")
      .upsert(records, {
        onConflict: "workspace_id,legacy_id"
      });

    if (error) throw error;
  }

  const { data: cloudRows, error: cloudError } = await client
    .from("leads")
    .select("id, legacy_id")
    .eq("workspace_id", workspaceId);

  if (cloudError) throw cloudError;

  const idMap = new Map<string, string>();

  for (const row of cloudRows || []) {
    if (row.legacy_id) idMap.set(row.legacy_id, row.id);
  }

  const { data: oldActivities, error: oldActivityError } = await client
    .from("lead_activities")
    .select("legacy_id")
    .eq("workspace_id", workspaceId)
    .not("legacy_id", "is", null);

  if (oldActivityError) throw oldActivityError;

  const existingActivityIds = new Set(
    (oldActivities || []).map(item => item.legacy_id)
  );

  const activityRecords = leads.flatMap(lead => {
    const databaseLeadId = lead.id.startsWith("CLOUD-")
      ? lead.id.slice("CLOUD-".length)
      : idMap.get(lead.id);

    if (!databaseLeadId) {
      throw new Error(`Could not locate cloud lead ${lead.id}.`);
    }

    return lead.activities
      .filter(activity =>
        !activity.id.startsWith("CLOUD-") &&
        !existingActivityIds.has(activity.id)
      )
      .map(activity => ({
        workspace_id: workspaceId,
        lead_id: databaseLeadId,
        legacy_id: activity.id,
        kind: activity.kind,
        body: activity.text,
        created_by: user.id,
        created_at: activity.createdAt
      }));
  });

  if (activityRecords.length > 0) {
    const { error } = await client
      .from("lead_activities")
      .insert(activityRecords);

    if (error) throw error;
  }

  return {
    leadsSynced: leads.length,
    activitiesSynced: activityRecords.length
  };
}

export async function importLocalLeads(
  workspaceId: string,
  leads: CloudLead[]
): Promise<{ leadsImported: number; activitiesImported: number }> {
  const result = await syncCloudLeads(workspaceId, leads);

  return {
    leadsImported: result.leadsSynced,
    activitiesImported: result.activitiesSynced
  };
}


export async function deleteCloudLead(
  workspaceId: string,
  leadId: string
): Promise<void> {
  const client = getClient();

  const query = client
    .from("leads")
    .delete()
    .eq("workspace_id", workspaceId);

  const { data, error } = leadId.startsWith("CLOUD-")
    ? await query
        .eq("id", leadId.slice("CLOUD-".length))
        .select("id")
    : await query
        .eq("legacy_id", leadId)
        .select("id");

  if (error) throw error;

  if (!data || data.length === 0) {
    throw new Error(
      "Lead could not be deleted. Only workspace owners or admins can delete leads."
    );
  }


}
