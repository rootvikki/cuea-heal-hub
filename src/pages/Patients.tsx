import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, FileText, Plus, Eye } from "lucide-react";
import { PatientRegistrationDialog } from "@/components/PatientRegistrationDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

interface Patient {
  id: string;
  patient_id: string;
  user_id: string;
  insurance_provider: string | null;
  insurance_number: string | null;
  blood_type: string | null;
  allergies: string[] | null;
  chronic_conditions: string[] | null;
  profiles: {
    full_name: string;
    phone: string | null;
    date_of_birth: string | null;
    gender: string | null;
    email: string | null;
    address: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
  };
}

const Patients = () => {
  const { toast } = useToast();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [encounters, setEncounters] = useState<any[]>([]);
  const [vitals, setVitals] = useState<any[]>([]);

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching patients:", error);
      toast({
        title: "Error",
        description: "Failed to load patients",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // Fetch profiles and email separately
    const patientIds = data?.map(p => p.user_id) || [];
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("*")
      .in("user_id", patientIds);

    // Get emails from auth.users via a custom function or profiles
    const patientsWithProfiles = await Promise.all(
      (data || []).map(async (patient) => {
        const profile = profilesData?.find(p => p.user_id === patient.user_id);
        
        // Get user email
        const { data: { user } } = await supabase.auth.admin.getUserById(patient.user_id);
        
        return {
          ...patient,
          profiles: {
            ...profile,
            email: user?.email || null,
          }
        };
      })
    );

    setPatients(patientsWithProfiles as any);
    setLoading(false);
  };

  const fetchPatientDetails = async (patient: Patient) => {
    setSelectedPatient(patient);
    
    // Fetch encounters
    const { data: encountersData } = await supabase
      .from("encounters")
      .select("*, departments(name)")
      .eq("patient_id", patient.id)
      .order("encounter_date", { ascending: false });
    
    setEncounters(encountersData || []);

    // Fetch vitals
    const { data: vitalsData } = await supabase
      .from("vitals")
      .select("*")
      .eq("patient_id", patient.id)
      .order("recorded_at", { ascending: false })
      .limit(10);
    
    setVitals(vitalsData || []);
    
    setDetailsOpen(true);
  };

  const filteredPatients = patients.filter((patient) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      patient.patient_id.toLowerCase().includes(searchLower) ||
      patient.profiles?.full_name?.toLowerCase().includes(searchLower) ||
      patient.profiles?.phone?.toLowerCase().includes(searchLower) ||
      patient.profiles?.email?.toLowerCase().includes(searchLower)
    );
  });

  const calculateAge = (dob: string | null) => {
    if (!dob) return "N/A";
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Patient Management</h1>
          <p className="text-muted-foreground mt-1">
            View and manage patient records
          </p>
        </div>
        <PatientRegistrationDialog onSuccess={fetchPatients} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Patient Directory</CardTitle>
          <CardDescription>Search and view all registered patients</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search by name, patient ID, phone, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
              />
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Age/Gender</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Insurance</TableHead>
                    <TableHead>Blood Type</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Loading patients...
                      </TableCell>
                    </TableRow>
                  ) : filteredPatients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        {searchTerm ? "No patients found matching your search." : "No patients registered yet."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPatients.map((patient) => (
                      <TableRow key={patient.id}>
                        <TableCell className="font-medium">{patient.patient_id}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{patient.profiles?.full_name || "N/A"}</div>
                            <div className="text-sm text-muted-foreground">{patient.profiles?.email || "No email"}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {calculateAge(patient.profiles?.date_of_birth)} yrs
                          {patient.profiles?.gender && ` • ${patient.profiles.gender}`}
                        </TableCell>
                        <TableCell>{patient.profiles?.phone || "N/A"}</TableCell>
                        <TableCell>
                          {patient.insurance_provider ? (
                            <div>
                              <div className="text-sm">{patient.insurance_provider}</div>
                              <div className="text-xs text-muted-foreground">{patient.insurance_number}</div>
                            </div>
                          ) : (
                            "None"
                          )}
                        </TableCell>
                        <TableCell>
                          {patient.blood_type ? (
                            <Badge variant="outline">{patient.blood_type}</Badge>
                          ) : (
                            "N/A"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => fetchPatientDetails(patient)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Patient Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Patient Details</DialogTitle>
            <DialogDescription>
              Comprehensive patient information and medical history
            </DialogDescription>
          </DialogHeader>

          {selectedPatient && (
            <Tabs defaultValue="demographics" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="demographics">Demographics</TabsTrigger>
                <TabsTrigger value="medical">Medical Info</TabsTrigger>
                <TabsTrigger value="encounters">Encounters</TabsTrigger>
                <TabsTrigger value="vitals">Vitals History</TabsTrigger>
              </TabsList>

              <TabsContent value="demographics" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Patient ID</label>
                    <p className="text-lg">{selectedPatient.patient_id}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                    <p className="text-lg">{selectedPatient.profiles?.full_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Date of Birth</label>
                    <p>{selectedPatient.profiles?.date_of_birth || "Not provided"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Age</label>
                    <p>{calculateAge(selectedPatient.profiles?.date_of_birth)} years</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Gender</label>
                    <p>{selectedPatient.profiles?.gender || "Not specified"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Phone</label>
                    <p>{selectedPatient.profiles?.phone || "Not provided"}</p>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Address</label>
                    <p>{selectedPatient.profiles?.address || "Not provided"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Emergency Contact</label>
                    <p>{selectedPatient.profiles?.emergency_contact_name || "Not provided"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Emergency Phone</label>
                    <p>{selectedPatient.profiles?.emergency_contact_phone || "Not provided"}</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="medical" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Blood Type</label>
                    <p className="text-lg">{selectedPatient.blood_type || "Unknown"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Insurance Provider</label>
                    <p className="text-lg">{selectedPatient.insurance_provider || "None"}</p>
                  </div>
                  {selectedPatient.insurance_number && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Insurance Number</label>
                      <p>{selectedPatient.insurance_number}</p>
                    </div>
                  )}
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Allergies</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedPatient.allergies && selectedPatient.allergies.length > 0 ? (
                        selectedPatient.allergies.map((allergy, idx) => (
                          <Badge key={idx} variant="destructive">{allergy}</Badge>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No known allergies</p>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Chronic Conditions</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedPatient.chronic_conditions && selectedPatient.chronic_conditions.length > 0 ? (
                        selectedPatient.chronic_conditions.map((condition, idx) => (
                          <Badge key={idx} variant="secondary">{condition}</Badge>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No chronic conditions</p>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="encounters" className="space-y-3">
                {encounters.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No encounters recorded</p>
                ) : (
                  encounters.map((encounter) => (
                    <Card key={encounter.id}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          {new Date(encounter.encounter_date).toLocaleDateString()}
                        </CardTitle>
                        <CardDescription>{encounter.departments?.name}</CardDescription>
                      </CardHeader>
                      <CardContent className="text-sm space-y-2">
                        <div>
                          <span className="font-medium">Chief Complaint:</span> {encounter.chief_complaint}
                        </div>
                        {encounter.diagnosis && (
                          <div>
                            <span className="font-medium">Diagnosis:</span>{" "}
                            {encounter.diagnosis.join(", ")}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="vitals" className="space-y-3">
                {vitals.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No vitals recorded</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>BP</TableHead>
                        <TableHead>Pulse</TableHead>
                        <TableHead>Temp</TableHead>
                        <TableHead>O2 Sat</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vitals.map((vital) => (
                        <TableRow key={vital.id}>
                          <TableCell>{new Date(vital.recorded_at).toLocaleString()}</TableCell>
                          <TableCell>
                            {vital.blood_pressure_systolic}/{vital.blood_pressure_diastolic}
                          </TableCell>
                          <TableCell>{vital.pulse_rate}</TableCell>
                          <TableCell>{vital.temperature}°C</TableCell>
                          <TableCell>{vital.oxygen_saturation}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Patients;
