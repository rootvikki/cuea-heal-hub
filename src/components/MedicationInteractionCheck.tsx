import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, Sparkles, Loader2 } from "lucide-react";

interface InteractionReview {
  overallRisk: string;
  summary: string;
  interactions: { medications: string[]; severity: string; explanation: string; recommendation: string }[];
  allergyConcerns: string[];
  duplicateTherapy: string[];
  monitoringAdvice: string[];
}

const riskColor = (value: string) => {
  const v = (value || "").toLowerCase();
  if (v === "high" || v === "major") return "bg-destructive/15 text-destructive border-destructive/30";
  if (v === "moderate") return "bg-orange-100 text-orange-800 border-orange-300";
  return "bg-emerald-100 text-emerald-800 border-emerald-300";
};

export const MedicationInteractionCheck = ({ patientId, patientName }: { patientId: string; patientName?: string }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [review, setReview] = useState<InteractionReview | null>(null);
  const [history, setHistory] = useState<{ current: any[]; past: any[] } | null>(null);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("prescriptions")
      .select("medication_name, dosage, frequency, duration, dispensed, dispensed_at, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(60);
    const rows = data || [];
    const current = rows.filter((r: any) => !r.dispensed || (r.dispensed_at && Date.now() - new Date(r.dispensed_at).getTime() < 1000 * 60 * 60 * 24 * 30));
    const past = rows.filter((r: any) => !current.includes(r));
    setHistory({ current, past });
    return { current, past };
  };

  const openDialog = async (next: boolean) => {
    setOpen(next);
    if (next && !history) await loadHistory();
  };

  const runReview = async () => {
    setLoading(true);
    setReview(null);
    try {
      const lists = history ?? (await loadHistory());
      if (lists.current.length === 0) {
        toast({ title: "No current medications", description: "This patient has no active medications to review.", variant: "destructive" });
        return;
      }
      const { data: patient } = await supabase
        .from("patients")
        .select("allergies, chronic_conditions, profiles!inner(gender, date_of_birth)")
        .eq("id", patientId)
        .maybeSingle();
      const dob = (patient as any)?.profiles?.date_of_birth;
      const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;

      const { data, error } = await supabase.functions.invoke("medication-interactions", {
        body: {
          patientId,
          age,
          sex: (patient as any)?.profiles?.gender ?? null,
          allergies: [ ...((patient as any)?.allergies ?? []), ...((patient as any)?.chronic_conditions ?? []) ].join(", ") || null,
          currentMedications: lists.current.map((m: any) => ({
            name: m.medication_name,
            dosage: m.dosage ?? null,
            frequency: m.frequency ?? null,
            duration: m.duration ?? null,
          })),
          pastMedications: lists.past.map((m: any) => ({
            name: m.medication_name,
            dosage: m.dosage ?? null,
            dispensedAt: m.dispensed_at ?? null,
          })),
          notes: notes.trim() || null,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Medication review failed");
      setReview(data.review as InteractionReview);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Medication review failed";
      toast({ title: "Could not complete the review", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <ShieldAlert className="h-4 w-4" /> Interaction Check
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Medication interaction review</DialogTitle>
          <DialogDescription>
            {patientName ? `${patientName} — ` : ""}AI support for the pharmacist. The pharmacist makes the final decision.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-semibold">Current medications ({history?.current.length ?? 0})</p>
            {(history?.current.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No active medications recorded.</p>
            ) : (
              <ul className="text-sm space-y-1">
                {history!.current.map((m: any, i: number) => (
                  <li key={i}>• {m.medication_name}{m.dosage ? ` — ${m.dosage}` : ""}{m.frequency ? `, ${m.frequency}` : ""}</li>
                ))}
              </ul>
            )}
            {(history?.past.length ?? 0) > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Earlier medications ({history!.past.length})</summary>
                <ul className="mt-1 space-y-1">
                  {history!.past.map((m: any, i: number) => (
                    <li key={i}>• {m.medication_name}{m.dispensed_at ? ` (${new Date(m.dispensed_at).toLocaleDateString()})` : ""}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Pharmacist notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Other medicines the patient reports, supplements, pregnancy, renal issues..." className="text-base" />
          </div>

          <Button onClick={runReview} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Reviewing medications..." : "Check for interactions"}
          </Button>

          {review && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className={riskColor(review.overallRisk)}>Overall risk: {review.overallRisk}</Badge>
              </div>
              <p className="text-sm">{review.summary}</p>

              {review.interactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No interactions were identified.</p>
              ) : (
                <div className="space-y-3">
                  {review.interactions.map((item, i) => (
                    <div key={i} className="rounded-lg border p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm">{item.medications.join(" + ")}</p>
                        <Badge className={riskColor(item.severity)}>{item.severity}</Badge>
                      </div>
                      <p className="text-sm">{item.explanation}</p>
                      <p className="text-sm text-muted-foreground"><strong>Suggested action:</strong> {item.recommendation}</p>
                    </div>
                  ))}
                </div>
              )}

              {[
                { title: "Allergy concerns", items: review.allergyConcerns },
                { title: "Possible duplicate therapy", items: review.duplicateTherapy },
                { title: "Monitoring advice", items: review.monitoringAdvice },
              ].filter((s) => s.items?.length).map((section) => (
                <div key={section.title} className="space-y-1">
                  <p className="text-sm font-semibold">{section.title}</p>
                  <ul className="text-sm space-y-1">
                    {section.items.map((entry, i) => <li key={i}>• {entry}</li>)}
                  </ul>
                </div>
              ))}

              <p className="text-xs text-muted-foreground">
                AI support only. Confirm against current references and clinical judgement before acting.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
