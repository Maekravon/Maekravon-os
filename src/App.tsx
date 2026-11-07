import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Activity, ArrowUpRight, Bell, Bot, BriefcaseBusiness, CalendarDays,
  CheckCircle2, ChevronDown, CircleHelp, Clock3, Download, Filter,
  FileText, Globe, LayoutDashboard, Mail, MapPin, Menu, MessageSquareText,
  MoreHorizontal, Phone, Plus, Search, Settings, Sparkles, Target,
  TrendingUp, Users, Workflow, X, Zap, Building2, Save, Pencil, UserRound,
  SlidersHorizontal, DollarSign, ReceiptText, Trash2, WalletCards
} from "lucide-react";
import { hasSupabaseConfig } from "./lib";
import { loadCloudLeads, importLocalLeads, syncCloudLeads, deleteCloudLead } from "./cloudLeads";
import { loadCloudWorkspace, syncCloudWorkspace } from "./cloudWorkspace";
import { loadWorkspaceNotifications, markWorkspaceNotificationRead, inviteWorkspaceMember, changeWorkspaceMemberRole, removeWorkspaceMember, revokeWorkspaceInvitation, type WorkspaceNotification, type WorkspaceInvitation } from "./cloudSaas";
import { createFinanceTransaction, deleteFinanceTransaction, loadFinanceTransactions, type FinanceTransaction, type FinanceTransactionInput } from "./finance";
import { askMaekravonAI } from "./ai";

type LeadStatus = "New" | "Contacted" | "Qualified" | "Won" | "Lost";
type LeadSource = "Website" | "Referral" | "Social Media" | "Phone" | "Walk-in" | "Other";
type ActivityKind = "created" | "note" | "status" | "updated";
type ActivityItem = { id: string; kind: ActivityKind; text: string; createdAt: string };
type Lead = {
  id: string; name: string; company: string; email: string; phone: string;
  service: string; value: number; status: LeadStatus; source: LeadSource;
  createdAt: string; activities: ActivityItem[];
};

type LeadForm = {
  name: string; company: string; email: string; phone: string;
  service: string; value: string; source: LeadSource;
};
type FollowUpTask = { id: string; title: string; leadId: string; dueDate: string; priority: "Low" | "Normal" | "High"; done: boolean; createdAt: string };
type Appointment = { id: string; title: string; leadId: string; date: string; time: string; notes: string; done: boolean; createdAt: string };
type AutomationSettings = { newLeadTask: boolean; qualifiedTask: boolean; appointmentAlerts: boolean };
type TeamMember = { id: string; name: string; email: string; role: string; status: "Active" | "Pending" };
type WorkspaceSettings = { businessName: string; ownerName: string; monthlyGoal: string; currency: string; timezone: string };
type AssistantMessage = { id: string; role: "assistant" | "user"; text: string; createdAt: string };
const defaultAutomationSettings: AutomationSettings = { newLeadTask: true, qualifiedTask: true, appointmentAlerts: true };
const defaultWorkspaceSettings: WorkspaceSettings = { businessName: "My Workspace", ownerName: "Workspace Owner", monthlyGoal: "10000", currency: "USD", timezone: "America/Chicago" };
function loadStored<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
}

const seedLeads: Lead[] = [
  { id: "NX-1001", name: "Jordan Mitchell", company: "Summit HVAC", email: "jordan@summithvac.com", phone: "(205) 555-0142", service: "HVAC installation", value: 4200, status: "Qualified", source: "Website", createdAt: "2026-10-28", activities: [{ id: "a-1001", kind: "created", text: "Lead added to the workspace", createdAt: "2026-10-28T09:15:00.000Z" }, { id: "a-1002", kind: "status", text: "Status changed to Qualified", createdAt: "2026-10-29T14:20:00.000Z" }] },
  { id: "NX-1002", name: "Taylor Brooks", company: "Brooks Property Group", email: "taylor@brookspg.com", phone: "(205) 555-0188", service: "Property maintenance", value: 1800, status: "New", source: "Referral", createdAt: "2026-10-29", activities: [{ id: "a-1003", kind: "created", text: "Lead added to the workspace", createdAt: "2026-10-29T10:30:00.000Z" }] },
  { id: "NX-1003", name: "Morgan Reed", company: "Reed Plumbing", email: "morgan@reedplumbing.com", phone: "(205) 555-0109", service: "Plumbing repair", value: 950, status: "Contacted", source: "Phone", createdAt: "2026-10-30", activities: [{ id: "a-1004", kind: "created", text: "Lead added to the workspace", createdAt: "2026-10-30T08:45:00.000Z" }, { id: "a-1005", kind: "status", text: "Status changed to Contacted", createdAt: "2026-10-30T11:10:00.000Z" }] },
  { id: "NX-1004", name: "Casey Parker", company: "Parker Commercial", email: "casey@parkerco.com", phone: "(205) 555-0164", service: "Commercial cleaning", value: 6500, status: "Won", source: "Social Media", createdAt: "2026-10-30", activities: [{ id: "a-1006", kind: "created", text: "Lead added to the workspace", createdAt: "2026-10-30T12:00:00.000Z" }, { id: "a-1007", kind: "status", text: "Status changed to Won", createdAt: "2026-10-30T16:35:00.000Z" }] },
];

const emptyLeadForm: LeadForm = { name: "", company: "", email: "", phone: "", service: "", value: "0", source: "Website" };
const sourceOptions: LeadSource[] = ["Website", "Referral", "Social Media", "Phone", "Walk-in", "Other"];
const statusOptions: LeadStatus[] = ["New", "Contacted", "Qualified", "Won", "Lost"];

const navGroups = [
  { label: "WORKSPACE", items: [
    { name: "Command Center", icon: LayoutDashboard },
    { name: "Leads & CRM", icon: Users },
    { name: "Sales Pipeline", icon: TrendingUp },
    { name: "Customers", icon: BriefcaseBusiness },
    { name: "Follow-ups", icon: MessageSquareText },
    { name: "Appointments", icon: CalendarDays },
  ]},
  { label: "INTELLIGENCE", items: [
    { name: "AI Assistant", icon: Bot },
    { name: "Automations", icon: Workflow },
    { name: "Revenue Intelligence", icon: Activity },
  ]},
  { label: "MANAGEMENT", items: [
    { name: "Team", icon: Building2 },
    { name: "Finance", icon: TrendingUp },
    { name: "Settings", icon: Settings },
  ]},
];

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const initials = (name: string) => name.split(" ").map(part => part[0]).slice(0, 2).join("").toUpperCase() || "NX";
const today = () => new Date().toISOString().slice(0, 10);
const newActivity = (kind: ActivityKind, text: string): ActivityItem => ({ id: `ACT-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`, kind, text, createdAt: new Date().toISOString() });

function normalizeLead(raw: Partial<Lead>): Lead {
  const createdAt = raw.createdAt || today();
  return {
    id: raw.id || `NX-${Date.now()}`,
    name: raw.name || "Unnamed contact",
    company: raw.company || "Independent contact",
    email: raw.email || "",
    phone: raw.phone || "",
    service: raw.service || "",
    value: Number(raw.value) || 0,
    status: statusOptions.includes(raw.status as LeadStatus) ? raw.status as LeadStatus : "New",
    source: sourceOptions.includes(raw.source as LeadSource) ? raw.source as LeadSource : "Other",
    createdAt,
    activities: Array.isArray(raw.activities) && raw.activities.length
      ? raw.activities
      : [newActivity("created", "Contact imported from your existing MAEKRAVON workspace")],
  };
}

function loadLeads(): Lead[] {
  try {
    const saved = localStorage.getItem("nexora-os-leads-v3") || localStorage.getItem("nexora-os-leads-v2");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed.map((item: Partial<Lead>) => normalizeLead(item));
    }
  } catch { /* Use the starter records if saved data cannot be read. */ }
  return seedLeads;
}

