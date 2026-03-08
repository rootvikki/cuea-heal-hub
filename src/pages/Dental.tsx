import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { StationQueue } from "@/components/StationQueue";
import { InterimPayment } from "@/components/InterimPayment";
import { Plus, X, Send, Calendar } from "lucide-react";
import { WorkflowTimeline, deriveVisitPath } from "@/components/WorkflowTimeline";

const DENTAL_PROCEDURES = [
  // Examination & Consultation
  { name: "Dental Examination", price: 500 },
  { name: "Dental Consultation", price: 500 },
  // Extractions
  { name: "Simple Extraction", price: 1500 },
  { name: "Closed Disimpaction", price: 2000 },
  { name: "Open Disimpaction", price: 5000 },
  // Restorations
  { name: "Amalgam Restoration F1", price: 2000 },
  { name: "Amalgam Restoration F2", price: 2500 },
  { name: "Amalgam Restoration F3", price: 3000 },
  { name: "Composite Filling F1", price: 2500 },
  { name: "Composite Filling F2", price: 3000 },
  { name: "Composite Filling F3", price: 3500 },
  { name: "GIC Filling F1", price: 2000 },
  { name: "GIC Filling F2", price: 2500 },
  { name: "GIC Filling F3", price: 3000 },
  { name: "Temporary Filling", price: 1000 },
  // Endodontics
  { name: "Root Canal - Anterior", price: 6000 },
  { name: "Root Canal - Premolar", price: 8000 },
  { name: "Root Canal - Molar", price: 10000 },
  { name: "Pulpotomy", price: 3000 },
  { name: "Pulpectomy", price: 4000 },
  { name: "Apicectomy", price: 8000 },
  // Periodontics
  { name: "Scaling & Polishing", price: 3000 },
  { name: "Deep Scaling (per quadrant)", price: 2000 },
  { name: "Gum Treatment (per quadrant)", price: 3000 },
  // Prosthodontics
  { name: "Crown - PFM", price: 15000 },
  { name: "Crown - Full Metal", price: 12000 },
  { name: "Crown - All Ceramic", price: 20000 },
  { name: "Stainless Steel Crown", price: 5000 },
  { name: "Bridge Work (per unit)", price: 15000 },
  { name: "Resin Bonded Bridge", price: 20000 },
  { name: "Denture - Partial (Acrylic)", price: 15000 },
  { name: "Denture - Full", price: 25000 },
  // Preventive
  { name: "Fluoride Application", price: 1000 },
  { name: "Fissure Sealing (per tooth)", price: 1500 },
  { name: "Teeth Whitening", price: 5000 },
  // Surgery
  { name: "Dental Abscess I&D", price: 2000 },
  { name: "Alveoloplasty", price: 3000 },
  { name: "Suturing (per stitch)", price: 500 },
  { name: "Biopsy", price: 5000 },
  { name: "Splinting (per tooth)", price: 1500 },
  { name: "Hemostasis", price: 500 },
  // Radiology
  { name: "Dental X-Ray (Periapical)", price: 500 },
  { name: "Dental X-Ray (OPG)", price: 2000 },
  // Other
  { name: "Orthodontic Consultation", price: 2000 },
];

interface DentalEntry {
  procedure: string;
  toothNumber: string;
  notes: string;
  price: number;
}

