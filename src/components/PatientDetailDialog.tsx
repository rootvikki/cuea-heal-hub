import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { LabOrderTimeline, labOrderStatusLabel } from "@/components/LabOrderTimeline";
import {
  User,
  Heart,
  Stethoscope,
  TestTube,
  Pill,
  FileText,
  Phone,
  Mail,
  Shield,
  Calendar,
} from "lucide-react";

interface PatientDetailDialogProps {
  patientId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PatientDetailDialog = ({
  patientId,
  open,
  onOpenChange,
}: PatientDetailDialogProps) => {
  const { hasAnyRole } = useUser();
  const isDoctor = hasAnyRole(["doctor", "clinical_officer", "super_admin"]);
  const isClinicalStaff = hasAnyRole(["doctor", "clinical_officer", "nurse", "ward_manager", "super_admin", "admin"]);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [vitals, setVitals] = useState<any[]>([]);
  const [encounters, setEncounters] = useState<any[]>([]);
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);

  useEffect(() => {
    if (open && patientId) {
      fetchAll();
    }
  }, [open, patientId]);

  const fetchAll = async () => {
    if (!patientId) return;
    setLoading(true);

    const { data: pat } = await supabase
      .from("patients")
      .select("*")
      .eq("id", patientId)
      .single();

    if (!pat) {
      setLoading(false);
      return;
    }
    setPatient(pat);

    const [profileRes, vitalsRes, encountersRes, labRes, rxRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("user_id", pat.user_id)
        .single(),
      isDoctor
        ? supabase
            .from("vitals")
            .select("*")
            .eq("patient_id", patientId)
            .order("recorded_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] }),
      isDoctor
        ? supabase
            .from("encounters")
            .select("*, department:departments(name)")
            .eq("patient_id", patientId)
            .order("encounter_date", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
      isDoctor
        ? supabase
            .from("lab_orders")
            .select("*, test:lab_tests_catalog(test_name, unit, normal_range), lab_result_fields(id, field_name, field_value, unit, reference_range, flag, sort_order)")
            .eq("patient_id", patientId)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
      isDoctor
        ? supabase
            .from("prescriptions")
            .select("*")
            .eq("patient_id", patientId)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
    ]);


    setProfile(profileRes.data);
    setVitals(vitalsRes.data || []);
    setEncounters(encountersRes.data || []);
    setLabOrders(labRes.data || []);
    setPrescriptions(rxRes.data || []);
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Patient Details
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : !patient ? (
          <p className="text-center py-8 text-muted-foreground">
            Patient not found
          </p>
        ) : (
          <Tabs defaultValue="demographics" className="space-y-4">
            <TabsList className={`grid w-full ${isDoctor ? 'grid-cols-5' : 'grid-cols-1'}`}>
              <TabsTrigger value="demographics">Profile</TabsTrigger>
              {isDoctor && <TabsTrigger value="vitals">Vitals</TabsTrigger>}
              {isDoctor && <TabsTrigger value="encounters">Visits</TabsTrigger>}
              {isDoctor && <TabsTrigger value="labs">Labs</TabsTrigger>}
              {isDoctor && <TabsTrigger value="prescriptions">Rx</TabsTrigger>}
            </TabsList>

            {/* Demographics */}
            <TabsContent value="demographics">
              <ScrollArea className="h-[500px]">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Personal Info</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Name</span>
                        <span className="font-medium">
                          {profile?.full_name}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">OPD #</span>
                        <span className="font-mono">
                          {patient.patient_id}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Gender</span>
                        <span className="capitalize">
                          {profile?.gender || "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">DOB</span>
                        <span>
                          {profile?.date_of_birth
                            ? format(
                                new Date(profile.date_of_birth),
                                "MMM d, yyyy"
                              )
                            : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">National ID</span>
                        <span>{patient.national_id || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Nationality</span>
                        <span>{patient.nationality || "—"}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Contact</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <span>{profile?.phone || "—"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <span>{profile?.email || patient.email || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Address</span>
                        <span>{profile?.address || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Next of Kin
                        </span>
                        <span>{patient.next_of_kin_name || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          NoK Phone
                        </span>
                        <span>{patient.next_of_kin_phone || "—"}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-1">
                        <Shield className="h-3 w-3" /> Insurance
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Provider</span>
                        <span>
                          {patient.insurance_provider || "None"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Member #
                        </span>
                        <span>{patient.insurance_number || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Type</span>
                        <Badge variant="outline" className="capitalize">
                          {patient.patient_type || "outsider"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-1">
                        <Heart className="h-3 w-3" /> Medical Info
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Blood Type
                        </span>
                        <span>{patient.blood_type || "—"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Allergies
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {patient.allergies?.length > 0
                            ? patient.allergies.map(
                                (a: string, i: number) => (
                                  <Badge
                                    key={i}
                                    variant="destructive"
                                    className="text-xs"
                                  >
                                    {a}
                                  </Badge>
                                )
                              )
                            : "None noted"}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Chronic Conditions
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {patient.chronic_conditions?.length > 0
                            ? patient.chronic_conditions.map(
                                (c: string, i: number) => (
                                  <Badge
                                    key={i}
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {c}
                                  </Badge>
                                )
                              )
                            : "None noted"}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Vitals - doctors only */}
            {isDoctor && <TabsContent value="vitals">
              <ScrollArea className="h-[500px]">
                {vitals.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    No vitals recorded
                  </p>
                ) : (
                  <div className="space-y-3">
                    {vitals.map((v) => (
                      <Card key={v.id}>
                        <CardContent className="p-3">
                          <p className="text-xs text-muted-foreground mb-2">
                            {format(
                              new Date(v.recorded_at),
                              "MMM d, yyyy h:mm a"
                            )}
                          </p>
                          <div className="grid grid-cols-4 gap-2 text-sm">
                            {v.blood_pressure_systolic && (
                              <div>
                                <span className="text-muted-foreground">
                                  BP
                                </span>
                                <p className="font-medium">
                                  {v.blood_pressure_systolic}/
                                  {v.blood_pressure_diastolic}
                                </p>
                              </div>
                            )}
                            {v.pulse_rate && (
                              <div>
                                <span className="text-muted-foreground">
                                  Pulse
                                </span>
                                <p className="font-medium">
                                  {v.pulse_rate} bpm
                                </p>
                              </div>
                            )}
                            {v.temperature && (
                              <div>
                                <span className="text-muted-foreground">
                                  Temp
                                </span>
                                <p className="font-medium">
                                  {v.temperature}°C
                                </p>
                              </div>
                            )}
                            {v.oxygen_saturation && (
                              <div>
                                <span className="text-muted-foreground">
                                  SpO₂
                                </span>
                                <p className="font-medium">
                                  {v.oxygen_saturation}%
                                </p>
                              </div>
                            )}
                            {v.weight && (
                              <div>
                                <span className="text-muted-foreground">
                                  Wt
                                </span>
                                <p className="font-medium">{v.weight} kg</p>
                              </div>
                            )}
                            {v.height && (
                              <div>
                                <span className="text-muted-foreground">
                                  Ht
                                </span>
                                <p className="font-medium">{v.height} cm</p>
                              </div>
                            )}
                            {v.respiratory_rate && (
                              <div>
                                <span className="text-muted-foreground">
                                  RR
                                </span>
                                <p className="font-medium">
                                  {v.respiratory_rate}/min
                                </p>
                              </div>
                            )}
                            {v.bmi && (
                              <div>
                                <span className="text-muted-foreground">
                                  BMI
                                </span>
                                <p className="font-medium">{v.bmi}</p>
                              </div>
                            )}
                          </div>
                          {v.presenting_complaint && (
                            <p className="text-sm mt-2 text-muted-foreground">
                              Complaint: {v.presenting_complaint}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>}

            {/* Encounters - doctors only */}
            {isDoctor && <TabsContent value="encounters">
              <ScrollArea className="h-[500px]">
                {encounters.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    No visits recorded
                  </p>
                ) : (
                  <div className="space-y-3">
                    {encounters.map((enc) => (
                      <Card key={enc.id}>
                        <CardContent className="p-3">
                          <div className="flex justify-between items-start mb-1">
                            <p className="text-sm font-medium">
                              {enc.encounter_date
                                ? format(
                                    new Date(enc.encounter_date),
                                    "MMM d, yyyy"
                                  )
                                : "—"}
                            </p>
                            {enc.department && (
                              <Badge variant="outline" className="text-xs">
                                {enc.department.name}
                              </Badge>
                            )}
                          </div>
                          {enc.chief_complaint && (
                            <p className="text-sm">
                              <span className="text-muted-foreground">
                                CC:{" "}
                              </span>
                              {enc.chief_complaint}
                            </p>
                          )}
                          {enc.diagnosis?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {enc.diagnosis.map(
                                (d: string, i: number) => (
                                  <Badge
                                    key={i}
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {d}
                                  </Badge>
                                )
                              )}
                            </div>
                          )}
                          {enc.plan && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Plan: {enc.plan}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>}

            {/* Labs - doctors only */}
            {isDoctor && <TabsContent value="labs">
              <ScrollArea className="h-[500px]">
                {labOrders.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    No lab results
                  </p>
                ) : (
                  <div className="space-y-3">
                    {labOrders.map((lab) => {
                      const fields = (lab.lab_result_fields || []).slice().sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
                      return (
                        <Card key={lab.id}>
                          <CardContent className="p-3 space-y-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-sm font-medium">
                                  {lab.test?.test_name || "Unknown test"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(lab.created_at), "MMM d, yyyy")}
                                </p>
                              </div>
                              <Badge
                                variant={lab.status === "completed" ? "default" : "outline"}
                                className="text-xs"
                              >
                                {labOrderStatusLabel(lab.status)}
                              </Badge>
                            </div>
                            <LabOrderTimeline order={lab} />
                            {fields.length > 0 ? (
                              <div className="space-y-1 border-t pt-2">
                                {fields.map((f: any) => (
                                  <div key={f.id} className="grid grid-cols-12 gap-2 text-xs items-center">
                                    <span className="col-span-4 text-muted-foreground">{f.field_name}</span>
                                    <span className="col-span-3 font-mono font-medium">{f.field_value || "—"} {f.unit || ""}</span>
                                    <span className="col-span-4 text-muted-foreground">Ref: {f.reference_range || "—"}</span>
                                    <span className="col-span-1">
                                      {f.flag && <Badge variant={f.flag === "H" ? "destructive" : "secondary"} className="text-[10px] px-1">{f.flag}</Badge>}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : lab.result_value ? (
                              <div className="p-2 bg-muted rounded text-sm">
                                <span className="font-medium">{lab.result_value}</span>{" "}
                                {lab.test?.unit}
                                {lab.test?.normal_range && (
                                  <span className="text-muted-foreground ml-2">
                                    (ref: {lab.test.normal_range})
                                  </span>
                                )}
                                {lab.flag && <Badge variant={lab.flag === "H" ? "destructive" : "secondary"} className="ml-2">{lab.flag}</Badge>}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">Awaiting results...</p>
                            )}
                            {lab.result_notes && (
                              <p className="text-xs text-muted-foreground border-t pt-1">📝 {lab.result_notes}</p>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>}

            {/* Prescriptions - doctors only */}
            {isDoctor && <TabsContent value="prescriptions">
              <ScrollArea className="h-[500px]">
                {prescriptions.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    No prescriptions
                  </p>
                ) : (
                  <div className="space-y-3">
                    {prescriptions.map((rx) => (
                      <Card key={rx.id}>
                        <CardContent className="p-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-sm font-medium">
                                {rx.medication_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {rx.dosage} • {rx.frequency} • {rx.duration}
                              </p>
                            </div>
                            <Badge
                              variant={rx.dispensed ? "default" : "outline"}
                              className="text-xs"
                            >
                              {rx.dispensed ? "Dispensed" : "Pending"}
                            </Badge>
                          </div>
                          {rx.instructions && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {rx.instructions}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};
