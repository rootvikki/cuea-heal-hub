import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Activity, TestTube, Camera, Pill, Receipt, Stethoscope, Heart } from "lucide-react";

interface PatientJourneyProps {
  ticketId: string;
  patientId: string;
}

export function PatientJourney({ ticketId, patientId }: PatientJourneyProps) {
  const [vitals, setVitals] = useState<any[]>([]);
  const [nursingProcs, setNursingProcs] = useState<any[]>([]);
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [imagingOrders, setImagingOrders] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [charges, setCharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (patientId) fetchAll();
  }, [patientId, ticketId]);

  const fetchAll = async () => {
    setLoading(true);
    const [v, np, lo, io, rx, ch] = await Promise.all([
      supabase.from("vitals").select("*").eq("patient_id", patientId).order("recorded_at", { ascending: false }).limit(5),
      supabase.from("nursing_procedures").select("*").eq("patient_id", patientId).eq("ticket_id", ticketId),
      supabase.from("lab_orders").select("*, lab_tests_catalog(test_name, unit, normal_range), lab_result_fields(id, field_name, field_value, unit, reference_range, flag, sort_order)").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(20),
      supabase.from("imaging_orders").select("*, imaging_catalog(name, modality)").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(10),
      supabase.from("prescriptions").select("*").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(20),
      supabase.from("service_charges").select("*").eq("ticket_id", ticketId),
    ]);

    setVitals(v.data || []);
    setNursingProcs(np.data || []);
    setLabOrders(lo.data || []);
    setImagingOrders(io.data || []);
    setPrescriptions(rx.data || []);
    setCharges(ch.data || []);
    setLoading(false);
  };

  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading patient journey...</div>;

  const totalCharges = charges.reduce((sum, c) => sum + (c.amount || 0), 0);

  return (
    <ScrollArea className="h-[600px]">
      <div className="space-y-4 p-1">
        {/* Vitals/Triage */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Triage / Vitals
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {vitals.length === 0 ? (
              <p className="text-muted-foreground">No vitals recorded yet</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {vitals[0] && <>
                  <div><span className="text-muted-foreground">BP:</span> {vitals[0].blood_pressure_systolic}/{vitals[0].blood_pressure_diastolic}</div>
                  <div><span className="text-muted-foreground">Pulse:</span> {vitals[0].pulse_rate}</div>
                  <div><span className="text-muted-foreground">Temp:</span> {vitals[0].temperature}°C</div>
                  <div><span className="text-muted-foreground">SpO2:</span> {vitals[0].oxygen_saturation}%</div>
                  <div><span className="text-muted-foreground">Weight:</span> {vitals[0].weight} kg</div>
                  <div><span className="text-muted-foreground">Height:</span> {vitals[0].height} m</div>
                  <div><span className="text-muted-foreground">BMI:</span> {vitals[0].bmi}</div>
                  <div><span className="text-muted-foreground">Recorded:</span> {new Date(vitals[0].recorded_at).toLocaleString()}</div>
                </>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Nursing Procedures */}
        {nursingProcs.length > 0 && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Heart className="h-4 w-4 text-primary" /> Nursing Procedures
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {nursingProcs.map(p => (
                  <div key={p.id} className="flex justify-between text-sm">
                    <span>{p.procedure_type.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">KES {p.price}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lab Results */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TestTube className="h-4 w-4 text-primary" /> Lab Orders
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {labOrders.length === 0 ? (
              <p className="text-muted-foreground">No lab orders</p>
            ) : (
              <div className="space-y-2">
                {labOrders.map(lo => (
                  <div key={lo.id} className="flex items-center justify-between">
                    <span>{(lo as any).lab_tests_catalog?.test_name || "Test"}</span>
                    <div className="flex items-center gap-2">
                      {lo.result_value && <span className="font-mono">{lo.result_value}</span>}
                      {lo.flag && <Badge variant={lo.flag === "H" ? "destructive" : "secondary"}>{lo.flag}</Badge>}
                      <Badge variant={lo.status === "completed" ? "default" : "outline"}>{lo.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Imaging */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" /> Imaging
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {imagingOrders.length === 0 ? (
              <p className="text-muted-foreground">No imaging orders</p>
            ) : (
              <div className="space-y-2">
                {imagingOrders.map(io => (
                  <div key={io.id}>
                    <div className="flex justify-between">
                      <span>{(io as any).imaging_catalog?.name} ({(io as any).imaging_catalog?.modality})</span>
                      <Badge variant={io.status === "completed" ? "default" : "outline"}>{io.status}</Badge>
                    </div>
                    {io.findings && <p className="text-xs text-muted-foreground mt-1">Findings: {io.findings}</p>}
                    {io.impression && <p className="text-xs text-muted-foreground">Impression: {io.impression}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pharmacy */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Pill className="h-4 w-4 text-primary" /> Prescriptions
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {prescriptions.length === 0 ? (
              <p className="text-muted-foreground">No prescriptions</p>
            ) : (
              <div className="space-y-1">
                {prescriptions.map(rx => (
                  <div key={rx.id} className="flex justify-between">
                    <span>{rx.medication_name} — {rx.dosage} x{rx.quantity}</span>
                    <Badge variant={rx.dispensed ? "default" : "outline"}>
                      {rx.dispensed ? "Dispensed" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Charges Summary */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" /> Charges (This Visit)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {charges.length === 0 ? (
              <p className="text-muted-foreground">No charges recorded</p>
            ) : (
              <>
                <div className="space-y-1">
                  {charges.map(c => (
                    <div key={c.id} className="flex justify-between">
                      <span>{c.description}</span>
                      <span>KES {c.amount}</span>
                    </div>
                  ))}
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span>KES {totalCharges.toFixed(2)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
