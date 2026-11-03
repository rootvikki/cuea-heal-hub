import { useState, useEffect, useMemo } from "react";
import { DirectOrderDialog } from "@/components/DirectOrderDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search, ClipboardList, Calendar, Radio, ArrowRight, Clock, Loader2, Pencil, Send, FlaskConical, Pill, BarChart3, Users, X,
} from "lucide-react";
import { PatientRegistrationDialog } from "@/components/PatientRegistrationDialog";
import { EditBiodataDialog } from "@/components/EditBiodataDialog";
import { SendToDialog } from "@/components/SendToDialog";
import { isStaleTicket } from "@/components/StationQueue";
import { InterimPayment } from "@/components/InterimPayment";
import { VisitsReport } from "@/components/StationReports";
import { calculateAgeYears, cn } from "@/lib/utils";
import { PAYMENT_MODES, paymentModeLabel, type PaymentMode } from "@/lib/pricing";
import { stageLabel, STATIONS, type StationKey } from "@/lib/stations";
import { logAuditEvent } from "@/lib/auditLog";
import { notifyRoles } from "@/lib/notifications";

const PRIORITY_OPTIONS = [
  { value: "1", label: "Normal", color: "bg-muted border-border text-foreground" },
  { value: "2", label: "High", color: "bg-warning/15 border-[hsl(var(--warning))] text-[hsl(var(--warning))]" },
  { value: "3", label: "Emergency", color: "bg-destructive/15 border-destructive text-destructive" },
];

const INSURANCE_PROVIDERS = ["SHA", "Pacis", "Madison", "CIC", "AAR", "Jubilee", "Britam", "Old Mutual", "Other"];

/** Where a patient can go straight from reception. */
const FIRST_STOPS: { key: StationKey | "lab_request" | "pharmacy_request"; label: string; hint: string }[] = [
  { key: "triage", label: "Triage", hint: "Normal visit" },
  { key: "dental", label: "Dental", hint: "Dental clinic" },
  { key: "lab_request", label: "Laboratory", hint: "Brought a lab request" },
  { key: "pharmacy_request", label: "Pharmacy", hint: "Brought a prescription" },
  { key: "billing", label: "Billing", hint: "Payment only" },
];

const TYPE_LABEL: Record<string, string> = { cuea_staff: "Staff", cuea_student: "Student", outsider: "Outsider", dependent: "Dependent" };

const displayName = (p: any) => p?.full_name?.trim() || (p?.national_id ? `ID: ${p.national_id}` : p?.patient_id) || "Unknown patient";

interface FrontDeskPatient {
  id: string; patient_id: string; user_id: string; national_id: string | null; patient_type: string | null; visit_reason: string | null;
  admission_number: string | null; payroll_number: string | null; email: string | null; insurance_provider: string | null; insurance_number: string | null;
  preferred_payment_mode?: string | null; created_at: string | null;
  full_name: string; address?: string | null; phone: string | null; gender: string | null; date_of_birth: string | null;
}