const Dental = () => {
  const { toast } = useToast();
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [queueCollapsed, setQueueCollapsed] = useState(false);

  useEffect(() => {
    if (selectedTicket) setQueueCollapsed(true);
  }, [selectedTicket]);
  const [entries, setEntries] = useState<DentalEntry[]>([]);
  const [selectedProc, setSelectedProc] = useState("");
  const [toothNum, setToothNum] = useState("");
  const [procNotes, setProcNotes] = useState("");
  const [nextVisit, setNextVisit] = useState("");
  const [saving, setSaving] = useState(false);

  const addEntry = () => {
    const proc = DENTAL_PROCEDURES.find((p) => p.name === selectedProc);
    if (!proc) return;
    setEntries([...entries, { procedure: proc.name, toothNumber: toothNum, notes: procNotes, price: proc.price }]);
    setSelectedProc("");
    setToothNum("");
    setProcNotes("");
  };

  const removeEntry = (i: number) => setEntries(entries.filter((_, idx) => idx !== i));
  const total = entries.reduce((s, e) => s + e.price, 0);

  const handleSave = async () => {
    if (!selectedTicket || entries.length === 0) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: staff } = await supabase.from("staff").select("id").eq("user_id", user?.id).single();
      const { data: dept } = await supabase.from("departments").select("id").eq("name", "Dental").maybeSingle();

      // Create a minimal encounter record for the dental visit
      const { data: encounterData } = await supabase.from("encounters").insert({
        patient_id: selectedTicket.patient_id,
        ticket_id: selectedTicket.id,
        doctor_id: staff?.id ?? user?.id ?? "",
        department_id: dept?.id ?? selectedTicket.department_id ?? "",
        chief_complaint: "Dental Visit",
        assessment: entries.map((e) => e.procedure).join(", "),
        plan: nextVisit ? `Next visit: ${nextVisit}` : null,
      }).select().single();

      const encounterId = encounterData?.id || null;

      for (const entry of entries) {
        await supabase.from("dental_procedures").insert({
          patient_id: selectedTicket.patient_id, ticket_id: selectedTicket.id,
          dentist_id: staff?.id ?? user?.id ?? "",
          procedure_name: entry.procedure, encounter_id: encounterId,
          tooth_number: entry.toothNumber || null, notes: entry.notes || null,
          price: entry.price, next_visit: nextVisit || null,
        });
        await supabase.from("service_charges").insert({
          patient_id: selectedTicket.patient_id, ticket_id: selectedTicket.id,
          encounter_id: encounterId,
          service_type: "dental", description: entry.procedure, amount: entry.price, billing_stage: "dental",
        });
      }
      await supabase.from("tickets").update({ workflow_stage: "at_billing", status: "at_billing" }).eq("id", selectedTicket.id);
      toast({ title: "Dental procedures saved", description: "Patient sent to billing" });
      setSelectedTicket(null);
      setEntries([]);
      setNextVisit("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <StationQueue
        stationStages={["at_dental"]}
        nextStage="at_billing"
        title="Dental Queue"
        onSelectPatient={setSelectedTicket}
        selectedTicketId={selectedTicket?.id}
        collapsed={queueCollapsed}
        onToggleCollapse={() => setQueueCollapsed(!queueCollapsed)}
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">🦷 Dental Department</h1>
          <p className="text-muted-foreground mt-1">Record dental procedures and advance patients</p>
        </div>

        {!selectedTicket ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">Select a patient from the queue</CardContent></Card>
        ) : (
          <>
            {/* Patient Info */}
            <Card className="border-primary/20">
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex gap-6 text-sm">
                  <div><span className="text-muted-foreground">Patient:</span> <strong>{selectedTicket.patient?.profile?.full_name}</strong></div>
                  <div><span className="text-muted-foreground">OPD:</span> <strong>{selectedTicket.patient?.patient_id}</strong></div>
                </div>
                <InterimPayment ticketId={selectedTicket.id} patientId={selectedTicket.patient_id} />
              </CardContent>
            </Card>

            {/* Workflow Timeline */}
            <WorkflowTimeline
              currentStage={selectedTicket.workflow_stage || selectedTicket.status}
              visitPath={deriveVisitPath(selectedTicket.workflow_stage || selectedTicket.status, { isDental: true, hasPrescriptions: entries.length > 0 })}
            />

            {/* Add Procedures */}
            <Card>
              <CardHeader><CardTitle className="text-lg">Add Procedures</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Procedure</Label>
                    <Select value={selectedProc} onValueChange={setSelectedProc}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {DENTAL_PROCEDURES.map((p) => (
                          <SelectItem key={p.name} value={p.name}>{p.name} — KES {p.price}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Tooth #</Label>
                    <Input value={toothNum} onChange={(e) => setToothNum(e.target.value)} placeholder="e.g. 14" className="h-12 text-base" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Notes</Label>
                    <div className="flex gap-2">
                      <Input value={procNotes} onChange={(e) => setProcNotes(e.target.value)} className="h-12 text-base" />
                      <Button onClick={addEntry} disabled={!selectedProc} size="icon" className="h-12 w-12"><Plus className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </div>

                {entries.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      {entries.map((e, i) => (
                        <div key={i} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 text-sm">
                          <div>
                            <strong>{e.procedure}</strong>
                            {e.toothNumber && <span className="ml-2 text-muted-foreground">Tooth #{e.toothNumber}</span>}
                            {e.notes && <span className="ml-2 text-muted-foreground">— {e.notes}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">KES {e.price.toLocaleString()}</Badge>
                            <Button variant="ghost" size="sm" onClick={() => removeEntry(i)}><X className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      ))}
                      <div className="text-right font-semibold text-lg">Total: KES {total.toLocaleString()}</div>
                    </div>
                  </>
                )}

                <div className="max-w-sm space-y-2">
                  <Label className="flex items-center gap-1 text-sm font-semibold"><Calendar className="h-3.5 w-3.5" /> Next Visit</Label>
                  <Input type="date" value={nextVisit} onChange={(e) => setNextVisit(e.target.value)} className="h-12 text-base" />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end pb-6">
              <Button size="lg" onClick={handleSave} disabled={saving || entries.length === 0} className="gap-2">
                <Send className="h-4 w-4" /> {saving ? "Saving..." : "Complete & Send to Billing"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Dental;