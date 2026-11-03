import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { StationQueue, StationShell } from "@/components/StationQueue";
import { InterimPayment } from "@/components/InterimPayment";
import { PatientSummaryCard } from "@/components/PatientSummaryCard";
import { DirectOrderDialog } from "@/components/DirectOrderDialog";
import { SendToDialog } from "@/components/SendToDialog";
import { ReferralForm } from "@/components/ReferralForm";
import { LabResultsTable } from "@/components/LabResultsTable";
import { Plus, X, Send, Calendar, Search, Smile, FlaskConical, Pill, History, FileText, Loader2, Save } from "lucide-react";
import { currentStaffId, type StationKey } from "@/lib/stations";
import { formatKES, paymentModeLabel } from "@/lib/pricing";
import { calculateAge, cn } from "@/lib/utils";
import { logAuditEvent } from "@/lib/auditLog";
import { useUser } from "@/contexts/UserContext";

/** Dental price list, grouped so every procedure is visible at a glance. */
const DENTAL_CATALOG: { category: string; items: { name: string; price: number }[] }[] = [
  { category: "Examination", items: [{ name: "Dental Examination", price: 500 }, { name: "Dental Consultation", price: 500 }, { name: "Orthodontic Consultation", price: 2000 }] },
  { category: "Extractions", items: [{ name: "Simple Extraction", price: 1500 }, { name: "Closed Disimpaction", price: 2000 }, { name: "Open Disimpaction", price: 5000 }] },
  { category: "Restorations", items: [
    { name: "Amalgam Restoration F1", price: 2000 }, { name: "Amalgam Restoration F2", price: 2500 }, { name: "Amalgam Restoration F3", price: 3000 },
    { name: "Composite Filling F1", price: 2500 }, { name: "Composite Filling F2", price: 3000 }, { name: "Composite Filling F3", price: 3500 },
    { name: "GIC Filling F1", price: 2000 }, { name: "GIC Filling F2", price: 2500 }, { name: "GIC Filling F3", price: 3000 },
    { name: "Temporary Filling", price: 1000 },
  ] },
  { category: "Endodontics", items: [
    { name: "Root Canal - Anterior", price: 6000 }, { name: "Root Canal - Premolar", price: 8000 }, { name: "Root Canal - Molar", price: 10000 },
    { name: "Pulpotomy", price: 3000 }, { name: "Pulpectomy", price: 4000 }, { name: "Apicectomy", price: 8000 },
  ] },
  { category: "Periodontics", items: [{ name: "Scaling & Polishing", price: 3000 }, { name: "Deep Scaling (per quadrant)", price: 2000 }, { name: "Gum Treatment (per quadrant)", price: 3000 }] },
  { category: "Prosthodontics", items: [
    { name: "Crown - PFM", price: 15000 }, { name: "Crown - Full Metal", price: 12000 }, { name: "Crown - All Ceramic", price: 20000 },
    { name: "Stainless Steel Crown", price: 5000 }, { name: "Bridge Work (per unit)", price: 15000 }, { name: "Resin Bonded Bridge", price: 20000 },
    { name: "Denture - Partial (Acrylic)", price: 15000 }, { name: "Denture - Full", price: 25000 },
  ] },
  { category: "Preventive", items: [{ name: "Fluoride Application", price: 1000 }, { name: "Fissure Sealing (per tooth)", price: 1500 }, { name: "Teeth Whitening", price: 5000 }] },
  { category: "Surgery", items: [
    { name: "Dental Abscess I&D", price: 2000 }, { name: "Alveoloplasty", price: 3000 }, { name: "Suturing (per stitch)", price: 500 },
    { name: "Biopsy", price: 5000 }, { name: "Splinting (per tooth)", price: 1500 }, { name: "Hemostasis", price: 500 },
  ] },
  { category: "Dental X-ray", items: [{ name: "Dental X-Ray (Periapical)", price: 500 }, { name: "Dental X-Ray (OPG)", price: 2000 }] },
];

/** FDI tooth numbers as seen facing the patient. */
const TEETH = {
  upper: ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"],
  lower: ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"],
};

interface DentalEntry { procedure: string; teeth: string[]; notes: string; price: number }