const Reception = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [isLive, setIsLive] = useState(false);

  const [checkInPatient, setCheckInPatient] = useState<FrontDeskPatient | null>(null);
  const [checkIn, setCheckIn] = useState({ departmentId: "", priority: "1", paymentMode: "mpesa_school_fees" as PaymentMode, firstStop: "triage" as (typeof FIRST_STOPS)[number]["key"], insuranceProvider: "", insuranceNumber: "" });
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCheckingInAppointment, setIsCheckingInAppointment] = useState<string | null>(null);
  const [editPatient, setEditPatient] = useState<FrontDeskPatient | null>(null);
  const [direct, setDirect] = useState<{ mode: "lab" | "pharmacy"; ticket: any } | null>(null);
  const [sendTicket, setSendTicket] = useState<any>(null);

  // Patients — reception sees identification & contact details only (no clinical records)
  const { data: patients = [], isLoading: patientsLoading } = useQuery({
    queryKey: ["reception-patients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*, profiles!inner(full_name, phone, gender, date_of_birth, address)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((p: any): FrontDeskPatient => ({
        id: p.id, patient_id: p.patient_id, user_id: p.user_id, national_id: p.national_id, patient_type: p.patient_type,
        visit_reason: p.visit_reason, admission_number: p.admission_number, payroll_number: p.payroll_number, email: p.email,
        insurance_provider: p.insurance_provider, insurance_number: p.insurance_number, preferred_payment_mode: p.preferred_payment_mode,
        created_at: p.created_at,
        full_name: p.profiles?.full_name || "", address: p.profiles?.address || null, phone: p.profiles?.phone || null, gender: p.profiles?.gender || null, date_of_birth: p.profiles?.date_of_birth || null,
      }));
    },
    staleTime: 30000,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await supabase.from("departments").select("*")).data || [],
    staleTime: 300000,
  });

  const { data: todayAppointments = [], refetch: refetchAppointments } = useQuery({
    queryKey: ["today-appointments"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients!inner(id, patient_id, user_id, visit_reason, preferred_payment_mode, profiles!inner(full_name)), departments!inner(name)")
        .gte("appointment_date", today)
        .lt("appointment_date", `${today}T23:59:59`)
        .order("appointment_date");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  const { data: activeTickets = [] } = useQuery({
    queryKey: ["reception-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("*, patients!inner(id, patient_id, profiles!inner(full_name)), departments!inner(name)")
        .neq("status", "checked_out")
        .order("priority", { ascending: false })
        .order("checked_in_at", { ascending: true });
      if (error) throw error;
      return (data || []).map((t: any) => ({
        ...t,
        patient: { id: t.patients?.id, patient_id: t.patients?.patient_id, profile: { full_name: t.patients?.profiles?.full_name } },
        department: { name: t.departments?.name },
      }));
    },
    refetchInterval: 15000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("reception-tickets-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => {
        queryClient.invalidateQueries({ queryKey: ["reception-queue"] });
      })
      .subscribe((status) => setIsLive(status === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const activeByPatient = useMemo(() => {
    const m = new Map<string, any>();
    activeTickets.forEach((t: any) => m.set(t.patient_id, t));
    return m;
  }, [activeTickets]);

  // Search every identifying field: name, OPD, ID/passport, phone, email, student/staff no., insurance no., ticket no.
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const filtered = patients.filter((p) => {
      if (typeFilter !== "all" && p.patient_type !== typeFilter) return false;
      if (genderFilter !== "all" && (p.gender || "").toLowerCase() !== genderFilter) return false;
      if (!q) return true;
      const ticket = activeByPatient.get(p.id);
      const hay = [p.full_name, p.patient_id, p.national_id, p.email, p.admission_number, p.payroll_number, p.insurance_number, ticket?.ticket_number]
        .filter(Boolean).join(" ").toLowerCase();
      if (hay.includes(q)) return true;
      // Phone: match on digits so "0712 345" finds "+254712345…"
      if (digits.length >= 3 && p.phone) {
        const pd = p.phone.replace(/\D/g, "");
        if (pd.includes(digits) || pd.includes(digits.replace(/^0/, ""))) return true;
      }
      return q.split(/\s+/).every((w) => hay.includes(w));
    });
    return filtered.slice(0, q || typeFilter !== "all" || genderFilter !== "all" ? 25 : 8);
  }, [patients, search, typeFilter, genderFilter, activeByPatient]);

  const openCheckIn = (p: FrontDeskPatient) => {
    const existing = activeByPatient.get(p.id);
    if (existing && !isStaleTicket(existing)) {
      toast.info(`${displayName(p)} is already in the queue`, { description: `${existing.ticket_number} · ${stageLabel(existing.workflow_stage || existing.status)}` });
      return;
    }
    setCheckInPatient(p);
    const mode = (p.preferred_payment_mode as PaymentMode) || (p.insurance_provider ? "insurance" : "mpesa_school_fees");
    setCheckIn({
      departmentId: departments.length === 1 ? departments[0].id : (departments.find((d: any) => /out ?patient|general|opd/i.test(d.name))?.id ?? departments[0]?.id ?? ""),
      priority: "1",
      paymentMode: mode,
      firstStop: p.visit_reason === "dental" ? "dental" : "triage",
      insuranceProvider: p.insurance_provider || "",
      insuranceNumber: p.insurance_number || "",
    });
  };

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = checkInPatient;
    if (!p || isCheckingIn) return;
    if (checkIn.paymentMode === "insurance" && !checkIn.insuranceProvider) {
      toast.error("Select the insurance provider");
      return;
    }
    setIsCheckingIn(true);
    try {
      const { data: openTickets } = await supabase.from("tickets").select("id, ticket_number, checked_in_at, created_at").eq("patient_id", p.id).neq("status", "checked_out");
      const current = (openTickets || []).filter((t) => !isStaleTicket(t));
      if (current.length > 0) {
        toast.error("Already checked in", { description: `Active ticket: ${current[0].ticket_number}` });
        return;
      }
      // A visit from a previous day that was never closed must not block today's check-in
      const leftover = (openTickets || []).filter((t) => isStaleTicket(t)).map((t) => t.id);
      if (leftover.length) {
        await supabase.from("tickets").update({ status: "checked_out", workflow_stage: "checked_out", checked_out_at: new Date().toISOString(), assigned_to: null, claimed_at: null }).in("id", leftover);
      }

      // Remember payment details on the patient for next time
      await supabase.from("patients").update({
        preferred_payment_mode: checkIn.paymentMode,
        ...(checkIn.paymentMode === "insurance" ? { insurance_provider: checkIn.insuranceProvider, insurance_number: checkIn.insuranceNumber || null } : {}),
      } as any).eq("id", p.id);

      const stop = checkIn.firstStop;
      const stationStage = stop === "lab_request" || stop === "pharmacy_request" ? "checked_in" : STATIONS.find((s) => s.key === stop)!.stage;
      const ticketNumber = `T-${Date.now().toString().slice(-6)}`;
      const { data: ticket, error } = await supabase.from("tickets").insert({
        ticket_number: ticketNumber,
        patient_id: p.id,
        department_id: checkIn.departmentId,
        priority: parseInt(checkIn.priority),
        status: stationStage as any,
        workflow_stage: stationStage,
        payment_mode: checkIn.paymentMode,
      } as any).select("*").single();
      if (error) throw error;

      logAuditEvent({ action: "patient_checked_in", module: "reception", details: { ticket_id: ticket.id, first_stop: stop, payment_mode: checkIn.paymentMode } });
      setCheckInPatient(null);
      setSearch("");
      queryClient.invalidateQueries({ queryKey: ["reception-queue"] });

      if (stop === "lab_request" || stop === "pharmacy_request") {
        toast.success(`Checked in: ${ticketNumber}`, { description: "Now enter the request" });
        setDirect({ mode: stop === "lab_request" ? "lab" : "pharmacy", ticket: { ...ticket, patient: { id: p.id, patient_id: p.patient_id, profile: { full_name: p.full_name } } } });
      } else {
        const station = STATIONS.find((s) => s.key === stop)!;
        if (station.roles.length) {
          await notifyRoles(station.roles, { title: `New patient for ${station.label}`, message: `${displayName(p)} (${ticketNumber})`, category: "queue", referenceId: ticket.id, link: station.link });
        }
        toast.success(`Checked in: ${ticketNumber}`, { description: `${displayName(p)} → ${station.label}` });
      }
    } catch (err: any) {
      toast.error("Check-in failed", { description: err.message });
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleCheckInFromAppointment = async (apt: any) => {
    const patientId = apt.patients?.id;
    if (!patientId || isCheckingInAppointment) return;
    setIsCheckingInAppointment(apt.id);
    try {
      const { data: openTickets } = await supabase.from("tickets").select("id, ticket_number, checked_in_at, created_at").eq("patient_id", patientId).neq("status", "checked_out");
      const existing = (openTickets || []).filter((t) => !isStaleTicket(t));
      const leftover = (openTickets || []).filter((t) => isStaleTicket(t)).map((t) => t.id);
      if (leftover.length) await supabase.from("tickets").update({ status: "checked_out", workflow_stage: "checked_out", checked_out_at: new Date().toISOString() }).in("id", leftover);
      if (existing.length > 0) {
        toast.error("Already checked in", { description: `Active ticket: ${existing[0].ticket_number}` });
        return;
      }
      const isDental = apt.patients?.visit_reason === "dental";
      const ticketNumber = `T-${Date.now().toString().slice(-6)}`;
      const { error } = await supabase.from("tickets").insert({
        ticket_number: ticketNumber, patient_id: patientId, department_id: apt.department_id, priority: 1,
        status: isDental ? "at_dental" : "triage", workflow_stage: isDental ? "at_dental" : "triage", appointment_id: apt.id,
        payment_mode: apt.patients?.preferred_payment_mode || "mpesa_school_fees",
      } as any);
      if (error) throw error;
      await supabase.from("appointments").update({ status: "confirmed" }).eq("id", apt.id);
      toast.success(`Checked in: ${ticketNumber}`, { description: `${apt.patients?.profiles?.full_name || apt.patients?.patient_id} from appointment` });
      refetchAppointments();
      queryClient.invalidateQueries({ queryKey: ["reception-queue"] });
    } catch (err: any) {
      toast.error("Could not check in", { description: err.message });
    } finally {
      setIsCheckingInAppointment(null);
    }
  };

  const handlePatientRegistered = async (data: { patientRecordId: string; patientId: string; visitReason: string; existing: boolean; fullName: string }) => {
    await queryClient.invalidateQueries({ queryKey: ["reception-patients"] });
    const fresh = (queryClient.getQueryData(["reception-patients"]) as FrontDeskPatient[] | undefined)?.find((p) => p.id === data.patientRecordId);
    openCheckIn(fresh ?? {
      id: data.patientRecordId, patient_id: data.patientId, user_id: "", national_id: null, patient_type: null, visit_reason: data.visitReason,
      admission_number: null, payroll_number: null, email: null, insurance_provider: null, insurance_number: null, created_at: null,
      full_name: data.fullName, phone: null, gender: null, date_of_birth: null,
    });
  };

  const waitMins = (since: string) => Math.floor((Date.now() - new Date(since).getTime()) / 60000);

  // Visits from previous days that nobody closed — kept out of today's list
  const staleTickets = useMemo(() => activeTickets.filter((t: any) => isStaleTicket(t)), [activeTickets]);
  const todayTickets = useMemo(() => activeTickets.filter((t: any) => !isStaleTicket(t)), [activeTickets]);
  const [closingOld, setClosingOld] = useState(false);
  const [confirmCloseOld, setConfirmCloseOld] = useState(false);
  const closeOldVisits = async () => {
    setClosingOld(true);
    try {
      const ids = staleTickets.map((t: any) => t.id);
      const now = new Date().toISOString();
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await supabase.from("tickets").update({ status: "checked_out", workflow_stage: "checked_out", checked_out_at: now, assigned_to: null, claimed_at: null }).in("id", ids.slice(i, i + 100));
        if (error) throw error;
      }
      logAuditEvent({ action: "old_visits_closed", module: "reception", details: { count: ids.length } });
      toast.success(`Closed ${ids.length} old visit(s)`);
      queryClient.invalidateQueries({ queryKey: ["reception-queue"] });
    } catch (err: any) {
      toast.error("Could not close old visits", { description: err.message });
    } finally {
      setClosingOld(false);
      setConfirmCloseOld(false);
    }
  };

  const stageCounts = useMemo(() => {
    const m: Record<string, number> = {};
    todayTickets.forEach((t: any) => { const k = stageLabel(t.workflow_stage || t.status); m[k] = (m[k] || 0) + 1; });
    return m;
  }, [todayTickets]);
  const visibleTickets = stageFilter === "all" ? todayTickets : todayTickets.filter((t: any) => stageLabel(t.workflow_stage || t.status) === stageFilter);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold">Reception Desk</h1>
            {isLive && (
              <Badge variant="outline" className="gap-1 text-[hsl(var(--success))] border-[hsl(var(--success))]">
                <Radio className="h-3 w-3 animate-pulse" /> Live
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-1">Find or register a patient, choose payment mode, and send them where they need to go</p>
        </div>
        <PatientRegistrationDialog onSuccess={handlePatientRegistered} />
      </div>

      <Tabs defaultValue="desk" className="space-y-4">
        <TabsList>
          <TabsTrigger value="desk" className="gap-1.5"><ClipboardList className="h-4 w-4" /> Front desk</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><BarChart3 className="h-4 w-4" /> Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="desk" className="space-y-5">
          {/* Patient search */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg"><Search className="h-5 w-5" /> Find patient</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col lg:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    placeholder="Name, OPD no., ID/passport, phone, student/staff no., insurance no. or ticket…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-11 pr-10 h-14 text-base sm:text-lg"
                    autoFocus
                  />
                  {search && (
                    <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-5 w-5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 lg:w-80">
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-14"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="cuea_student">Students</SelectItem>
                      <SelectItem value="cuea_staff">Staff</SelectItem>
                      <SelectItem value="outsider">Outsiders</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={genderFilter} onValueChange={setGenderFilter}>
                    <SelectTrigger className="h-14"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All genders</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {search.trim() ? `${searchResults.length} match(es)` : "Recently registered — start typing to search"}
              </p>

              {patientsLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-6 space-y-3">
                  <p className="text-muted-foreground">No patient found for "{search}"</p>
                  <PatientRegistrationDialog onSuccess={handlePatientRegistered} />
                </div>
              ) : (
                <>
                  {/* Table on larger screens */}
                  <div className="hidden md:block overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-muted/60">
                        <tr className="text-left">
                          {["Name", "OPD No.", "ID / Passport", "Phone", "Age", "Gender", "Type / No.", ""].map((h) => (
                            <th key={h} className="px-3 py-2 font-semibold border-b whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {searchResults.map((p) => {
                          const t0 = activeByPatient.get(p.id);
                          const t = t0 && !isStaleTicket(t0) ? t0 : null;
                          return (
                            <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="px-3 py-2 font-semibold">{displayName(p)}</td>
                              <td className="px-3 py-2 font-mono whitespace-nowrap">{p.patient_id}</td>
                              <td className="px-3 py-2">{p.national_id || "—"}</td>
                              <td className="px-3 py-2 whitespace-nowrap">{p.phone || "—"}</td>
                              <td className="px-3 py-2">{calculateAgeYears(p.date_of_birth) ?? "—"}</td>
                              <td className="px-3 py-2 capitalize">{p.gender || "—"}</td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {TYPE_LABEL[p.patient_type || "outsider"]}
                                {(p.admission_number || p.payroll_number) && <span className="text-muted-foreground"> · {p.admission_number || p.payroll_number}</span>}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex justify-end gap-1.5">
                                  <Button size="sm" variant="ghost" onClick={() => setEditPatient(p)} aria-label="Edit details"><Pencil className="h-4 w-4" /></Button>
                                  {t ? (
                                    <Badge variant="soft" className="whitespace-nowrap">{stageLabel(t.workflow_stage || t.status)}</Badge>
                                  ) : (
                                    <Button size="sm" onClick={() => openCheckIn(p)} className="gap-1"><ArrowRight className="h-4 w-4" /> Check in</Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Cards on phones */}
                  <div className="md:hidden space-y-2">
                    {searchResults.map((p) => {
                      const t0 = activeByPatient.get(p.id);
                      const t = t0 && !isStaleTicket(t0) ? t0 : null;
                      return (
                        <div key={p.id} className="p-3 border rounded-lg space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold">{displayName(p)}</p>
                              <p className="text-xs text-muted-foreground font-mono">{p.patient_id}{p.national_id ? ` · ID ${p.national_id}` : ""}</p>
                            </div>
                            <Badge variant="outline" className="text-xs">{TYPE_LABEL[p.patient_type || "outsider"]}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{p.phone || "No phone"} · {calculateAgeYears(p.date_of_birth) ?? "?"} yrs · <span className="capitalize">{p.gender || "—"}</span></p>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditPatient(p)}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
                            {t ? <Badge variant="soft" className="flex-1 justify-center">{stageLabel(t.workflow_stage || t.status)}</Badge>
                              : <Button size="sm" className="flex-1" onClick={() => openCheckIn(p)}><ArrowRight className="h-4 w-4 mr-1" /> Check in</Button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-5">
            {/* Active queue */}
            <Card className="lg:col-span-3">
              <CardHeader className="pb-3 space-y-3">
                <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5" /> Patients in the clinic today ({todayTickets.length})</CardTitle>
                {staleTickets.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900">
                    <span>{staleTickets.length} visit(s) from previous days were never closed.</span>
                    <Button size="sm" variant="outline" className="h-8 bg-background" onClick={() => setConfirmCloseOld(true)}>Close old visits</Button>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant={stageFilter === "all" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setStageFilter("all")}>All {todayTickets.length}</Button>
                  {Object.entries(stageCounts).map(([k, n]) => (
                    <Button key={k} size="sm" variant={stageFilter === k ? "default" : "outline"} className="h-7 text-xs" onClick={() => setStageFilter(k)}>{k} {n}</Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {visibleTickets.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground text-sm">No patients here</p>
                ) : (
                  <div className="space-y-2 lg:max-h-[560px] lg:overflow-y-auto lg:pr-1">
                    {visibleTickets.map((ticket: any) => {
                      const mins = waitMins(ticket.updated_at || ticket.checked_in_at);
                      const name = displayName({ ...ticket.patient?.profile, patient_id: ticket.patient?.patient_id });
                      return (
                        <div key={ticket.id} className="p-3 border rounded-lg space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-sm">{ticket.ticket_number}</span>
                                <Badge variant="outline" className="text-xs">{stageLabel(ticket.workflow_stage || ticket.status)}</Badge>
                                <Badge variant="soft" className="text-[10px]">{paymentModeLabel(ticket.payment_mode)}</Badge>
                                {ticket.priority >= 3 && <Badge variant="destructive" className="text-[10px]">EMERGENCY</Badge>}
                              </div>
                              <p className="text-sm font-medium truncate">{name}</p>
                            </div>
                            <Badge className={cn("text-xs", mins >= 60 ? "bg-destructive text-destructive-foreground" : mins >= 30 ? "bg-warning" : "bg-muted text-muted-foreground")}>
                              <Clock className="h-3 w-3 mr-1" />{mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Button size="sm" variant="outline" className="h-8" onClick={() => setSendTicket({ id: ticket.id, patientName: name, stage: ticket.workflow_stage })}><Send className="h-3.5 w-3.5 mr-1" /> Send to…</Button>
                            <Button size="sm" variant="outline" className="h-8" onClick={() => setDirect({ mode: "lab", ticket })}><FlaskConical className="h-3.5 w-3.5 mr-1" /> Lab request</Button>
                            <Button size="sm" variant="outline" className="h-8" onClick={() => setDirect({ mode: "pharmacy", ticket })}><Pill className="h-3.5 w-3.5 mr-1" /> Prescription</Button>
                            <InterimPayment ticketId={ticket.id} patientId={ticket.patient_id} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Appointments */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg"><Calendar className="h-5 w-5" /> Today's appointments ({todayAppointments.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {todayAppointments.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground text-sm">No appointments today</p>
                ) : (
                  <div className="space-y-2 lg:max-h-[560px] lg:overflow-y-auto">
                    {todayAppointments.map((apt: any) => (
                      <div key={apt.id} className="flex items-center justify-between gap-2 p-3 border rounded-lg">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{new Date(apt.appointment_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            <Badge variant={apt.status === "scheduled" ? "outline" : "default"} className="text-xs">{apt.status}</Badge>
                          </div>
                          <p className="text-sm font-medium truncate">{apt.patients?.profiles?.full_name || apt.patients?.patient_id}</p>
                          <p className="text-xs text-muted-foreground">{apt.departments?.name}</p>
                        </div>
                        {apt.status === "scheduled" && (
                          <Button size="sm" onClick={() => handleCheckInFromAppointment(apt)} disabled={isCheckingInAppointment === apt.id} className="gap-1 shrink-0">
                            {isCheckingInAppointment === apt.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                            Check in
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reports">
          <Card><CardContent className="pt-6"><VisitsReport variant="reception" /></CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Check-in dialog */}
      <Dialog open={!!checkInPatient} onOpenChange={(o) => !o && setCheckInPatient(null)}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Check in patient</DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-foreground">{displayName(checkInPatient)}</span> ({checkInPatient?.patient_id})
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCheckIn} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Payment mode *</Label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_MODES.map((m) => (
                  <button key={m.value} type="button" onClick={() => setCheckIn({ ...checkIn, paymentMode: m.value })}
                    className={cn("p-3 rounded-lg border-2 text-left transition-all", checkIn.paymentMode === m.value ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-muted/50")}>
                    <p className="font-semibold text-sm">{m.label}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">{m.description}</p>
                  </button>
                ))}
              </div>
              {checkIn.paymentMode === "insurance" && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Select value={checkIn.insuranceProvider} onValueChange={(v) => setCheckIn({ ...checkIn, insuranceProvider: v })}>
                    <SelectTrigger className="h-11"><SelectValue placeholder="Provider *" /></SelectTrigger>
                    <SelectContent>{INSURANCE_PROVIDERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input className="h-11" placeholder="Member no." value={checkIn.insuranceNumber} onChange={(e) => setCheckIn({ ...checkIn, insuranceNumber: e.target.value })} />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Send to *</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {FIRST_STOPS.map((s) => (
                  <button key={s.key} type="button" onClick={() => setCheckIn({ ...checkIn, firstStop: s.key })}
                    className={cn("p-2.5 rounded-lg border-2 text-left transition-all", checkIn.firstStop === s.key ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-muted/50")}>
                    <p className="font-semibold text-sm">{s.label}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">{s.hint}</p>
                  </button>
                ))}
              </div>
              {(checkIn.firstStop === "lab_request" || checkIn.firstStop === "pharmacy_request") && (
                <p className="text-xs text-muted-foreground">Skips triage. You'll enter the tests / drugs next.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Priority</Label>
              <div className="grid grid-cols-3 gap-2">
                {PRIORITY_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setCheckIn({ ...checkIn, priority: opt.value })}
                    className={cn("p-2.5 rounded-lg border-2 text-center text-sm font-semibold transition-all",
                      checkIn.priority === opt.value ? `${opt.color} ring-2 ring-offset-1 ring-current` : "border-border bg-background hover:bg-muted/50 text-muted-foreground")}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {departments.length > 1 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Department</Label>
                <Select value={checkIn.departmentId} onValueChange={(v) => setCheckIn({ ...checkIn, departmentId: v })}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>{departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setCheckInPatient(null)} disabled={isCheckingIn}>Cancel</Button>
              <Button type="submit" disabled={isCheckingIn || !checkIn.departmentId} className="min-w-[8rem]">
                {isCheckingIn && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Check in
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {editPatient && (
        <EditBiodataDialog
          open={!!editPatient}
          onOpenChange={(o) => !o && setEditPatient(null)}
          patient={editPatient}
          profile={{ full_name: editPatient.full_name, gender: editPatient.gender, date_of_birth: editPatient.date_of_birth, phone: editPatient.phone, address: editPatient.address }}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["reception-patients"] })}
        />
      )}

      <DirectOrderDialog
        open={!!direct}
        onOpenChange={(o) => !o && setDirect(null)}
        mode={direct?.mode ?? "lab"}
        source="reception"
        ticket={direct ? { id: direct.ticket.id, patient_id: direct.ticket.patient_id ?? direct.ticket.patient?.id, department_id: direct.ticket.department_id, patientName: displayName({ ...direct.ticket.patient?.profile, patient_id: direct.ticket.patient?.patient_id }) } : null}
        onDone={() => queryClient.invalidateQueries({ queryKey: ["reception-queue"] })}
      />

      <Dialog open={confirmCloseOld} onOpenChange={setConfirmCloseOld}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Close {staleTickets.length} old visit(s)?</DialogTitle>
            <DialogDescription>
              These patients were checked in before today and never checked out. Closing marks the visits as checked out so today's queues only show
              patients who are really here. Their records, results and bills are not changed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmCloseOld(false)} disabled={closingOld}>Cancel</Button>
            <Button onClick={closeOldVisits} disabled={closingOld}>{closingOld && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Close old visits</Button>
          </div>
        </DialogContent>
      </Dialog>

      <SendToDialog
        open={!!sendTicket}
        onOpenChange={(o) => !o && setSendTicket(null)}
        ticket={sendTicket}
        from="Reception"
        onSent={() => queryClient.invalidateQueries({ queryKey: ["reception-queue"] })}
      />
    </div>
  );
};

export default Reception;
