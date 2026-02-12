import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
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
import { PatientDetailDialog } from "@/components/PatientDetailDialog";

interface Patient {
  id: string;
  patient_id: string;
  user_id: string;
  insurance_provider: string | null;
  profiles: {
    full_name: string;
    phone: string | null;
  };
}

const Patients = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("patients")
      .select("id, patient_id, user_id, insurance_provider")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching patients:", error);
      setLoading(false);
      return;
    }

    // Fetch profiles separately
    const patientIds = data?.map(p => p.user_id) || [];
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("user_id, full_name, phone")
      .in("user_id", patientIds);

    const patientsWithProfiles = data?.map(patient => ({
      ...patient,
      profiles: profilesData?.find(p => p.user_id === patient.user_id) || { full_name: "", phone: null }
    })) || [];

    setPatients(patientsWithProfiles as any);
    setLoading(false);
  };

  const filteredPatients = patients.filter((patient) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      patient.patient_id.toLowerCase().includes(searchLower) ||
      patient.profiles?.full_name?.toLowerCase().includes(searchLower) ||
      patient.profiles?.phone?.toLowerCase().includes(searchLower)
    );
  });

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
                placeholder="Search by name, patient ID, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Insurance</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        Loading patients...
                      </TableCell>
                    </TableRow>
                  ) : filteredPatients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        {searchTerm ? "No patients found matching your search." : "No patients registered yet."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPatients.map((patient) => (
                      <TableRow key={patient.id}>
                        <TableCell className="font-medium">{patient.patient_id}</TableCell>
                        <TableCell>{patient.profiles?.full_name || "N/A"}</TableCell>
                        <TableCell>{patient.profiles?.phone || "N/A"}</TableCell>
                        <TableCell>{patient.insurance_provider || "None"}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => { setSelectedPatientId(patient.id); setDetailOpen(true); }}>
                            View Details
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

      <PatientDetailDialog
        patientId={selectedPatientId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
};

export default Patients;
