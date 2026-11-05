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

/**
 * Dental procedures, grouped as on the clinic's dental list. There are no built-in prices:
 * the dentist types the price for each procedure done (it goes to the bill as typed).
 */
const DENTAL_CATALOG: { category: string; items: string[] }[] = [
  { category: "Consultation & X-ray", items: ["Consultation", "Radiographs (per view)", "OPG", "IOPA"] },
  { category: "Paediatric dentistry", items: [
    "Fissure sealing (per tooth)", "Fluoride application (per quadrant)", "Composite masking (per tooth)",
    "Root canal treatment – pulpotomy (child)", "Root canal treatment – pulpectomy", "Stainless steel crown",
    "Prophylaxis – children", "Paediatric extraction",
  ] },
  { category: "Conservative procedures", items: [
    "Root canal treatment – anterior teeth", "Root canal treatment – premolar", "Root canal treatment – molar",
    "Amalgam restoration – F1", "Amalgam restoration – F2", "Amalgam restoration – F3", "Amalgam restoration – pin retained",
    "Composite – class V", "Composite – class III", "Composite – class IV", "Composite – pin retained", "Composite – posterior",
    "Masking procedure (per tooth)", "Resin bonded bridge (per unit)", "Temporary bridge (per unit, plus lab fee)",
    "Temporary restoration", "GIC",
  ] },
  { category: "Periodontal procedures", items: [
    "Polishing / stain removal / prophylaxis – adults", "Full mouth scaling and prophylaxis", "Deep full mouth scaling and prophylaxis",
  ] },
  { category: "Prosthetic procedures (including lab charges)", items: [
    "Partial denture – acrylic, first tooth", "Acrylic denture – additional tooth", "Denture repair (per arch)",
    "Denture repair with impression", "Denture repair – tooth replacement", "Obturator",
  ] },
  { category: "Dental extraction procedures", items: [
    "Total extraction", "Closed disimpaction", "Open disimpaction", "Simple extraction", "Difficult extraction",
  ] },
];

/** FDI tooth numbers as seen facing the patient. */
const TEETH = {
  upper: ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"],
  lower: ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"],
};

/** price is what the dentist typed ("" until entered). */
interface DentalEntry { key: number; procedure: string; teeth: string[]; notes: string; price: string }

const priceOk = (v: string) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0;

const Dental = () => {
  const { profile: myProfile } = useUser();
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [entries, setEntries] = useState<DentalEntry[]>([]);
  const [procSearch, setProcSearch] = useState("");
  const [otherName, setOtherName] = useState("");
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
    return DENTAL_CATALOG.map((c) => ({ ...c, items: c.items.filter((i) => !q || i.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)) })).filter((c) => c.items.length);
  }, [procSearch]);

  const addProcedure = (name: string) => {
    const key = Date.now();
    setEntries((prev) => [...prev, { key, procedure: name, teeth: activeTeeth, notes: "", price: "" }]);
    setActiveTeeth([]);
    // Straight to the price box of the procedure just added
    setTimeout(() => document.getElementById(`dental-price-${key}`)?.focus(), 50);
  };
  const toggleTooth = (t: string) => setActiveTeeth((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const total = entries.reduce((s, e) => s + (priceOk(e.price) ? Number(e.price) : 0), 0);
  const missingPrice = entries.find((e) => !priceOk(e.price));

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
    if (missingPrice) {
      document.getElementById(`dental-price-${missingPrice.key}`)?.focus();
      throw new Error(`Type the price for ${missingPrice.procedure}`);
    }
    const encounterId = await ensureDentalEncounter();
    const staffId = await currentStaffId();
    const { data: { user } } = await supabase.auth.getUser();
    for (const entry of entries) {
      const { error } = await supabase.from("dental_procedures").insert({
        patient_id: selectedTicket.patient_id, ticket_id: selectedTicket.id, dentist_id: staffId ?? user?.id ?? "",
        procedure_name: entry.procedure, encounter_id: encounterId,
        tooth_number: entry.teeth.join(", ") || null, notes: entry.notes || null,
        price: Number(entry.price), next_visit: nextVisit || null,
      });
      if (error) throw new Error(error.message);
      await supabase.from("service_charges").insert({
        patient_id: selectedTicket.patient_id, ticket_id: selectedTicket.id, encounter_id: encounterId,
        service_type: "dental", description: `Dental: ${entry.procedure}${entry.teeth.length ? ` (tooth ${entry.teeth.join(", ")})` : ""}`,
        amount: Number(entry.price), billing_stage: "dental",
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
                  <CardTitle className="text-base">Tooth chart <span className="text-xs font-normal text-muted-foreground">(tap teeth, then a procedure, then type its price)</span></CardTitle>
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
                        {c.items.map((name) => (
                          <button key={name} type="button" onClick={() => addProcedure(name)}
                            className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm hover:border-primary hover:bg-primary/5 transition-colors">
                            <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="leading-tight">{name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {catalog.length === 0 && <p className="text-sm text-muted-foreground">No procedure matches “{procSearch}”. Add it below as another procedure.</p>}
                  <form className="flex flex-wrap gap-2 border-t pt-3" onSubmit={(e) => { e.preventDefault(); if (otherName.trim()) { addProcedure(otherName.trim()); setOtherName(""); } }}>
                    <Input className="h-10 flex-1 min-w-[12rem]" placeholder="Other procedure not on the list…" value={otherName} onChange={(e) => setOtherName(e.target.value)} />
                    <Button type="submit" variant="outline" className="h-10" disabled={!otherName.trim()}><Plus className="h-4 w-4 mr-1" /> Add</Button>
                  </form>
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
                    {entries.map((e) => {
                      const set = (patch: Partial<DentalEntry>) => setEntries((p) => p.map((x) => (x.key === e.key ? { ...x, ...patch } : x)));
                      const bad = !priceOk(e.price);
                      return (
                        <div key={e.key} className={cn("flex flex-wrap items-center gap-2 p-2.5 border rounded-lg text-sm", bad && "border-amber-400 bg-amber-50/50")}>
                          <strong className="flex-1 min-w-[10rem]">{e.procedure}{e.teeth.length > 0 && <span className="font-normal text-muted-foreground"> · tooth {e.teeth.join(", ")}</span>}</strong>
                          <Input className="h-9 flex-1 min-w-[10rem]" placeholder="Notes" value={e.notes} onChange={(ev) => set({ notes: ev.target.value })} />
                          <div className="flex items-center gap-1">
                            <Label htmlFor={`dental-price-${e.key}`} className="text-xs text-muted-foreground">KES</Label>
                            <Input id={`dental-price-${e.key}`} type="number" inputMode="numeric" min={0} className="h-9 w-28" placeholder="Price"
                              value={e.price} onChange={(ev) => set({ price: ev.target.value })} aria-invalid={bad} />
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEntries(entries.filter((x) => x.key !== e.key))} aria-label="Remove"><X className="h-4 w-4" /></Button>
                        </div>
                      );
                    })}
                    {entries.length > 0 && (
                      <p className="text-right font-semibold">
                        {missingPrice ? <span className="mr-3 text-sm font-normal text-amber-700">Type a price for every procedure</span> : null}
                        New items: {formatKES(total)}
                      </p>
                    )}
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
            <Button className="h-11 px-6" onClick={() => {
              if (missingPrice) { toast.error(`Type the price for ${missingPrice.procedure}`); document.getElementById(`dental-price-${missingPrice.key}`)?.focus(); return; }
              setSendOpen(true);
            }}><Send className="h-4 w-4 mr-2" /> Save & send to…</Button>
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
