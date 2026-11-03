import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { calculateAge } from "@/lib/utils";
import {
  User, Heart, Activity, TestTube, Pill, DollarSign, AlertTriangle,
  CheckCircle2, Clock, Droplets, Thermometer, Wind, Phone, MapPin, Shield
} from "lucide-react";

interface PatientSummaryCardProps {
  patientId: string;
  ticketId: string;
}

interface PatientData {
  patient_id: string;
  patient_type: string | null;
  blood_type: string | null;
  allergies: string[] | null;
  insurance_provider: string | null;
  insurance_number: string | null;
  chronic_conditions: string[] | null;
  national_id: string | null;
  payroll_number: string | null;
  admission_number: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  profile?: { full_name: string; phone: string | null; date_of_birth: string | null; gender: string | null };
}

export const PatientSummaryCard = ({ patientId, ticketId }: PatientSummaryCardProps) => {
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [vitals, setVitals] = useState<any>(null);
  const [encounter, setEncounter] = useState<any>(null);
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [charges, setCharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId || !ticketId) return;
    setLoading(true);
    Promise.all([
      supabase.from("patients").select("patient_id, patient_type, blood_type, allergies, insurance_provider, insurance_number, chronic_conditions, national_id, payroll_number, admission_number, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, profiles!inner(full_name, phone, date_of_birth, gender)").eq("id", patientId).single(),
      supabase.from("vitals").select("*").eq("patient_id", patientId).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("encounters").select("diagnosis, assessment, chief_complaint").eq("ticket_id", ticketId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("lab_orders").select("status, lab_tests_catalog(test_name)").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(10),
      supabase.from("prescriptions").select("medication_name, dispensed").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(10),
      supabase.from("service_charges").select("amount, description").eq("ticket_id", ticketId),
    ]).then(([patRes, vitRes, encRes, labRes, rxRes, chgRes]) => {
      if (patRes.data) {
        const d = patRes.data as any;
        setPatient({ ...d, profile: d.profiles });
      }
      setVitals(vitRes.data);
      setEncounter(encRes.data);
      setLabOrders((labRes.data || []).map((l: any) => ({ ...l, test_name: l.lab_tests_catalog?.test_name })));
      setPrescriptions(rxRes.data || []);
      setCharges(chgRes.data || []);
      setLoading(false);
    });
  }, [patientId, ticketId]);

  if (loading || !patient) return null;

  const totalCharges = charges.reduce((s, c) => s + (c.amount || 0), 0);
  const hasAllergies = patient.allergies && patient.allergies.length > 0;
  const hasDiagnosis = encounter?.diagnosis && encounter.diagnosis.length > 0;
  const hasVitals = !!vitals;
  const pendingLabs = labOrders.filter(l => l.status !== "completed").length;
  const undispensedRx = prescriptions.filter(p => !p.dispensed).length;

  const name = patient.profile?.full_name?.trim();
  const phone = patient.profile?.phone?.trim();
  const dob = patient.profile?.date_of_birth;
  const gender = patient.profile?.gender;
  const isIncomplete = !name || !phone || !dob;

  const SectionStatus = ({ complete }: { complete: boolean }) =>
    complete
      ? <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))] shrink-0" />
      : <Clock className="h-3.5 w-3.5 text-[hsl(var(--warning))] shrink-0" />;

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap border-b">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">{name || <span className="text-destructive italic">{patient.patient_id || "Name pending"}</span>}</p>
            <p className="text-xs text-muted-foreground">{patient.patient_id} · <span className="capitalize">{(patient.patient_type || "outsider").replace("_", " ")}</span>{gender ? ` · ${gender}` : ""}{dob ? ` · ${calculateAge(dob)}` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isIncomplete && (
            <Badge variant="destructive" className="text-[10px]">
              <AlertTriangle className="h-3 w-3 mr-1" />Incomplete Profile
            </Badge>
          )}
          {patient.blood_type && <Badge variant="outline" className="text-[10px]"><Droplets className="h-3 w-3 mr-1" />{patient.blood_type}</Badge>}
          {patient.insurance_provider && <Badge variant="outline" className="text-[10px]"><Shield className="h-3 w-3 mr-1" />{patient.insurance_provider}{patient.insurance_number ? ` #${patient.insurance_number}` : ""}</Badge>}
          {hasAllergies && (
            <Badge variant="destructive" className="text-[10px]">
              <AlertTriangle className="h-3 w-3 mr-1" />{patient.allergies!.join(", ")}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] font-mono">KES {totalCharges.toLocaleString()}</Badge>
        </div>
      </div>

      <Accordion type="multiple" className="px-4">
        {/* Demographics */}
        <AccordionItem value="demographics" className="border-b-0">
          <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
            <span className="flex items-center gap-2"><SectionStatus complete={!isIncomplete} /><User className="h-3.5 w-3.5" /> Demographics</span>
          </AccordionTrigger>
          <AccordionContent className="pb-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <InfoPill label="Phone" value={phone || "—"} icon={<Phone className="h-3 w-3" />} warn={!phone} />
              <InfoPill label="Gender" value={gender || "—"} warn={!gender} />
              <InfoPill label="Age" value={dob ? calculateAge(dob) : "—"} warn={!dob} />
              <InfoPill label="National ID" value={patient.national_id || "—"} />
              {patient.payroll_number && <InfoPill label="Payroll #" value={patient.payroll_number} />}
              {patient.admission_number && <InfoPill label="Reg #" value={patient.admission_number} />}
              {patient.next_of_kin_name && (
                <InfoPill label="Next of Kin" value={`${patient.next_of_kin_name}${patient.next_of_kin_relationship ? ` (${patient.next_of_kin_relationship})` : ""}${patient.next_of_kin_phone ? ` — ${patient.next_of_kin_phone}` : ""}`} />
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Vitals */}
        <AccordionItem value="vitals" className="border-b-0">
          <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
            <span className="flex items-center gap-2"><SectionStatus complete={hasVitals} /><Activity className="h-3.5 w-3.5" /> Latest Vitals</span>
          </AccordionTrigger>
          <AccordionContent className="pb-2">
            {vitals ? (
              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 text-xs">
                <VitalPill label="BP" value={vitals.blood_pressure_systolic && vitals.blood_pressure_diastolic ? `${vitals.blood_pressure_systolic}/${vitals.blood_pressure_diastolic}` : "—"} icon={<Heart className="h-3 w-3" />} />
                <VitalPill label="Pulse" value={vitals.pulse_rate ?? "—"} icon={<Activity className="h-3 w-3" />} />
                <VitalPill label="Temp" value={vitals.temperature ? `${vitals.temperature}°C` : "—"} icon={<Thermometer className="h-3 w-3" />} />
                <VitalPill label="SpO₂" value={vitals.oxygen_saturation ? `${vitals.oxygen_saturation}%` : "—"} icon={<Wind className="h-3 w-3" />} />
                <VitalPill label="RR" value={vitals.respiratory_rate ? `${vitals.respiratory_rate}/min` : "—"} />
                <VitalPill label="Weight" value={vitals.weight ? `${vitals.weight}kg` : "—"} />
                <VitalPill label="Height" value={vitals.height ? `${vitals.height}cm` : "—"} />
                <VitalPill label="BMI" value={vitals.bmi ?? "—"} />
                <VitalPill label="Taken" value={vitals.recorded_at ? new Date(vitals.recorded_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No vitals recorded yet</p>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Clinical */}
        <AccordionItem value="clinical" className="border-b-0">
          <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
            <span className="flex items-center gap-2"><SectionStatus complete={hasDiagnosis} /><TestTube className="h-3.5 w-3.5" /> Diagnoses & Orders</span>
          </AccordionTrigger>
          <AccordionContent className="pb-2 space-y-2">
            {encounter?.chief_complaint && (
              <p className="text-xs"><span className="text-muted-foreground">Complaint:</span> {encounter.chief_complaint}</p>
            )}
            {hasDiagnosis && (
              <div className="flex flex-wrap gap-1">
                {encounter.diagnosis.map((d: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{d}</Badge>
                ))}
              </div>
            )}
            {labOrders.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Lab Orders ({pendingLabs} pending)</p>
                <div className="flex flex-wrap gap-1">
                  {labOrders.map((l, i) => (
                    <Badge key={i} variant={l.status === "completed" ? "default" : "outline"} className="text-[10px]">
                      {l.test_name || "Test"}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {prescriptions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Prescriptions ({undispensedRx} pending)</p>
                <div className="flex flex-wrap gap-1">
                  {prescriptions.map((p, i) => (
                    <Badge key={i} variant={p.dispensed ? "default" : "outline"} className="text-[10px]">
                      <Pill className="h-2.5 w-2.5 mr-0.5" />{p.medication_name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {!hasDiagnosis && labOrders.length === 0 && prescriptions.length === 0 && (
              <p className="text-xs text-muted-foreground">No clinical data yet</p>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Charges */}
        {charges.length > 0 && (
          <AccordionItem value="charges" className="border-b-0">
            <AccordionTrigger className="py-2 text-xs font-semibold hover:no-underline">
              <span className="flex items-center gap-2"><DollarSign className="h-3.5 w-3.5" /> Visit Charges (KES {totalCharges.toLocaleString()})</span>
            </AccordionTrigger>
            <AccordionContent className="pb-2">
              <div className="space-y-1">
                {charges.map((c, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{c.description}</span>
                    <span className="font-medium">{c.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
};

const VitalPill = ({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) => (
  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50">
    {icon}
    <span className="text-muted-foreground">{label}:</span>
    <span className="font-medium">{value}</span>
  </div>
);

const InfoPill = ({ label, value, icon, warn }: { label: string; value: string; icon?: React.ReactNode; warn?: boolean }) => (
  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${warn ? "bg-destructive/10" : "bg-muted/50"}`}>
    {icon}
    <span className="text-muted-foreground">{label}:</span>
    <span className={`font-medium ${warn ? "text-destructive" : ""}`}>{value}</span>
  </div>
);