export default function App({ workspaceId }: { workspaceId: string }) {
  const [active, setActive] = useState("Command Center");
  const [leads, setLeads] = useState<Lead[]>(loadLeads);
  const [cloudStatus, setCloudStatus] = useState("loading");
  const [cloudMessage, setCloudMessage] = useState("");
  const [cloudImportBusy, setCloudImportBusy] = useState(false);
  const latestLeadsRef = useRef<Lead[]>(leads);
  latestLeadsRef.current = leads;
  const cloudSyncBusy = useRef(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [sourceFilter, setSourceFilter] = useState("All sources");
  const [showAdd, setShowAdd] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState("");
  const [newLead, setNewLead] = useState<LeadForm>(emptyLeadForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailForm, setDetailForm] = useState<LeadForm>(emptyLeadForm);
  const [noteDraft, setNoteDraft] = useState("");
  const [followUps, setFollowUps] = useState<FollowUpTask[]>(() => loadStored("nexora-followups-v1", []));
  const [appointments, setAppointments] = useState<Appointment[]>(() => loadStored("nexora-appointments-v1", []));
  const [automationRules, setAutomationRules] = useState<AutomationSettings>(() => loadStored("nexora-automations-v1", defaultAutomationSettings));
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => loadStored("nexora-team-v1", [{ id: "NX-OWNER", name: "Workspace Owner", email: "owner@maekravon.local", role: "Administrator", status: "Active" }]));
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>(() => loadStored("nexora-settings-v1", defaultWorkspaceSettings));
  const [workspaceCloudStatus, setWorkspaceCloudStatus] = useState("loading");
  const [workspaceCloudMessage, setWorkspaceCloudMessage] = useState("");
  const [pendingInvitations, setPendingInvitations] = useState<WorkspaceInvitation[]>([]);
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const unreadNotificationCount = notifications.filter(item => !item.readAt).length;
  const workspaceSyncBusy = useRef(false);
  const latestWorkspaceDataRef = useRef({ followUps, appointments, automationRules, workspaceSettings });
  latestWorkspaceDataRef.current = { followUps, appointments, automationRules, workspaceSettings };
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([{ id: "welcome", role: "assistant", text: "I'm MAEKRAVON AI, your business finance and growth copilot. I can analyze the CRM, follow-ups, appointments, and financial activity saved in this workspace. Ask what is happening, what is at risk, or what you should do next.", createdAt: new Date().toISOString() }]);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [financeTransactions, setFinanceTransactions] = useState<FinanceTransaction[]>([]);
  const [financeStatus, setFinanceStatus] = useState<"loading" | "connected" | "setup_required" | "error">("loading");
  const [financeMessage, setFinanceMessage] = useState("");

  useEffect(() => {
    localStorage.setItem("nexora-os-leads-v3", JSON.stringify(leads));
    // Keep the previous key in sync so this upgrade remains easy to roll back.
    localStorage.setItem("nexora-os-leads-v2", JSON.stringify(leads));
  }, [leads]);
  useEffect(() => { localStorage.setItem("nexora-followups-v1", JSON.stringify(followUps)); }, [followUps]);
  useEffect(() => { localStorage.setItem("nexora-appointments-v1", JSON.stringify(appointments)); }, [appointments]);
  useEffect(() => { localStorage.setItem("nexora-automations-v1", JSON.stringify(automationRules)); }, [automationRules]);
  useEffect(() => { localStorage.setItem("nexora-team-v1", JSON.stringify(teamMembers)); }, [teamMembers]);
  useEffect(() => { localStorage.setItem("nexora-settings-v1", JSON.stringify(workspaceSettings)); }, [workspaceSettings]);

  useEffect(() => {
    let cancelled = false;
    async function loadFinance() {
      setFinanceStatus("loading");
      try {
        const rows = await loadFinanceTransactions(workspaceId);
        if (cancelled) return;
        setFinanceTransactions(rows);
        setFinanceStatus("connected");
        setFinanceMessage(rows.length ? `${rows.length} financial records loaded.` : "Finance ledger connected. Add income or expenses to begin tracking cash flow.");
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Finance data could not be loaded.";
        const lower = message.toLowerCase();
        setFinanceStatus(lower.includes("finance_transactions") || lower.includes("relation") || lower.includes("schema cache") ? "setup_required" : "error");
        setFinanceMessage(message);
      }
    }
    void loadFinance();
    return () => { cancelled = true; };
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;

    async function loadFromCloud() {
      setCloudStatus("loading");
      try {
        const cloudLeads = await loadCloudLeads(workspaceId);
        if (cancelled) return;

        if (cloudLeads.length > 0) {
          setLeads(cloudLeads);
          setCloudStatus("connected");
          setCloudMessage(`${cloudLeads.length} leads loaded from cloud.`);
        } else {
          setCloudStatus("empty");
          setCloudMessage("Cloud CRM is empty. Your local leads are preserved and ready to import.");
        }
      } catch (error) {
        if (cancelled) return;
        setCloudStatus("error");
        setCloudMessage(error instanceof Error ? error.message : "Cloud loading failed.");
      }
    }

    void loadFromCloud();
    return () => { cancelled = true; };
  }, [workspaceId]);

  useEffect(() => {
    if (cloudStatus !== "connected" || cloudSyncBusy.current) return;

    cloudSyncBusy.current = true;

    async function runCloudSync() {
      let completedSignature = "";

      try {
        while (true) {
          const snapshot = latestLeadsRef.current;
          const signature = JSON.stringify(snapshot);

          if (signature === completedSignature) break;

          await syncCloudLeads(workspaceId, snapshot);
          completedSignature = signature;

          setCloudMessage(`${snapshot.length} leads synced to Supabase.`);

          if (JSON.stringify(latestLeadsRef.current) === completedSignature) {
            break;
          }
        }
      } catch (error) {
        setCloudStatus("error");
        setCloudMessage(
          error instanceof Error ? error.message : "Cloud synchronization failed."
        );
      } finally {
        cloudSyncBusy.current = false;
      }
    }

    void runCloudSync();
  }, [leads, cloudStatus, workspaceId]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspaceFromCloud() {
      setWorkspaceCloudStatus("loading");
      try {
        const snapshot = await loadCloudWorkspace(workspaceId);
        if (cancelled) return;

        // When cloud tables already contain records, cloud is authoritative.
        // When they are empty, preserve local browser data for the first upload.
        if (snapshot.followUps.length > 0) setFollowUps(snapshot.followUps);
        if (snapshot.appointments.length > 0) setAppointments(snapshot.appointments);
        if (snapshot.automationSettings) setAutomationRules(snapshot.automationSettings);
        if (snapshot.workspaceSettings) setWorkspaceSettings(snapshot.workspaceSettings);
        setTeamMembers(snapshot.teamMembers);
        setPendingInvitations(snapshot.pendingInvitations);
        setWorkspaceCloudMessage(
          `Loaded ${snapshot.followUps.length} follow-ups, ${snapshot.appointments.length} appointments, and ${snapshot.teamMembers.length} workspace members.`
        );
        setWorkspaceCloudStatus("connected");
      } catch (error) {
        if (cancelled) return;
        setWorkspaceCloudStatus("error");
        setWorkspaceCloudMessage(error instanceof Error ? error.message : "Workspace data could not be loaded.");
      }
    }

    void loadWorkspaceFromCloud();
    return () => { cancelled = true; };
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const rows = await loadWorkspaceNotifications(workspaceId);
        if (!cancelled) setNotifications(rows);
      } catch (error) {
        if (!cancelled) setWorkspaceCloudMessage(error instanceof Error ? error.message : "Notifications could not be loaded.");
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceCloudStatus !== "connected" || cloudStatus !== "connected" || workspaceSyncBusy.current) return;
    workspaceSyncBusy.current = true;

    async function runWorkspaceSync() {
      let completedSignature = "";
      try {
        while (true) {
          const snapshot = latestWorkspaceDataRef.current;
          const signature = JSON.stringify(snapshot);
          if (signature === completedSignature) break;

          // Ensure newly created CRM leads exist in Supabase before resolving task/appointment lead_id values.
          await syncCloudLeads(workspaceId, latestLeadsRef.current);
          await syncCloudWorkspace(workspaceId, {
            followUps: snapshot.followUps,
            appointments: snapshot.appointments,
            automationSettings: snapshot.automationRules,
            workspaceSettings: snapshot.workspaceSettings,
          });
          const serverSnapshot = await loadCloudWorkspace(workspaceId);
          const generatedTasks = serverSnapshot.followUps.filter(task => task.id.startsWith("AUTO-"));
          if (generatedTasks.length) {
            setFollowUps(current => {
              const merged = new Map<string, FollowUpTask>(current.map(task => [task.id, task] as [string, FollowUpTask]));
              for (const task of generatedTasks) if (!merged.has(task.id)) merged.set(task.id, task);
              return [...merged.values()];
            });
          }
          completedSignature = signature;
          setWorkspaceCloudMessage(
            `${snapshot.followUps.length} follow-ups and ${snapshot.appointments.length} appointments synced. Settings and automation preferences saved.`
          );

          if (JSON.stringify(latestWorkspaceDataRef.current) === completedSignature) break;
        }
      } catch (error) {
        setWorkspaceCloudStatus("error");
        setWorkspaceCloudMessage(error instanceof Error ? error.message : "Workspace synchronization failed.");
      } finally {
        workspaceSyncBusy.current = false;
      }
    }

    void runWorkspaceSync();
  }, [followUps, appointments, automationRules, workspaceSettings, workspaceCloudStatus, cloudStatus, workspaceId]);

  async function importDemoLeads() {
    setCloudImportBusy(true);
    setCloudMessage("Importing your existing leads and activity histories...");

    try {
      const result = await importLocalLeads(workspaceId, leads);
      const remoteLeads = await loadCloudLeads(workspaceId);

      setLeads(remoteLeads);
      setCloudStatus("connected");
      setCloudMessage(
        `Imported ${result.leadsImported} leads and ${result.activitiesImported} activities.`
      );
    } catch (error) {
      setCloudStatus("empty");
      setCloudMessage(
        error instanceof Error ? error.message : "The import could not be completed."
      );
    } finally {
      setCloudImportBusy(false);
    }
  }

  const selectedLead = leads.find(lead => lead.id === selectedId) || null;
  const isDashboard = active === "Command Center";
  const isLeads = active === "Leads & CRM";
  const isPipeline = active === "Sales Pipeline";
  const isCustomers = active === "Customers";
  const isFollowUps = active === "Follow-ups";
  const isAppointments = active === "Appointments";
  const isAssistant = active === "AI Assistant";
  const isAutomations = active === "Automations";
  const isRevenue = active === "Revenue Intelligence";
  const isTeam = active === "Team";
  const isSettings = active === "Settings";
  const isFinance = active === "Finance";

  useEffect(() => {
    if (!selectedLead) return;
    setDetailForm({
      name: selectedLead.name, company: selectedLead.company, email: selectedLead.email,
      phone: selectedLead.phone, service: selectedLead.service, value: String(selectedLead.value), source: selectedLead.source,
    });
  }, [selectedId]);

  const visibleLeads = useMemo(() => {
    const base = isCustomers ? leads.filter(lead => lead.status === "Won") : leads;
    return base.filter(lead => {
      const matchesSearch = [lead.name, lead.company, lead.email, lead.phone, lead.service, lead.status, lead.source].join(" ").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "All statuses" || lead.status === statusFilter;
      const matchesSource = sourceFilter === "All sources" || lead.source === sourceFilter;
      return matchesSearch && matchesStatus && matchesSource;
    });
  }, [leads, search, statusFilter, sourceFilter, isCustomers]);

  const openPipelineLeads = leads.filter(lead => !["Won", "Lost"].includes(lead.status));
  const pipeline = openPipelineLeads.reduce((sum, lead) => sum + lead.value, 0);
  const weightedForecast = leads.reduce((sum, lead) => {
    const probability: Record<LeadStatus, number> = { New: 0.10, Contacted: 0.25, Qualified: 0.60, Won: 1, Lost: 0 };
    return sum + lead.value * probability[lead.status];
  }, 0);
  const won = leads.filter(lead => lead.status === "Won").reduce((sum, lead) => sum + lead.value, 0);
  const needsAttention = leads.filter(lead => lead.status === "New").length;
  const customerCount = leads.filter(lead => lead.status === "Won").length;
  const currentMonth = today().slice(0, 7);
  const monthFinance = financeTransactions.filter(item => item.date.startsWith(currentMonth));
  const monthIncome = monthFinance.filter(item => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
  const monthExpenses = monthFinance.filter(item => item.kind === "expense").reduce((sum, item) => sum + item.amount, 0);
  const monthProfit = monthIncome - monthExpenses;
  const allTimeNetCashFlow = financeTransactions.reduce((sum, item) => sum + (item.kind === "income" ? item.amount : -item.amount), 0);
  const recurringMonthlyExpenses = financeTransactions.filter(item => item.kind === "expense" && item.recurring).reduce((sum, item) => sum + item.amount, 0);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function openLead(lead: Lead) {
    setSelectedId(lead.id);
    setNoteDraft("");
  }

  function addLead(event: FormEvent) {
    event.preventDefault();
    if (!newLead.name.trim() || !newLead.company.trim()) return;
    const lead: Lead = {
      id: `NX-${Date.now().toString().slice(-6)}`,
      name: newLead.name.trim(), company: newLead.company.trim(), email: newLead.email.trim(),
      phone: newLead.phone.trim(), service: newLead.service.trim(),
      value: Math.max(0, Number(newLead.value) || 0), status: "New", source: newLead.source,
      createdAt: today(), activities: [newActivity("created", `Lead created from ${newLead.source}`)],
    };
    setLeads(current => [lead, ...current]);
    // New-lead follow-up is created by the Supabase database trigger.
    setNewLead(emptyLeadForm);
    setShowAdd(false);
    notify("Lead added to your workspace");
  }

  function updateStatus(id: string, status: LeadStatus) {
    setLeads(current => current.map(lead => {
      if (lead.id !== id || lead.status === status) return lead;
      return { ...lead, status, activities: [newActivity("status", `Status changed to ${status}`), ...lead.activities] };
    }));
    // Qualified-lead proposal task is created by the Supabase database trigger.
    notify("Lead status updated");
  }

  function saveLeadDetails(event: FormEvent) {
    event.preventDefault();
    if (!selectedLead || !detailForm.name.trim() || !detailForm.company.trim()) return;
    setLeads(current => current.map(lead => lead.id === selectedLead.id ? {
      ...lead,
      name: detailForm.name.trim(), company: detailForm.company.trim(), email: detailForm.email.trim(),
      phone: detailForm.phone.trim(), service: detailForm.service.trim(),
      value: Math.max(0, Number(detailForm.value) || 0), source: detailForm.source,
      activities: [newActivity("updated", "Contact profile details updated"), ...lead.activities],
    } : lead));
    notify("Contact profile saved");
  }

  async function deleteLead(lead: Lead) {
    if (!window.confirm(`Permanently delete ${lead.name}? Related cloud activities, follow-ups, and appointments may also be removed. This cannot be undone.`)) return;
    try {
      await deleteCloudLead(workspaceId, lead.id);
      setLeads(current => current.filter(item => item.id !== lead.id));
      setFollowUps(current => current.filter(item => item.leadId !== lead.id));
      setAppointments(current => current.filter(item => item.leadId !== lead.id));
      setSelectedId(null);
      notify("Lead permanently deleted");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Lead could not be deleted.");
    }
  }

  async function handleAddFinanceTransaction(input: FinanceTransactionInput) {
    try {
      const created = await createFinanceTransaction(workspaceId, input);
      setFinanceTransactions(current => [created, ...current]);
      setFinanceStatus("connected");
      setFinanceMessage("Financial activity saved to the cloud ledger.");
      notify(input.kind === "income" ? "Income recorded" : "Expense recorded");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Financial activity could not be saved.";
      setFinanceMessage(message);
      throw new Error(message);
    }
  }

  async function handleDeleteFinanceTransaction(id: string) {
    if (!window.confirm("Delete this financial record? This cannot be undone.")) return;
    await deleteFinanceTransaction(workspaceId, id);
    setFinanceTransactions(current => current.filter(item => item.id !== id));
    notify("Financial record deleted");
  }

  function addNote(event: FormEvent) {
    event.preventDefault();
    if (!selectedLead || !noteDraft.trim()) return;
    setLeads(current => current.map(lead => lead.id === selectedLead.id
      ? { ...lead, activities: [newActivity("note", noteDraft.trim()), ...lead.activities] }
      : lead));
    setNoteDraft("");
    notify("Note added to activity history");
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify({ app: "MAEKRAVON OS", schemaVersion: 5, exportedAt: new Date().toISOString(), leads, followUps, appointments, automationRules, teamMembers, workspaceSettings, financeTransactions }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "maekravon-os-backup.json"; anchor.click();
    URL.revokeObjectURL(url);
    notify("Workspace backup exported");
  }

  function addFollowUp(title: string, leadId: string, dueDate: string, priority: "Low" | "Normal" | "High") {
    setFollowUps(current => [{ id: `FU-${Date.now()}`, title: title.trim(), leadId, dueDate, priority, done: false, createdAt: new Date().toISOString() }, ...current]);
    notify("Follow-up saved");
  }
  function toggleFollowUp(id: string) { setFollowUps(current => current.map(task => task.id === id ? { ...task, done: !task.done } : task)); }
  function addAppointment(title: string, leadId: string, date: string, time: string, notes: string) {
    setAppointments(current => [{ id: `AP-${Date.now()}`, title: title.trim(), leadId, date, time, notes: notes.trim(), done: false, createdAt: new Date().toISOString() }, ...current]);
    notify("Appointment saved to this workspace");
  }
  function toggleAppointment(id: string) { setAppointments(current => current.map(item => item.id === id ? { ...item, done: !item.done } : item)); }
  function localAssistantAnswer(question: string) {
    const q = question.toLowerCase();
    const openTasks = followUps.filter(task => !task.done);
    const upcoming = appointments.filter(item => !item.done).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    const financeLine = financeTransactions.length
      ? `This month you recorded ${money(monthIncome)} of income and ${money(monthExpenses)} of expenses, for ${monthProfit >= 0 ? "positive" : "negative"} net cash flow of ${money(Math.abs(monthProfit))}.`
      : "No financial transactions are recorded yet, so I cannot infer cash flow or profit from CRM deal values.";
    if (q.includes("expense") || q.includes("profit") || q.includes("cash") || q.includes("finance") || q.includes("money")) return `${financeLine} ${recurringMonthlyExpenses ? `Recurring expenses currently total ${money(recurringMonthlyExpenses)} across the records marked recurring.` : "No recurring expenses are marked yet."}`;
    if (q.includes("follow") || q.includes("task")) return `There are ${openTasks.length} open follow-ups. ${openTasks.length ? `Your next item is “${openTasks[0].title}” due ${openTasks[0].dueDate}.` : "Your follow-up list is clear."}`;
    if (q.includes("appointment") || q.includes("meeting")) return `You have ${upcoming.length} upcoming appointments. ${upcoming.length ? `The next is “${upcoming[0].title}” on ${upcoming[0].date} at ${upcoming[0].time}.` : "No upcoming appointments are saved."}`;
    if (q.includes("lead") || q.includes("customer")) return `Your workspace has ${leads.length} leads and ${customerCount} won customers. ${needsAttention} new lead${needsAttention === 1 ? " needs" : "s need"} a first response. Your open pipeline is ${money(pipeline)}.`;
    if (q.includes("revenue") || q.includes("pipeline") || q.includes("deal") || q.includes("grow")) return `Your open pipeline is ${money(pipeline)}, with a weighted planning forecast of ${money(weightedForecast)}. ${needsAttention ? `Start by responding to ${needsAttention} untouched new lead${needsAttention === 1 ? "" : "s"}.` : "Your new-lead queue is clear."} ${financeLine}`;
    return `Business snapshot: ${leads.length} leads, ${customerCount} won customers, ${money(pipeline)} open pipeline, ${openTasks.length} open follow-ups, and ${upcoming.length} upcoming appointments. ${financeLine}`;
  }

  async function answerAssistant(question: string) {
    if (assistantBusy) return;
    const userMessage: AssistantMessage = { id: `MSG-${Date.now()}-u`, role: "user", text: question, createdAt: new Date().toISOString() };
    setAssistantMessages(current => [...current, userMessage]);
    setAssistantBusy(true);
    try {
      const answer = await askMaekravonAI(workspaceId, question, {
        businessName: workspaceSettings.businessName,
        monthlyGoal: Number(workspaceSettings.monthlyGoal) || 0,
        leads: leads.map(({ name, company, status, source, value, createdAt }) => ({ name, company, status, source, value, createdAt })),
        followUps: followUps.map(({ title, dueDate, priority, done }) => ({ title, dueDate, priority, done })),
        appointments: appointments.map(({ title, date, time, done }) => ({ title, date, time, done })),
        financeTransactions,
      });
      setAssistantMessages(current => [...current, { id: `MSG-${Date.now()}-a`, role: "assistant", text: answer, createdAt: new Date().toISOString() }]);
    } catch {
      const fallback = localAssistantAnswer(question);
      setAssistantMessages(current => [...current, { id: `MSG-${Date.now()}-a`, role: "assistant", text: `${fallback}\n\nCloud AI is not connected yet, so this answer was generated from MAEKRAVON's built-in business analysis rules.`, createdAt: new Date().toISOString() }]);
    } finally {
      setAssistantBusy(false);
    }
  }
  async function refreshTeamData() {
    const snapshot = await loadCloudWorkspace(workspaceId);
    setTeamMembers(snapshot.teamMembers);
    setPendingInvitations(snapshot.pendingInvitations);
  }

  async function handleInviteMember(email: string, role: "admin" | "manager" | "member") {
    await inviteWorkspaceMember(workspaceId, email, role);
    await refreshTeamData();
    notify(`Invitation sent to ${email}.`);
  }

  async function handleMemberRoleChange(memberId: string, role: "admin" | "manager" | "member") {
    await changeWorkspaceMemberRole(workspaceId, memberId, role);
    await refreshTeamData();
    notify("Team member role updated.");
  }

  async function handleRemoveMember(memberId: string) {
    await removeWorkspaceMember(workspaceId, memberId);
    await refreshTeamData();
    notify("Team member removed.");
  }

  async function handleRevokeInvitation(invitationId: string) {
    await revokeWorkspaceInvitation(workspaceId, invitationId);
    await refreshTeamData();
    notify("Invitation revoked.");
  }

  async function toggleNotifications() {
    const next = !notificationsOpen;
    setNotificationsOpen(next);
    if (next) {
      try { setNotifications(await loadWorkspaceNotifications(workspaceId)); }
      catch (error) { notify(error instanceof Error ? error.message : "Could not refresh notifications."); }
    }
  }

  async function openWorkspaceNotification(item: WorkspaceNotification) {
    if (!item.readAt) {
      try {
        await markWorkspaceNotificationRead(item.id);
        setNotifications(current => current.map(row => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row));
      } catch (error) { notify(error instanceof Error ? error.message : "Could not mark notification read."); }
    }
    setNotificationsOpen(false);
    if (item.kind.startsWith("follow_up")) setActive("Follow-ups");
    if (item.kind.startsWith("appointment")) setActive("Appointments");
  }

  function clearFilters() {
    setSearch(""); setStatusFilter("All statuses"); setSourceFilter("All sources");
  }

  return (
    <div className="app-shell" data-workspace-id={workspaceId}>
      {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><span>M</span><i /></div>
          <div><div className="brand-name">MAEKRAVON<span> OS</span></div><div className="brand-caption">CONTROL EVERYTHING</div></div>
          <button className="icon-btn sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18}/></button>
        </div>
        <button className="workspace-switch" onClick={() => notify("Workspace switching will be added with team accounts.")}>
          <div className="workspace-icon"><Building2 size={16}/></div>
          <div className="workspace-copy"><strong>{workspaceSettings.businessName || "My Workspace"}</strong><small>Cloud workspace</small></div>
          <ChevronDown size={15} className="muted"/>
        </button>
        <nav>
          {navGroups.map(group => <div className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.map(item => {
              const Icon = item.icon;
              return <button key={item.name} className={`nav-item ${active === item.name ? "active" : ""}`} onClick={() => { setActive(item.name); setMobileNav(false); }}>
                <Icon size={17}/><span>{item.name}</span>{item.name === "Follow-ups" && needsAttention > 0 && <b className="nav-count">{needsAttention}</b>}
              </button>;
            })}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={16}/></div><strong>MAEKRAVON AI brief</strong><p>Turn CRM activity and financial records into prioritized business actions.</p><button onClick={() => setActive("AI Assistant")}>Open AI copilot <ArrowUpRight size={14}/></button></div>
          <button className="nav-item" onClick={() => notify("Help center content is coming soon.")}><CircleHelp size={17}/><span>Help center</span></button>
          <div className="profile"><div className="avatar">MK</div><div><strong>{workspaceSettings.ownerName || "Workspace Owner"}</strong><small>Administrator</small></div><MoreHorizontal size={18} className="muted"/></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-btn mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20}/></button><div className="breadcrumb">Workspace <span>/</span> <strong>{active}</strong></div></div>
          <div className="topbar-actions"><div className="system-status"><span/> {cloudStatus === "connected" && workspaceCloudStatus === "connected" ? "Cloud workspace connected" : cloudStatus === "error" || workspaceCloudStatus === "error" ? "Connection needs attention" : "Syncing workspace"}</div><div style={{ position: "relative" }}>
            <button className="icon-btn" aria-label="Notifications" onClick={() => void toggleNotifications()} style={{ position: "relative" }}>
              <Bell size={18}/>{unreadNotificationCount > 0 && <span style={{ position: "absolute", top: 1, right: 1, minWidth: 16, height: 16, borderRadius: 9, background: "#E45B72", color: "white", fontSize: 10, display: "grid", placeItems: "center", padding: "0 3px" }}>{unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}</span>}
            </button>
            {notificationsOpen && <div style={{ position: "absolute", top: 44, right: 0, width: 340, maxWidth: "calc(100vw - 32px)", maxHeight: 420, overflowY: "auto", zIndex: 1200, background: "#111A2D", border: "1px solid #34445F", borderRadius: 12, padding: 14, boxShadow: "0 16px 44px rgba(0,0,0,.35)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><strong>Notifications</strong><button className="text-btn" onClick={() => setNotificationsOpen(false)}>Close</button></div>
              {!notifications.length && <p style={{ color: "#A5B2C9", fontSize: 13 }}>You're all caught up. New reminders will appear here.</p>}
              {notifications.map(item => <button key={item.id} onClick={() => void openWorkspaceNotification(item)} style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 9px", marginTop: 5, border: 0, borderRadius: 8, cursor: "pointer", color: "#F5F7FC", background: item.readAt ? "#17233B" : "#203653" }}><strong style={{ display: "block", fontSize: 13 }}>{item.title}{!item.readAt && <span style={{ color: "#56D6E8" }}> · NEW</span>}</strong><span style={{ display: "block", color: "#A5B2C9", fontSize: 12, marginTop: 4 }}>{item.body}</span><span style={{ display: "block", color: "#8292AC", fontSize: 11, marginTop: 5 }}>{new Date(item.createdAt).toLocaleString()}</span></button>)}
            </div>}
          </div><div className="top-avatar">MK</div></div>
        </header>

        <div className="content">
          {cloudStatus === "loading" && (
            <div className="module-notice">Connecting to your MAEKRAVON cloud workspace...</div>
          )}
          {cloudStatus === "connected" && (
            <div className="module-notice">☁ Cloud CRM connected. {cloudMessage}</div>
          )}
          {cloudStatus === "empty" && (
            <div className="module-notice">
              <p>{cloudMessage}</p>
              <button
                type="button"
                className="primary-btn"
                onClick={() => void importDemoLeads()}
                disabled={cloudImportBusy}
              >
                {cloudImportBusy
                  ? "Importing local leads..."
                  : `Import ${leads.length} local leads into MAEKRAVON Cloud`}
              </button>
            </div>
          )}
          {cloudStatus === "error" && (
            <div className="module-notice">
              Cloud connection issue: {cloudMessage}
            </div>
          )}
          {workspaceCloudStatus === "loading" && (
            <div className="module-notice">Loading follow-ups, appointments, settings, and workspace members...</div>
          )}
          {workspaceCloudStatus === "connected" && (
            <div className="module-notice">☁ Workspace data connected. {workspaceCloudMessage}</div>
          )}
          {workspaceCloudStatus === "error" && (
            <div className="module-notice">Workspace cloud issue: {workspaceCloudMessage}. Local browser changes remain available.</div>
          )}
          <div className="welcome-row">
            <div><div className="eyebrow"><span className="eyebrow-line"/> BUSINESS OPERATING SYSTEM</div><h1>{isDashboard ? "Good afternoon." : active}</h1><p>{isDashboard ? "Here's what's happening across your business today." : isLeads ? "One organized place for every opportunity and conversation." : isCustomers ? "Your won opportunities, now organized as customer records." : isPipeline ? "Move every opportunity forward and keep your deal forecast in view." : `Your ${active.toLowerCase()} workspace is ready for its next module.`}</p></div>
            <div className="welcome-actions"><button className="secondary-btn" onClick={exportBackup}><Download size={16}/> Export backup</button>{(isDashboard || isLeads || isCustomers || isPipeline) && <button className="primary-btn" onClick={() => setShowAdd(true)}><Plus size={17}/> New lead</button>}</div>
          </div>

          {isFollowUps ? <FollowUpsModule tasks={followUps} leads={leads} onAdd={addFollowUp} onToggle={toggleFollowUp} onOpenLead={openLead}/> :
           isAppointments ? <AppointmentsModule appointments={appointments} leads={leads} onAdd={addAppointment} onToggle={toggleAppointment} alertsEnabled={automationRules.appointmentAlerts}/> :
           isAssistant ? <AssistantModule messages={assistantMessages} onAsk={answerAssistant} busy={assistantBusy}/> :
           isAutomations ? <AutomationsModule rules={automationRules} onChange={setAutomationRules} followUpCount={followUps.filter(task => !task.done).length}/> :
           isRevenue ? <RevenueModule leads={leads} pipeline={pipeline} won={won} forecast={weightedForecast} goal={Number(workspaceSettings.monthlyGoal) || 0}/> :
           isFinance ? <FinanceModule transactions={financeTransactions} status={financeStatus} message={financeMessage} onAdd={handleAddFinanceTransaction} onDelete={handleDeleteFinanceTransaction}/> :
           isTeam ? <TeamModule members={teamMembers} invitations={pendingInvitations} onInvite={handleInviteMember} onRoleChange={handleMemberRoleChange} onRemove={handleRemoveMember} onRevoke={handleRevokeInvitation}/> :
           isSettings ? <SettingsModule settings={workspaceSettings} onSave={setWorkspaceSettings} onExport={exportBackup}/> :
           (!isDashboard && !isLeads && !isPipeline && !isCustomers) ? <section className="coming-panel"><div className="coming-orb"><Zap size={26}/></div><div className="eyebrow">MODULE FRAMEWORK</div><h2>{active} is in the build queue.</h2><p>This section is part of the MAEKRAVON OS architecture. We're building each module on the same shared foundation, one working feature at a time.</p><button className="secondary-btn" onClick={() => setActive("Command Center")}>Return to Command Center</button></section> : <>
            {isPipeline ? <section className="metric-grid">
              <Metric icon={<Target size={18}/>} label="Active opportunities" value={String(openPipelineLeads.length)} trend="Deals still in progress" tone="cyan"/>
              <Metric icon={<TrendingUp size={18}/>} label="Open pipeline value" value={money(pipeline)} trend="Full value of active deals" tone="blue"/>
              <Metric icon={<Activity size={18}/>} label="Weighted forecast" value={money(weightedForecast)} trend="Planning estimate by stage" tone="purple"/>
              <Metric icon={<CheckCircle2 size={18}/>} label="Won revenue" value={money(won)} trend="Value marked as won" tone="green"/>
            </section> : <section className="metric-grid">
              <Metric icon={<Users size={18}/>} label="Total leads" value={String(leads.length)} trend="Every opportunity in CRM" tone="cyan"/>
              <Metric icon={<Target size={18}/>} label="Needs attention" value={String(needsAttention)} trend="New leads to contact" tone="purple"/>
              <Metric icon={<TrendingUp size={18}/>} label="Open pipeline" value={money(pipeline)} trend="Potential deal value" tone="blue"/>
              <Metric icon={<DollarSign size={18}/>} label={isDashboard && financeTransactions.length ? "Month net cash flow" : isCustomers ? "Customers" : "Won deal value"} value={isDashboard && financeTransactions.length ? money(monthProfit) : isCustomers ? String(customerCount) : money(won)} trend={isDashboard && financeTransactions.length ? `${money(monthIncome)} in · ${money(monthExpenses)} out` : isCustomers ? "Leads marked as won" : "CRM value marked as won"} tone="green"/>
            </section>}

            {isPipeline ? <PipelineBoard leads={leads} onMove={updateStatus} onOpen={openLead}/> : <>
            {isDashboard && <section className="insight-strip"><div className="insight-icon"><Sparkles size={18}/></div><div className="insight-copy"><strong>MAEKRAVON daily brief</strong><span>{financeTransactions.length ? `${monthProfit >= 0 ? "Positive" : "Negative"} month cash flow: ${money(monthProfit)}. ${needsAttention ? `${needsAttention} new lead${needsAttention === 1 ? "" : "s"} still need a first response.` : "Your new-lead queue is clear."}` : needsAttention ? `You have ${needsAttention} new lead${needsAttention === 1 ? "" : "s"} waiting for a first response. Add financial activity in Finance to unlock cash-flow analysis.` : "Your new-lead queue is clear. Add financial activity in Finance to unlock cash-flow analysis."}</span></div><button onClick={() => setActive("AI Assistant")}>Ask MAEKRAVON <ArrowUpRight size={14}/></button></section>}

            <section className="panel leads-panel">
              <div className="panel-heading"><div><div className="panel-kicker">{isCustomers ? "CUSTOMER RELATIONSHIPS" : "CUSTOMER ACQUISITION"}</div><h2>{isDashboard ? "Recent leads" : isCustomers ? "Customer records" : "All leads"}</h2><p>{isCustomers ? "Every customer marked Won appears here." : "Open a contact to view the profile, add notes, and track activity."}</p></div>{isLeads && <span className="record-count">{leads.length} records</span>}</div>
              <div className="table-tools">
                <div className="search-box"><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search names, companies, phone, email..." /></div>
                <label className="filter-control"><SlidersHorizontal size={14}/><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Filter by status"><option>All statuses</option>{statusOptions.map(status => <option key={status}>{status}</option>)}</select></label>
                <label className="filter-control source-filter"><Globe size={14}/><select value={sourceFilter} onChange={event => setSourceFilter(event.target.value)} aria-label="Filter by source"><option>All sources</option>{sourceOptions.map(source => <option key={source}>{source}</option>)}</select></label>
                {(search || statusFilter !== "All statuses" || sourceFilter !== "All sources") && <button className="clear-filter" onClick={clearFilters}>Clear</button>}
              </div>
              <div className="table-wrap"><table><thead><tr><th>CONTACT</th><th>SERVICE</th><th>SOURCE</th><th>EST. VALUE</th><th>STATUS</th><th>ADDED</th><th/></tr></thead><tbody>
                {visibleLeads.slice(0, isDashboard ? 5 : 200).map(lead => <tr key={lead.id}>
                  <td><button className="contact-open" onClick={() => openLead(lead)}><div className="contact-avatar">{initials(lead.name)}</div><span><strong>{lead.name}</strong><small>{lead.company}</small></span></button></td>
                  <td className="service-cell">{lead.service || "—"}</td><td><span className="source-pill">{lead.source}</span></td><td className="value-cell">{money(lead.value)}</td>
                  <td><select className={`status-select status-${lead.status.toLowerCase()}`} value={lead.status} onChange={event => updateStatus(lead.id, event.target.value as LeadStatus)} aria-label={`Status for ${lead.name}`}>{statusOptions.map(status => <option key={status}>{status}</option>)}</select></td>
                  <td className="date-cell">{new Date(lead.createdAt + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                  <td><button className="row-more" onClick={() => openLead(lead)} aria-label={`Open ${lead.name} profile`}><MoreHorizontal size={18}/></button></td>
                </tr>)}
                {visibleLeads.length === 0 && <tr><td colSpan={7} className="empty-state">No records match those filters. Try changing your search or adding a new lead.</td></tr>}
              </tbody></table></div>
              <div className="panel-footer"><span>Showing {Math.min(visibleLeads.length, isDashboard ? 5 : 200)} of {visibleLeads.length} records</span><button className="text-btn" onClick={() => setShowAdd(true)}><Plus size={15}/> Add a lead</button></div>
            </section>

            {isDashboard && <div className="bottom-grid">
              <section className="panel mini-panel"><div className="panel-heading"><div><div className="panel-kicker">WORKFLOW HEALTH</div><h2>Automation activity</h2></div><Workflow size={19} className="muted"/></div><div className="empty-mini"><div className="mini-icon"><Workflow size={20}/></div><strong>Your workflows start here</strong><span>Connect repetitive tasks and let MAEKRAVON handle the handoffs.</span><button className="text-btn" onClick={() => setActive("Automations")}>Explore automations <ArrowUpRight size={14}/></button></div></section>
              <section className="panel mini-panel"><div className="panel-heading"><div><div className="panel-kicker">FINANCIAL PULSE</div><h2>{financeTransactions.length ? "Month cash flow" : "Finance setup"}</h2></div><WalletCards size={19} className="muted"/></div>{financeTransactions.length ? <><div className="revenue-total">{money(monthProfit)}<span>Income minus recorded expenses</span></div><div className="revenue-note"><span className={monthProfit >= 0 ? "positive-dot" : "negative-dot"}/> {money(monthIncome)} income · {money(monthExpenses)} expenses</div></> : <div className="empty-mini"><div className="mini-icon"><ReceiptText size={20}/></div><strong>Turn CRM into a business cockpit</strong><span>Add income and expenses so MAEKRAVON can analyze real cash flow instead of guessing from deal values.</span><button className="text-btn" onClick={() => setActive("Finance")}>Open Finance <ArrowUpRight size={14}/></button></div>}</section>
            </div>}
            </>}
          </>}
          <footer className="footer"><span>© 2026 MAEKRAVON AI</span><span>CONTROL EVERYTHING.</span><span className="demo-note">{workspaceCloudStatus === "connected" ? "CLOUD WORKSPACE" : "LOCAL CACHE"}</span></footer>
        </div>
      </main>

      {showAdd && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowAdd(false); }}><form className="modal" onSubmit={addLead}>
        <div className="modal-head"><div><div className="panel-kicker">CUSTOMER ACQUISITION</div><h2>Add a new lead</h2><p>Capture a potential customer in your pipeline.</p></div><button type="button" className="icon-btn" onClick={() => setShowAdd(false)} aria-label="Close"><X size={19}/></button></div>
        <div className="form-row"><label>Contact name *<input required value={newLead.name} onChange={event => setNewLead({ ...newLead, name: event.target.value })} placeholder="e.g. Alex Morgan"/></label><label>Company *<input required value={newLead.company} onChange={event => setNewLead({ ...newLead, company: event.target.value })} placeholder="e.g. Summit Services"/></label></div>
        <div className="form-row"><label>Email address<input type="email" value={newLead.email} onChange={event => setNewLead({ ...newLead, email: event.target.value })} placeholder="alex@company.com"/></label><label>Phone number<input type="tel" value={newLead.phone} onChange={event => setNewLead({ ...newLead, phone: event.target.value })} placeholder="(555) 555-0123"/></label></div>
        <div className="form-row"><label>Service interested in<input value={newLead.service} onChange={event => setNewLead({ ...newLead, service: event.target.value })} placeholder="e.g. HVAC repair"/></label><label>Estimated value ($)<input type="number" min="0" value={newLead.value} onChange={event => setNewLead({ ...newLead, value: event.target.value })}/></label></div>
        <label>Lead source<select value={newLead.source} onChange={event => setNewLead({ ...newLead, source: event.target.value as LeadSource })}>{sourceOptions.map(source => <option key={source}>{source}</option>)}</select></label>
        <div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setShowAdd(false)}>Cancel</button><button type="submit" className="primary-btn"><Plus size={16}/> Save lead</button></div>
      </form></div>}

      {selectedLead && <div className="modal-backdrop detail-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedId(null); }}>
        <section className="modal crm-modal">
          <div className="detail-top"><div className="detail-person"><div className="detail-avatar">{initials(selectedLead.name)}</div><div><div className="panel-kicker">CONTACT PROFILE · {selectedLead.id}</div><h2>{selectedLead.name}</h2><p>{selectedLead.company}</p></div></div><button className="icon-btn" onClick={() => setSelectedId(null)} aria-label="Close profile"><X size={19}/></button></div>
          <div className="detail-status-row"><span className="detail-label">Lead status</span><select className={`status-select status-${selectedLead.status.toLowerCase()}`} value={selectedLead.status} onChange={event => updateStatus(selectedLead.id, event.target.value as LeadStatus)}>{statusOptions.map(status => <option key={status}>{status}</option>)}</select><span className="detail-source">Source: {selectedLead.source}</span></div>
          <div className="detail-columns">
            <div className="detail-main-column">
              <form className="detail-card" onSubmit={saveLeadDetails}>
                <div className="detail-card-heading"><div><div className="panel-kicker">CONTACT INFORMATION</div><h3>Profile details</h3></div><Pencil size={16}/></div>
                <div className="form-row"><label>Contact name *<input required value={detailForm.name} onChange={event => setDetailForm({ ...detailForm, name: event.target.value })}/></label><label>Company *<input required value={detailForm.company} onChange={event => setDetailForm({ ...detailForm, company: event.target.value })}/></label></div>
                <div className="form-row"><label><span><Mail size={12}/> Email</span><input type="email" value={detailForm.email} onChange={event => setDetailForm({ ...detailForm, email: event.target.value })} placeholder="No email saved"/></label><label><span><Phone size={12}/> Phone</span><input type="tel" value={detailForm.phone} onChange={event => setDetailForm({ ...detailForm, phone: event.target.value })} placeholder="No phone saved"/></label></div>
                <div className="form-row"><label>Service<input value={detailForm.service} onChange={event => setDetailForm({ ...detailForm, service: event.target.value })} placeholder="Service requested"/></label><label>Estimated value ($)<input type="number" min="0" value={detailForm.value} onChange={event => setDetailForm({ ...detailForm, value: event.target.value })}/></label></div>
                <label>Lead source<select value={detailForm.source} onChange={event => setDetailForm({ ...detailForm, source: event.target.value as LeadSource })}>{sourceOptions.map(source => <option key={source}>{source}</option>)}</select></label>
                <div className="detail-save-row"><span>Added {new Date(selectedLead.createdAt + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span><div className="detail-actions"><button className="danger-btn" type="button" onClick={() => void deleteLead(selectedLead)}><Trash2 size={15}/> Delete lead</button><button className="primary-btn" type="submit"><Save size={15}/> Save profile</button></div></div>
              </form>
              <form className="detail-card note-card" onSubmit={addNote}>
                <div className="detail-card-heading"><div><div className="panel-kicker">PRIVATE WORKSPACE NOTES</div><h3>Add a note</h3></div><FileText size={16}/></div>
                <textarea value={noteDraft} onChange={event => setNoteDraft(event.target.value)} placeholder="Write a call summary, customer request, or next step..." rows={3}/>
                <div className="detail-save-row"><span>Notes sync with this cloud workspace.</span><button className="secondary-btn" type="submit" disabled={!noteDraft.trim()}><Plus size={15}/> Add note</button></div>
              </form>
            </div>
            <aside className="activity-card">
              <div className="detail-card-heading"><div><div className="panel-kicker">RECORD HISTORY</div><h3>Activity timeline</h3></div><Clock3 size={16}/></div>
              <div className="activity-list">{selectedLead.activities.map(item => <div className="activity-item" key={item.id}><div className={`activity-marker ${item.kind}`}>{item.kind === "note" ? <FileText size={13}/> : item.kind === "status" ? <Activity size={13}/> : item.kind === "updated" ? <Pencil size={13}/> : <Plus size={13}/>}</div><div className="activity-body"><p>{item.text}</p><time>{new Date(item.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div></div>)}</div>
              <div className="activity-foot"><CheckCircle2 size={14}/> Activity saves automatically</div>
            </aside>
          </div>
        </section>
      </div>}

      {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
      <div className="build-mode"><span className={hasSupabaseConfig ? "connected" : ""}/>{hasSupabaseConfig ? "SUPABASE CONFIGURED" : "LOCAL DEMO MODE"}</div>
    </div>
  );
}

const pipelineStages: { status: LeadStatus; probability: number; description: string }[] = [
  { status: "New", probability: 10, description: "Fresh opportunities" },
  { status: "Contacted", probability: 25, description: "First conversation started" },
  { status: "Qualified", probability: 60, description: "Good-fit prospects" },
  { status: "Won", probability: 100, description: "Closed customers" },
  { status: "Lost", probability: 0, description: "Not moving forward" },
];

function PipelineBoard({ leads, onMove, onOpen }: { leads: Lead[]; onMove: (id: string, status: LeadStatus) => void; onOpen: (lead: Lead) => void }) {
  return <section className="panel pipeline-panel">
    <div className="pipeline-heading">
      <div><div className="panel-kicker">DEAL MANAGEMENT</div><h2>Opportunity board</h2><p>Move each deal through the sales journey. Changes also update the contact's CRM status and activity history.</p></div>
      <div className="pipeline-board-total"><span>ALL DEALS</span><strong>{leads.length}</strong></div>
    </div>
    <div className="pipeline-board-wrap"><div className="pipeline-board">
      {pipelineStages.map(stage => {
        const stageLeads = leads.filter(lead => lead.status === stage.status).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const total = stageLeads.reduce((sum, lead) => sum + lead.value, 0);
        return <div className={`pipeline-column stage-${stage.status.toLowerCase()}`} key={stage.status}>
          <div className="pipeline-column-head"><div><div className="pipeline-stage-name"><span className="pipeline-stage-dot"/>{stage.status}</div><small>{stage.description}</small></div><span className="pipeline-stage-count">{stageLeads.length}</span></div>
          <div className="pipeline-stage-meta"><strong>{money(total)}</strong><span>{stage.probability}% forecast weight</span></div>
          <div className="pipeline-cards">
            {stageLeads.map(lead => <article className="pipeline-card" key={lead.id}>
              <button className="pipeline-contact" onClick={() => onOpen(lead)}><span className="pipeline-avatar">{initials(lead.name)}</span><span><strong>{lead.name}</strong><small>{lead.company}</small></span></button>
              <div className="pipeline-deal-value">{money(lead.value)}</div>
              <div className="pipeline-service">{lead.service || "Service not specified"}</div>
              <div className="pipeline-card-meta"><span>{lead.source}</span><span>{lead.id}</span></div>
              <label className="pipeline-move-label">Move to stage
                <select value={lead.status} onChange={event => onMove(lead.id, event.target.value as LeadStatus)} aria-label={`Move ${lead.name} to stage`}>
                  {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <button className="pipeline-open-profile" onClick={() => onOpen(lead)}>Open contact profile <ArrowUpRight size={13}/></button>
            </article>)}
            {stageLeads.length === 0 && <div className="pipeline-empty">No deals here yet</div>}
          </div>
        </div>;
      })}
    </div></div>
    <div className="pipeline-footnote"><Activity size={14}/> Forecast weights are starter planning assumptions, not predicted outcomes. Update a deal's stage to keep the board and CRM in sync.</div>
  </section>;
}

function Metric({ icon, label, value, trend, tone }: { icon: ReactNode; label: string; value: string; trend: string; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-trend">{trend}</div><div className="metric-spark"><ArrowUpRight size={15}/></div></div>;
}


function ModuleHeading({ kicker, title, description, right }: { kicker: string; title: string; description: string; right?: ReactNode }) {
  return <div className="module-heading"><div><div className="panel-kicker">{kicker}</div><h2>{title}</h2><p>{description}</p></div>{right}</div>;
}

function FollowUpsModule({ tasks, leads, onAdd, onToggle, onOpenLead }: { tasks: FollowUpTask[]; leads: Lead[]; onAdd: (title: string, leadId: string, dueDate: string, priority: "Low" | "Normal" | "High") => void; onToggle: (id: string) => void; onOpenLead: (lead: Lead) => void }) {
  const [title, setTitle] = useState(""); const [leadId, setLeadId] = useState(""); const [dueDate, setDueDate] = useState(today()); const [priority, setPriority] = useState<"Low" | "Normal" | "High">("Normal");
  const open = tasks.filter(task => !task.done).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
  const done = tasks.filter(task => task.done);
  function submit(event: FormEvent) { event.preventDefault(); if (!title.trim()) return; onAdd(title, leadId, dueDate, priority); setTitle(""); setLeadId(""); setDueDate(today()); setPriority("Normal"); }
  return <div className="module-stack"><section className="panel module-panel"><ModuleHeading kicker="CUSTOMER SUCCESS" title="Follow-up center" description="Keep every promise and next step visible. Tasks sync to your MAEKRAVON cloud workspace." right={<span className="module-count">{open.length} OPEN</span>}/>
    <div className="module-stats"><div><span>Open tasks</span><strong>{open.length}</strong></div><div><span>Overdue</span><strong>{open.filter(t => t.dueDate < today()).length}</strong></div><div><span>Completed</span><strong>{done.length}</strong></div></div>
    <form className="module-form" onSubmit={submit}><label>Follow-up task<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Call customer with estimate" required/></label><label>Related lead<select value={leadId} onChange={e=>setLeadId(e.target.value)}><option value="">No linked lead</option>{leads.map(l=><option value={l.id} key={l.id}>{l.name} · {l.company}</option>)}</select></label><label>Due date<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} required/></label><label>Priority<select value={priority} onChange={e=>setPriority(e.target.value as "Low"|"Normal"|"High")}><option>Low</option><option>Normal</option><option>High</option></select></label><button className="primary-btn" type="submit"><Plus size={15}/> Add task</button></form>
    <div className="module-list">{open.map(task=>{const lead=leads.find(l=>l.id===task.leadId);return <div className="module-list-row" key={task.id}><button className="check-circle" onClick={()=>onToggle(task.id)} aria-label="Mark complete"/><div className="module-row-main"><strong>{task.title}</strong><small>{lead ? `${lead.name} · ${lead.company}` : "No linked lead"} · Due {task.dueDate}</small></div><span className={`priority-pill priority-${task.priority.toLowerCase()}`}>{task.priority}</span>{lead&&<button className="text-btn" onClick={()=>onOpenLead(lead)}>Open lead</button>}</div>})}{!open.length&&<div className="module-empty">You're clear. Add a follow-up above or let a local automation create one when a lead arrives.</div>}</div>
    {done.length>0&&<details className="completed-details"><summary>Completed tasks ({done.length})</summary>{done.map(task=><div className="completed-row" key={task.id}><button className="check-circle checked" onClick={()=>onToggle(task.id)} aria-label="Reopen task"><CheckCircle2 size={14}/></button><span>{task.title}</span><small>{task.dueDate}</small></div>)}</details>}
  </section></div>;
}

function AppointmentsModule({ appointments, leads, onAdd, onToggle, alertsEnabled }: { appointments: Appointment[]; leads: Lead[]; onAdd: (title: string, leadId: string, date: string, time: string, notes: string) => void; onToggle: (id: string) => void; alertsEnabled: boolean }) {
  const [title,setTitle]=useState(""); const [leadId,setLeadId]=useState(""); const [date,setDate]=useState(today()); const [time,setTime]=useState("10:00"); const [notes,setNotes]=useState("");
  const upcoming=appointments.filter(a=>!a.done).sort((a,b)=>(`${a.date} ${a.time}`).localeCompare(`${b.date} ${b.time}`));
  function submit(e:FormEvent){e.preventDefault();if(!title.trim())return;onAdd(title,leadId,date,time,notes);setTitle("");setLeadId("");setDate(today());setTime("10:00");setNotes("");}
  return <div className="module-stack"><section className="panel module-panel"><ModuleHeading kicker="SCHEDULING" title="Appointments" description="Keep customer calls, consultations, and service visits organized in your cloud workspace." right={<span className="module-count">{upcoming.length} UPCOMING</span>}/>
    <form className="module-form appointment-form" onSubmit={submit}><label>Appointment title<input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. HVAC estimate consultation"/></label><label>Related customer<select value={leadId} onChange={e=>setLeadId(e.target.value)}><option value="">No linked customer</option>{leads.map(l=><option key={l.id} value={l.id}>{l.name} · {l.company}</option>)}</select></label><label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label><label>Time<input type="time" value={time} onChange={e=>setTime(e.target.value)} required/></label><label className="full-span">Notes<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Location, agenda, or preparation notes"/></label><button className="primary-btn" type="submit"><CalendarDays size={15}/> Save appointment</button></form>
    {!alertsEnabled&&<div className="module-notice">Appointment alert rules are currently off. You can turn them on in Automations.</div>}
    <div className="appointment-grid">{upcoming.map(item=>{const lead=leads.find(l=>l.id===item.leadId);return <article className="appointment-card" key={item.id}><div className="appointment-date"><strong>{new Date(item.date+"T12:00:00").toLocaleDateString("en-US",{day:"2-digit"})}</strong><span>{new Date(item.date+"T12:00:00").toLocaleDateString("en-US",{month:"short"})}</span></div><div className="appointment-copy"><strong>{item.title}</strong><small>{item.date} · {item.time}{lead?` · ${lead.name}`:""}</small>{item.notes&&<p>{item.notes}</p>}</div><button className="secondary-btn" onClick={()=>onToggle(item.id)}>Complete</button></article>})}{!upcoming.length&&<div className="module-empty">No appointments saved yet. Add your first customer meeting above.</div>}</div>
  </section></div>;
}

function AssistantModule({ messages, onAsk, busy }: { messages: AssistantMessage[]; onAsk: (question: string) => Promise<void>; busy: boolean }) {
  const [question,setQuestion]=useState("");
  async function submit(e:FormEvent){e.preventDefault();if(!question.trim()||busy)return;const next=question.trim();setQuestion("");await onAsk(next);}
  const prompts=["Give me my business health check","Where am I leaking money?","What should I focus on this week?","How do I grow revenue from this pipeline?"];
  return <section className="panel module-panel assistant-panel"><ModuleHeading kicker="AI BUSINESS COPILOT" title="MAEKRAVON AI" description="Ask for finance analysis, growth strategy, CRM priorities, risk detection, and an operator-style next-action plan." right={<span className="local-chip">AI + WORKSPACE DATA</span>}/>
    <div className="assistant-disclaimer">MAEKRAVON uses the data saved in this workspace. CRM deal values are kept separate from recorded financial transactions. Financial, tax, legal, lending, and investment decisions should be verified with the appropriate professional.</div>
    <div className="assistant-chat">{messages.map(message=><div className={`chat-message ${message.role}`} key={message.id}><div className="chat-avatar">{message.role==="assistant"?"MK":"YOU"}</div><div><span>{message.role==="assistant"?"MAEKRAVON":"You"}</span><p>{message.text}</p></div></div>)}{busy&&<div className="chat-message"><div className="chat-avatar">MK</div><div><span>MAEKRAVON</span><p>Analyzing your workspace...</p></div></div>}</div>
    <div className="prompt-chips">{prompts.map(p=><button key={p} disabled={busy} onClick={()=>void onAsk(p)}>{p}</button>)}</div>
    <form className="assistant-input" onSubmit={submit}><input value={question} disabled={busy} onChange={e=>setQuestion(e.target.value)} placeholder="Ask about cash flow, expenses, leads, growth, risks, or next actions..."/><button className="primary-btn" disabled={busy||!question.trim()} type="submit"><ArrowUpRight size={15}/> {busy?"Analyzing...":"Ask"}</button></form>
  </section>;
}

function AutomationsModule({ rules, onChange, followUpCount }: { rules: AutomationSettings; onChange: (value: AutomationSettings) => void; followUpCount: number }) {
  const items: {key:keyof AutomationSettings;title:string;description:string;tag:string}[]=[
    {key:"newLeadTask",title:"New lead follow-up",description:"When a new lead is added, automatically create a high-priority task to contact them today.",tag:"LEAD INTAKE"},
    {key:"qualifiedTask",title:"Qualified lead proposal task",description:"When a lead moves to Qualified, create a task to prepare and send a proposal.",tag:"SALES PROCESS"},
    {key:"appointmentAlerts",title:"Appointment reminders",description:"Highlight the appointment schedule and show a reminder notice when this rule is enabled. No email or text is sent.",tag:"SCHEDULING"},
  ];
  return <section className="panel module-panel"><ModuleHeading kicker="WORKFLOW BUILDER" title="Automations" description="Manage server-backed workspace automations for lead follow-up and operational reminders." right={<span className="module-count">{Object.values(rules).filter(Boolean).length} ACTIVE</span>}/>
    <div className="automation-summary"><div><strong>{followUpCount}</strong><span>Open follow-up tasks</span></div><div><strong>{Object.values(rules).filter(Boolean).length}/3</strong><span>Rules enabled</span></div><div><strong>CLOUD</strong><span>Supabase-backed rules</span></div></div>
    <div className="automation-list">{items.map(item=><div className="automation-row" key={item.key}><div className="automation-symbol"><Workflow size={18}/></div><div className="automation-main"><span>{item.tag}</span><strong>{item.title}</strong><p>{item.description}</p></div><label className="switch-control"><input type="checkbox" checked={rules[item.key]} onChange={e=>onChange({...rules,[item.key]:e.target.checked})}/><span/></label></div>)}</div>
    <div className="module-notice">New-lead and qualified-lead follow-ups are created by Supabase database triggers. Appointment reminders are generated server-side as in-app notifications. Email, SMS, and external calendar actions are not connected yet.</div>
  </section>;
}

function RevenueModule({ leads, pipeline, won, forecast, goal }: { leads: Lead[]; pipeline: number; won: number; forecast: number; goal: number }) {
  const statusOrder: LeadStatus[]=["New","Contacted","Qualified","Won","Lost"];
  const sources: LeadSource[]=["Website","Referral","Social Media","Phone","Walk-in","Other"];
  const maxStatus=Math.max(1,...statusOrder.map(s=>leads.filter(l=>l.status===s).length));
  const total=leads.reduce((sum,l)=>sum+l.value,0);
  return <div className="module-stack"><section className="module-stats revenue-stats"><div><span>Open pipeline</span><strong>{money(pipeline)}</strong></div><div><span>Won revenue value</span><strong>{money(won)}</strong></div><div><span>Weighted forecast</span><strong>{money(forecast)}</strong></div><div><span>Total opportunity value</span><strong>{money(total)}</strong></div></section>
    <section className="panel module-panel"><ModuleHeading kicker="BUSINESS PERFORMANCE" title="Revenue intelligence" description="A live summary of the opportunities and deal values currently saved in your CRM."/>
      <div className="intelligence-grid"><div className="chart-card"><h3>Pipeline by stage</h3>{statusOrder.map(status=>{const items=leads.filter(l=>l.status===status);const value=items.reduce((sum,l)=>sum+l.value,0);return <div className="bar-row" key={status}><div><span>{status}</span><strong>{money(value)}</strong></div><div className="bar-track"><i style={{width:`${(items.length/maxStatus)*100}%`}}/></div><small>{items.length} deal{items.length===1?"":"s"}</small></div>})}</div>
      <div className="chart-card"><h3>Lead sources</h3>{sources.map(source=>{const count=leads.filter(l=>l.source===source).length;return <div className="source-row" key={source}><span>{source}</span><div className="source-bar"><i style={{width:`${leads.length?count/leads.length*100:0}%`}}/></div><strong>{count}</strong></div>})}<div className="goal-progress"><div><span>Won value vs. monthly goal</span><strong>{goal?`${Math.min(100,won/goal*100).toFixed(0)}%`:"Set a goal in Settings"}</strong></div><div className="bar-track"><i style={{width:`${goal?Math.min(100,won/goal*100):0}%`}}/></div></div></div></div>
      <div className="module-notice">The forecast is an estimate based on starter stage weights. These figures are calculated from CRM deal values, not bank balances, invoices, or accounting records.</div>
    </section></div>;
}

function FinanceModule({ transactions, status, message, onAdd, onDelete }: {
  transactions: FinanceTransaction[];
  status: "loading" | "connected" | "setup_required" | "error";
  message: string;
  onAdd: (input: FinanceTransactionInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [kind,setKind]=useState<"income"|"expense">("income");
  const [amount,setAmount]=useState("");
  const [category,setCategory]=useState("Sales");
  const [description,setDescription]=useState("");
  const [date,setDate]=useState(today());
  const [recurring,setRecurring]=useState(false);
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState("");
  const month=today().slice(0,7);
  const monthRows=transactions.filter(item=>item.date.startsWith(month));
  const income=monthRows.filter(item=>item.kind==="income").reduce((sum,item)=>sum+item.amount,0);
  const expenses=monthRows.filter(item=>item.kind==="expense").reduce((sum,item)=>sum+item.amount,0);
  const net=income-expenses;
  const allNet=transactions.reduce((sum,item)=>sum+(item.kind==="income"?item.amount:-item.amount),0);
  const recurringExpenseTotal=transactions.filter(item=>item.kind==="expense"&&item.recurring).reduce((sum,item)=>sum+item.amount,0);
  const expenseCategories=[...new Set(monthRows.filter(item=>item.kind==="expense").map(item=>item.category))].map(name=>({name,total:monthRows.filter(item=>item.kind==="expense"&&item.category===name).reduce((sum,item)=>sum+item.amount,0)})).sort((a,b)=>b.total-a.total);
  const maxCategory=Math.max(1,...expenseCategories.map(item=>item.total));
  async function submit(event:FormEvent){event.preventDefault();const value=Number(amount);if(!value||value<=0)return;setBusy(true);setFeedback("");try{await onAdd({kind,amount:value,category,description,date,recurring});setAmount("");setDescription("");setRecurring(false);setFeedback("Saved to the MAEKRAVON finance ledger.");}catch(error){setFeedback(error instanceof Error?error.message:"Could not save this record.");}finally{setBusy(false);}}
  if(status==="loading") return <section className="panel module-panel"><ModuleHeading kicker="BUSINESS FINANCE" title="Finance command center" description="Loading your workspace ledger..."/></section>;
  return <div className="module-stack">
    <section className="module-stats finance-kpis"><div><span>This month income</span><strong>{money(income)}</strong></div><div><span>This month expenses</span><strong>{money(expenses)}</strong></div><div><span>Net cash flow</span><strong className={net<0?"negative-value":""}>{money(net)}</strong></div><div><span>Recorded net movement</span><strong className={allNet<0?"negative-value":""}>{money(allNet)}</strong></div></section>
    <section className="panel module-panel"><ModuleHeading kicker="MONEY IN · MONEY OUT" title="Finance command center" description="Record business income and expenses so MAEKRAVON can analyze real financial activity separately from CRM deal values." right={<span className="module-count">{transactions.length} RECORDS</span>}/>
      {status==="setup_required"&&<div className="launch-alert"><strong>Finance database upgrade required</strong><span>Apply the included MAEKRAVON Launch Patch migration to Supabase, then refresh this page.</span></div>}
      {status==="error"&&<div className="launch-alert"><strong>Finance connection issue</strong><span>{message}</span></div>}
      <form className="finance-entry-form" onSubmit={submit}>
        <label>Type<select value={kind} onChange={e=>{const next=e.target.value as "income"|"expense";setKind(next);if(next==="income"&&category==="Operating expense")setCategory("Sales");}}><option value="income">Income</option><option value="expense">Expense</option></select></label>
        <label>Amount<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" required/></label>
        <label>Category<input value={category} onChange={e=>setCategory(e.target.value)} placeholder={kind==="income"?"Sales":"Payroll, software, rent..."}/></label>
        <label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
        <label className="finance-description">Description<input value={description} onChange={e=>setDescription(e.target.value)} placeholder="What was this for?"/></label>
        <label className="finance-recurring"><input type="checkbox" checked={recurring} onChange={e=>setRecurring(e.target.checked)}/> Recurring monthly</label>
        <button className="primary-btn" type="submit" disabled={busy||status==="setup_required"}>{busy?"Saving...":kind==="income"?"Record income":"Record expense"}</button>
      </form>
      {feedback&&<div className="module-notice">{feedback}</div>}
      <div className="finance-grid">
        <div className="chart-card"><h3>Expense pressure</h3>{expenseCategories.length?expenseCategories.slice(0,6).map(item=><div className="bar-row" key={item.name}><div><span>{item.name}</span><strong>{money(item.total)}</strong></div><div className="bar-track"><i style={{width:`${item.total/maxCategory*100}%`}}/></div></div>):<div className="module-empty">No expenses recorded this month.</div>}<div className="goal-progress"><div><span>Recurring expenses marked</span><strong>{money(recurringExpenseTotal)}</strong></div></div></div>
        <div className="finance-health-card"><div className="panel-kicker">MAEKRAVON FINANCIAL PULSE</div><strong className={net>=0?"health-positive":"health-negative"}>{net>=0?"Positive cash flow":"Negative cash flow"}</strong><p>{transactions.length?`${money(income)} came in and ${money(expenses)} went out this month. ${net>=0?"Protect the margin and decide what to reinvest.":"Review the largest expense categories and near-term sales opportunities."}`:"Add your first income or expense record to activate financial analysis."}</p><div className="finance-mini"><span>CRM won deal value</span><b>Kept separate from cash</b></div><div className="finance-mini"><span>Bank connectivity</span><b>Connector-ready, not linked</b></div></div>
      </div>
      <div className="finance-ledger"><div className="detail-card-heading"><div><div className="panel-kicker">RECENT ACTIVITY</div><h3>Transaction ledger</h3></div><ReceiptText size={17}/></div>{transactions.length?transactions.slice(0,60).map(item=><div className="finance-row" key={item.id}><div className={`finance-kind ${item.kind}`}><DollarSign size={15}/></div><div className="finance-row-main"><strong>{item.description||item.category}</strong><small>{item.category} · {new Date(item.date+"T12:00:00").toLocaleDateString()} · {item.source}{item.recurring?" · recurring":""}</small></div><b className={item.kind==="expense"?"expense-amount":"income-amount"}>{item.kind==="expense"?"−":"+"}{money(item.amount)}</b><button className="icon-btn danger-icon" onClick={()=>void onDelete(item.id)} aria-label="Delete financial record"><Trash2 size={15}/></button></div>):<div className="module-empty">No financial records yet. Record an income payment or business expense above.</div>}</div>
      <div className="module-notice">This ledger is for business planning and AI analysis. Until you connect a bank or accounting provider, it only knows the transactions you record here and should not be treated as a reconciled bank balance or official accounting statement.</div>
    </section>
  </div>;
}

function TeamModule({ members, invitations, onInvite, onRoleChange, onRemove, onRevoke }: {
  members: TeamMember[];
  invitations: WorkspaceInvitation[];
  onInvite: (email: string, role: "admin" | "manager" | "member") => Promise<void>;
  onRoleChange: (memberId: string, role: "admin" | "manager" | "member") => Promise<void>;
  onRemove: (memberId: string) => Promise<void>;
  onRevoke: (invitationId: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "manager" | "member">("member");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setFeedback("");
    try { await onInvite(email.trim(), role); setEmail(""); setRole("member"); setFeedback("Invitation sent. The recipient must accept the email link to join this workspace."); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Invitation could not be sent."); }
    finally { setBusy(false); }
  }
  async function changeRole(memberId: string, nextRole: "admin" | "manager" | "member") {
    setBusy(true); setFeedback("");
    try { await onRoleChange(memberId, nextRole); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Role update failed."); }
    finally { setBusy(false); }
  }
  async function removeMember(memberId: string) {
    if (!window.confirm("Remove this person from the workspace? Their login account will not be deleted.")) return;
    setBusy(true); setFeedback("");
    try { await onRemove(memberId); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Member could not be removed."); }
    finally { setBusy(false); }
  }
  async function revoke(invitationId: string) {
    if (!window.confirm("Revoke this pending invitation?")) return;
    setBusy(true); setFeedback("");
    try { await onRevoke(invitationId); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Invitation could not be revoked."); }
    finally { setBusy(false); }
  }
  return <section className="panel module-panel"><ModuleHeading kicker="PEOPLE & ACCESS" title="Team workspace" description="Invite people and manage access inside this workspace." right={<span className="module-count">{members.length} MEMBERS</span>} />
    <form className="module-form team-form" onSubmit={submit}>
      <label>Invite by email<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="teammate@business.com" required /></label>
      <label>Workspace role<select value={role} onChange={event => setRole(event.target.value as "admin" | "manager" | "member")}><option value="member">Member</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label>
      <button className="primary-btn" type="submit" disabled={busy}><Mail size={15}/> {busy ? "Working..." : "Send invitation"}</button>
    </form>
    {feedback && <div className="module-notice">{feedback}</div>}
    <div className="panel-kicker" style={{ marginTop: 22 }}>ACTIVE WORKSPACE MEMBERS</div>
    <div className="team-list">{members.map(member => {
      const normalizedRole = member.role.toLowerCase();
      return <div className="team-row" key={member.id}><div className="team-avatar">{initials(member.name)}</div><div className="team-member-copy"><strong>{member.name}</strong><small>{member.email || "Workspace account"}</small></div>
        {normalizedRole === "owner" ? <span className="team-role">Owner</span> : <select className="team-role" aria-label={`Role for ${member.name}`} value={normalizedRole} disabled={busy} onChange={event => void changeRole(member.id, event.target.value as "admin" | "manager" | "member")}><option value="admin">Admin</option><option value="manager">Manager</option><option value="member">Member</option></select>}
        <span className={`member-status ${member.status.toLowerCase()}`}>{member.status}</span>
        {normalizedRole !== "owner" && <button className="text-btn" disabled={busy} onClick={() => void removeMember(member.id)}>Remove</button>}
      </div>;
    })}</div>
    {!members.length && <div className="module-empty">No workspace members were returned for this account.</div>}
    <div className="panel-kicker" style={{ marginTop: 24 }}>PENDING INVITATIONS</div>
    <div className="team-list">{invitations.map(invite => <div className="team-row" key={invite.id}><div className="team-avatar"><Mail size={15}/></div><div className="team-member-copy"><strong>{invite.email}</strong><small>{invite.role} · Expires {new Date(invite.expiresAt).toLocaleDateString()}</small></div><span className="member-status pending">Pending</span><button className="text-btn" disabled={busy} onClick={() => void revoke(invite.id)}>Revoke</button></div>)}</div>
    {!invitations.length && <div className="module-empty">No pending invitations.</div>}
    <div className="module-notice">Owners can manage admins, managers, and members. Admins can manage managers and members. Managers can invite and manage members. Removing a member removes workspace access, not their Supabase login account.</div>
  </section>;
}

function SettingsModule({ settings, onSave, onExport }: { settings: WorkspaceSettings; onSave: (value: WorkspaceSettings)=>void; onExport: ()=>void }) {
  const [draft,setDraft]=useState(settings);
  useEffect(()=>setDraft(settings),[settings]);
  function submit(e:FormEvent){e.preventDefault();onSave(draft);}
  return <section className="panel module-panel"><ModuleHeading kicker="WORKSPACE PREFERENCES" title="Settings" description="Set the workspace identity and a simple monthly sales goal. Settings sync to your cloud workspace."/>
    <form className="settings-form" onSubmit={submit}><label>Business name<input value={draft.businessName} onChange={e=>setDraft({...draft,businessName:e.target.value})} placeholder="Your business name"/></label><label>Workspace owner<input value={draft.ownerName} onChange={e=>setDraft({...draft,ownerName:e.target.value})} placeholder="Owner name"/></label><label>Monthly sales goal ($)<input type="number" min="0" value={draft.monthlyGoal} onChange={e=>setDraft({...draft,monthlyGoal:e.target.value})}/></label><label>Currency<select value={draft.currency} onChange={e=>setDraft({...draft,currency:e.target.value})}><option value="USD">USD · US Dollar</option></select></label><label>Timezone<select value={draft.timezone} onChange={e=>setDraft({...draft,timezone:e.target.value})}><option value="America/Chicago">Central Time</option><option value="America/New_York">Eastern Time</option><option value="America/Denver">Mountain Time</option><option value="America/Los_Angeles">Pacific Time</option></select></label><div className="settings-actions"><button type="submit" className="primary-btn"><Save size={15}/> Save settings</button><button type="button" className="secondary-btn" onClick={onExport}><Download size={15}/> Export full backup</button></div></form>
    <div className="module-notice">Business preferences are saved in Supabase and can load on other signed-in devices. Core follow-up and reminder automations are server-backed.</div>
  </section>;
}
