import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Activity, TestTube, Camera, Pill, Receipt, Stethoscope, Heart } from "lucide-react";
import { LabOrderTimeline, labOrderStatusLabel } from "@/components/LabOrderTimeline";
import { LabResultSignOff } from "@/components/LabResultSignOff";
import { flagLabel } from "@/lib/labFields";
import { PrescriptionTimeline, prescriptionStatusLabel } from "@/components/PrescriptionTimeline";

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
                  <div><span className="text-muted-foreground">Height:</span> {vitals[0].height} cm</div>
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
              <TestTube className="h-4 w-4 text-primary" /> Lab Orders & Results
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {labOrders.length === 0 ? (
              <p className="text-muted-foreground">No lab orders</p>
            ) : (
              <div className="space-y-3">
                {labOrders.map(lo => {
                  const fields = ((lo as any).lab_result_fields || []).slice().sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
                  const testName = (lo as any).lab_tests_catalog?.test_name || "Test";
                  const testUnit = (lo as any).lab_tests_catalog?.unit;
                  const testRef = (lo as any).lab_tests_catalog?.normal_range;
                  return (
                    <div key={lo.id} className="border rounded p-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{testName}</span>
                        <Badge variant={lo.status === "completed" ? "default" : "outline"}>{labOrderStatusLabel(lo.status)}</Badge>
                      </div>
                      <LabOrderTimeline order={lo as any} />
                      {lo.status === "completed" && <LabResultSignOff order={lo as any} canSignOff={false} />}
                      {fields.length > 0 ? (
                        <div className="space-y-1">
                          {fields.map((f: any) => (
                            <div key={f.id} className="grid grid-cols-12 gap-2 text-xs items-center">
                              <span className="col-span-4 text-muted-foreground">{f.field_name}</span>
                              <span className="col-span-3 font-mono font-medium">{f.field_value || "—"} {f.unit || ""}</span>
                              <span className="col-span-4 text-muted-foreground">Ref: {f.reference_range || "—"}</span>
                              <span className="col-span-1">
                                {flagLabel(f.flag) && <Badge variant={f.flag === "L" ? "secondary" : "destructive"} className="text-[10px] px-1 whitespace-nowrap">{flagLabel(f.flag)}</Badge>}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : lo.result_value ? (
                        <div className="p-2 bg-muted rounded text-xs">
                          <span className="font-mono font-medium">{lo.result_value}</span> {testUnit}
                          {testRef && <span className="text-muted-foreground ml-2">(ref: {testRef})</span>}
                          {lo.flag && lo.flag !== "negative" && <Badge variant="destructive" className="ml-2 capitalize">{lo.flag === "positive" ? "+ve" : lo.flag}</Badge>}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Awaiting results...</p>
                      )}
                      {lo.result_notes && (
                        <p className="text-xs text-muted-foreground border-t pt-1">📝 {lo.result_notes}</p>
                      )}
                    </div>
                  );
                })}
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
              <div className="space-y-2">
                {prescriptions.map(rx => (
                  <div key={rx.id} className="border rounded p-2 space-y-2">
                    <div className="flex justify-between">
                      <span>{rx.medication_name} — {rx.dosage} x{rx.quantity}</span>
                      <Badge variant={rx.dispensed ? "default" : "outline"}>
                        {prescriptionStatusLabel(rx)}
                      </Badge>
                    </div>
                    <PrescriptionTimeline prescription={rx} />
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