const Dental = () => {
  const { profile: myProfile } = useUser();
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [entries, setEntries] = useState<DentalEntry[]>([]);
  const [procSearch, setProcSearch] = useState("");
  const [activeTeeth, setActiveTeeth] = useState<string[]>([]);
  const [clinical, setClinical] = useState({ complaint: "", findings: "", plan: "" });
  const [nextVisit, setNextVisit] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [direct, setDirect] = useState<"lab" | "pharmacy" | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [savedEncounterId, setSavedEncounterId] = useState<string | null>(null);

  useEffect(() => {
    setQueueCollapsed(!!selectedTicket);
    setEntries([]); setActiveTeeth([]); setNextVisit(""); setSavedEncounterId(null);
    setClinical({ complaint: "", findings: "", plan: "" });
  }, [selectedTicket?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPatientData = useCallback(async () => {
    if (!selectedTicket) return;
    const [hist, encs] = await Promise.all([
      supabase.from("dental_procedures").select("*").eq("patient_id", selectedTicket.patient_id).order("created_at", { ascending: false }).limit(50),
      supabase.from("encounters").select("id, chief_complaint, assessment, plan, encounter_type").eq("ticket_id", selectedTicket.id),
    ]);
    setHistory(hist.data || []);
    const encIds = (encs.data || []).map((e) => e.id);
    const dentalEnc = (encs.data || []).find((e) => e.encounter_type === "dental");
    if (dentalEnc) {
      setClinical((c) => ({
        complaint: c.complaint || (dentalEnc.chief_complaint && dentalEnc.chief_complaint !== "Dental Visit" && !/^Direct /.test(dentalEnc.chief_complaint) ? dentalEnc.chief_complaint : ""),
        findings: c.findings || dentalEnc.assessment || "",
        plan: c.plan || dentalEnc.plan || "",
      }));
    }
    if (encIds.length) {
      const { data } = await supabase.from("lab_orders")
        .select("id, status, created_at, completed_at, result_value, result_notes, flag, encounter_id, test:lab_tests_catalog(test_name, unit, normal_range), fields:lab_result_fields(field_name, field_value, unit, reference_range, flag, sort_order)")
        .in("encounter_id", encIds).order("created_at");
      setLabOrders(data || []);
    } else setLabOrders([]);
  }, [selectedTicket]);

  useEffect(() => { void loadPatientData(); }, [loadPatientData]);

  const catalog = useMemo(() => {
    const q = procSearch.trim().toLowerCase();
    return DENTAL_CATALOG.map((c) => ({ ...c, items: c.items.filter((i) => !q || i.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) })).filter((c) => c.items.length);
  }, [procSearch]);

  const addProcedure = (p: { name: string; price: number }) => {
    setEntries((prev) => [...prev, { procedure: p.name, teeth: activeTeeth, notes: "", price: p.price }]);
    toast.success(`Added ${p.name}`, { description: activeTeeth.length ? `Tooth ${activeTeeth.join(", ")}` : undefined });
    setActiveTeeth([]);
  };
  const toggleTooth = (t: string) => setActiveTeeth((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const total = entries.reduce((s, e) => s + e.price, 0);

  /** Ensures this visit has ONE dental encounter and returns its id. */
  const ensureDentalEncounter = async () => {
    if (savedEncounterId) return savedEncounterId;
    const { data: existing } = await supabase.from("encounters").select("id").eq("ticket_id", selectedTicket.id).eq("encounter_type", "dental").maybeSingle();
    const staffId = await currentStaffId();
    const payload = {
      chief_complaint: clinical.complaint || "Dental visit",
      assessment: clinical.findings || entries.map((e) => e.procedure).join(", ") || null,
      plan: [clinical.plan, nextVisit ? `Next visit: ${nextVisit}` : ""].filter(Boolean).join("\n") || null,
      follow_up_date: nextVisit || null,
    };
    if (existing) {
      await supabase.from("encounters").update(payload).eq("id", existing.id);
      setSavedEncounterId(existing.id);
      return existing.id;
    }
    const { data: dept } = await supabase.from("departments").select("id").ilike("name", "%dental%").maybeSingle();
    const { data, error } = await supabase.from("encounters").insert({
      patient_id: selectedTicket.patient_id, ticket_id: selectedTicket.id, doctor_id: staffId,
      department_id: dept?.id ?? selectedTicket.department_id, encounter_type: "dental", ...payload,
    }).select("id").single();
    if (error) throw new Error(`Visit record could not be saved: ${error.message}`);
    setSavedEncounterId(data.id);
    return data.id;
  };

  /** Saves notes + procedures (charges added to the bill). Safe to call more than once. */
  const saveVisit = async () => {
    if (!selectedTicket) return;
    const encounterId = await ensureDentalEncounter();
    const staffId = await currentStaffId();
    const { data: { user } } = await supabase.auth.getUser();
    for (const entry of entries) {
      const { error } = await supabase.from("dental_procedures").insert({
        patient_id: selectedTicket.patient_id, ticket_id: selectedTicket.id, dentist_id: staffId ?? user?.id ?? "",
        procedure_name: entry.procedure, encounter_id: encounterId,
        tooth_number: entry.teeth.join(", ") || null, notes: entry.notes || null,
        price: entry.price, next_visit: nextVisit || null,
      });
      if (error) throw new Error(error.message);
      await supabase.from("service_charges").insert({
        patient_id: selectedTicket.patient_id, ticket_id: selectedTicket.id, encounter_id: encounterId,
        service_type: "dental", description: `Dental: ${entry.procedure}${entry.teeth.length ? ` (tooth ${entry.teeth.join(", ")})` : ""}`,
        amount: entry.price, billing_stage: "dental",
      });
    }
    if (entries.length) logAuditEvent({ action: "dental_procedures_saved", module: "dental", details: { ticket_id: selectedTicket.id, count: entries.length } });
    setEntries([]);
    await loadPatientData();
  };

  const handleSaveOnly = async () => {
    setSaving(true);
    try { await saveVisit(); toast.success("Dental visit saved"); }
    catch (e) { toast.error("Could not save", { description: e instanceof Error ? e.message : String(e) }); }
    finally { setSaving(false); }
  };

  const openDirect = async (mode: "lab" | "pharmacy") => {
    try { await saveVisit(); setDirect(mode); }
    catch (e) { toast.error("Could not open request", { description: e instanceof Error ? e.message : String(e) }); }
  };

  const recommended: StationKey = "billing";
  const todaysDone = history.filter((h) => h.ticket_id === selectedTicket?.id);
  const pastHistory = history.filter((h) => h.ticket_id !== selectedTicket?.id);

  return (
    <StationShell
      queue={
        <StationQueue
          stationStages={["at_dental"]}
          nextStage="at_billing"
          title="Dental Queue"
          onSelectPatient={setSelectedTicket}
          selectedTicketId={selectedTicket?.id}
          collapsed={queueCollapsed}
          onToggleCollapse={() => setQueueCollapsed(!queueCollapsed)}
        />
      }
    >
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Smile className="h-7 w-7 text-primary" /> Dental</h1>
        <p className="text-muted-foreground text-sm mt-1">Notes, tooth chart, procedures, lab, prescriptions and referral — all on one screen</p>
      </div>

      {!selectedTicket ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Select a patient from the queue</CardContent></Card>
      ) : (
        <>
          <Card className="border-primary/30">
            <CardContent className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                <span className="text-base font-bold">{selectedTicket.patient?.profile?.full_name}</span>
                <span><span className="text-muted-foreground">OPD</span> <strong>{selectedTicket.patient?.patient_id}</strong></span>
                <span><span className="text-muted-foreground">Age</span> <strong>{calculateAge(selectedTicket.patient?.profile?.date_of_birth)}</strong></span>
                <span className="capitalize"><span className="text-muted-foreground">Sex</span> <strong>{selectedTicket.patient?.profile?.gender || "—"}</strong></span>
                <Badge variant="outline">{paymentModeLabel(selectedTicket.payment_mode)}</Badge>
                {selectedTicket.patient?.allergies?.length > 0 && <Badge variant="destructive">Allergies: {selectedTicket.patient.allergies.join(", ")}</Badge>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="h-8" onClick={() => openDirect("lab")}><FlaskConical className="h-4 w-4 mr-1" /> Lab request</Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => openDirect("pharmacy")}><Pill className="h-4 w-4 mr-1" /> Prescription</Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => setReferralOpen(true)}><FileText className="h-4 w-4 mr-1" /> Referral</Button>
                <InterimPayment ticketId={selectedTicket.id} patientId={selectedTicket.patient_id} />
              </div>
            </CardContent>
          </Card>

          <PatientSummaryCard patientId={selectedTicket.patient_id} ticketId={selectedTicket.id} />

          <Tabs defaultValue="treat" className="space-y-4">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="treat">Treatment</TabsTrigger>
              <TabsTrigger value="labs">Lab results {labOrders.length > 0 && <Badge variant="soft" className="ml-1.5 text-[10px]">{labOrders.filter((o) => o.status === "completed").length}/{labOrders.length}</Badge>}</TabsTrigger>
              <TabsTrigger value="history" className="gap-1"><History className="h-4 w-4" /> Dental history ({pastHistory.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="treat" className="space-y-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Clinical notes</CardTitle></CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1.5"><Label>Complaint</Label><Textarea rows={3} value={clinical.complaint} onChange={(e) => setClinical({ ...clinical, complaint: e.target.value })} placeholder="e.g. Toothache lower left, 3 days" /></div>
                  <div className="space-y-1.5"><Label>Findings / diagnosis</Label><Textarea rows={3} value={clinical.findings} onChange={(e) => setClinical({ ...clinical, findings: e.target.value })} placeholder="e.g. Deep caries 36, tender to percussion" /></div>
                  <div className="space-y-1.5"><Label>Treatment plan</Label><Textarea rows={3} value={clinical.plan} onChange={(e) => setClinical({ ...clinical, plan: e.target.value })} placeholder="e.g. RCT 36, review in 1 week" /></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Tooth chart <span className="text-xs font-normal text-muted-foreground">(tap teeth, then a procedure)</span></CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 overflow-x-auto">
                  {(["upper", "lower"] as const).map((jaw) => (
                    <div key={jaw} className="flex items-center gap-1 min-w-[640px]">
                      <span className="w-12 text-[11px] text-muted-foreground capitalize">{jaw}</span>
                      {TEETH[jaw].map((t, i) => (
                        <button key={t} type="button" onClick={() => toggleTooth(t)}
                          className={cn("h-9 w-9 rounded-md border text-xs font-semibold transition-colors", i === 8 && "ml-3",
                            activeTeeth.includes(t) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}>
                          {t}
                        </button>
                      ))}
                    </div>
                  ))}
                  {activeTeeth.length > 0 && <p className="text-xs">Selected: <strong>{activeTeeth.join(", ")}</strong> <Button variant="link" size="sm" className="h-auto p-0 ml-2 text-xs" onClick={() => setActiveTeeth([])}>clear</Button></p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">Procedures</CardTitle>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-8 h-10" placeholder="Search procedures…" value={procSearch} onChange={(e) => setProcSearch(e.target.value)} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {catalog.map((c) => (
                    <div key={c.category} className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.category}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-1.5">
                        {c.items.map((p) => (
                          <button key={p.name} type="button" onClick={() => addProcedure(p)}
                            className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-sm hover:border-primary hover:bg-primary/5 transition-colors">
                            <span className="leading-tight">{p.name}</span>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{p.price.toLocaleString()}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {(entries.length > 0 || todaysDone.length > 0) && (
                <Card className="border-primary/30">
                  <CardHeader className="pb-2"><CardTitle className="text-base">This visit</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {todaysDone.map((h) => (
                      <div key={h.id} className="flex items-center justify-between p-2.5 border rounded-lg bg-muted/30 text-sm">
                        <span><strong>{h.procedure_name}</strong>{h.tooth_number && <span className="text-muted-foreground"> · tooth {h.tooth_number}</span>}</span>
                        <Badge variant="soft">Saved · {formatKES(h.price)}</Badge>
                      </div>
                    ))}
                    {entries.map((e, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2 p-2.5 border rounded-lg text-sm">
                        <strong className="flex-1 min-w-[10rem]">{e.procedure}{e.teeth.length > 0 && <span className="font-normal text-muted-foreground"> · tooth {e.teeth.join(", ")}</span>}</strong>
                        <Input className="h-9 flex-1 min-w-[10rem]" placeholder="Notes" value={e.notes} onChange={(ev) => setEntries((p) => p.map((x, j) => (j === i ? { ...x, notes: ev.target.value } : x)))} />
                        <Badge variant="outline">{formatKES(e.price)}</Badge>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEntries(entries.filter((_, j) => j !== i))} aria-label="Remove"><X className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    {entries.length > 0 && <p className="text-right font-semibold">New items: {formatKES(total)}</p>}
                  </CardContent>
                </Card>
              )}

              <div className="max-w-xs space-y-1.5">
                <Label className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Next visit</Label>
                <Input type="date" value={nextVisit} onChange={(e) => setNextVisit(e.target.value)} className="h-11" />
              </div>
            </TabsContent>

            <TabsContent value="labs">
              <Card><CardContent className="pt-6">
                {labOrders.length === 0 ? <p className="text-sm text-muted-foreground">No lab tests for this visit. Use “Lab request” to order.</p> : <LabResultsTable orders={labOrders} />}
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="history">
              <Card><CardContent className="pt-6 overflow-x-auto">
                {pastHistory.length === 0 ? <p className="text-sm text-muted-foreground">No previous dental procedures.</p> : (
                  <table className="w-full border-collapse text-sm min-w-[560px]">
                    <thead><tr>{["Date", "Procedure", "Tooth", "Notes", "Next visit"].map((h) => <th key={h} className="border bg-muted px-2 py-1.5 text-left">{h}</th>)}</tr></thead>
                    <tbody>
                      {pastHistory.map((h) => (
                        <tr key={h.id}>
                          <td className="border px-2 py-1.5 whitespace-nowrap">{new Date(h.created_at).toLocaleDateString("en-GB")}</td>
                          <td className="border px-2 py-1.5">{h.procedure_name}</td>
                          <td className="border px-2 py-1.5">{h.tooth_number || "—"}</td>
                          <td className="border px-2 py-1.5">{h.notes || "—"}</td>
                          <td className="border px-2 py-1.5">{h.next_visit ? new Date(h.next_visit).toLocaleDateString("en-GB") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent></Card>
            </TabsContent>
          </Tabs>

          <div className="sticky bottom-0 z-10 -mx-3 sm:-mx-1 border-t bg-background/95 backdrop-blur px-3 sm:px-1 py-2 sm:py-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <Button variant="outline" className="h-11" onClick={handleSaveOnly} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Save
            </Button>
            <Button className="h-11 px-6" onClick={() => setSendOpen(true)}><Send className="h-4 w-4 mr-2" /> Save & send to…</Button>
          </div>

          <DirectOrderDialog
            open={!!direct}
            onOpenChange={(o) => !o && setDirect(null)}
            mode={direct ?? "lab"}
            source="dental"
            ticket={{ id: selectedTicket.id, patient_id: selectedTicket.patient_id, department_id: selectedTicket.department_id, patientName: selectedTicket.patient?.profile?.full_name }}
            onDone={() => { setSelectedTicket(null); }}
          />
          <SendToDialog
            open={sendOpen}
            onOpenChange={setSendOpen}
            ticket={{ id: selectedTicket.id, patientName: selectedTicket.patient?.profile?.full_name }}
            from="Dental"
            exclude={["dental"]}
            recommended={recommended}
            beforeSend={saveVisit}
            onSent={() => setSelectedTicket(null)}
          />
          <ReferralForm
            open={referralOpen}
            onOpenChange={setReferralOpen}
            patientId={selectedTicket.patient_id}
            patientName={selectedTicket.patient?.profile?.full_name || ""}
            patientAge={calculateAge(selectedTicket.patient?.profile?.date_of_birth)}
            patientGender={selectedTicket.patient?.profile?.gender || ""}
            encounterId={savedEncounterId || undefined}
            doctorName={myProfile?.full_name ? `Dr. ${myProfile.full_name.replace(/^dr\.?\s*/i, "")}` : ""}
          />
        </>
      )}
    </StationShell>
  );
};

export default Dental;
