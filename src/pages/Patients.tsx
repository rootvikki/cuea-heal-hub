import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { PatientRegistrationDialog } from "@/components/PatientRegistrationDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PatientDetailDialog } from "@/components/PatientDetailDialog";

const PAGE_SIZE = 25;

const Patients = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [page, setPage] = useState(0);

  const { data, isLoading: loading, refetch } = useQuery({
    queryKey: ["patients-list", page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from("patients")
        .select("id, patient_id, user_id, insurance_provider, profiles!inner(full_name, phone)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const patients = (data || []).map((p: any) => ({
        ...p,
        profiles: { full_name: p.profiles?.full_name, phone: p.profiles?.phone },
      }));

      return { patients, total: count || 0 };
    },
    staleTime: 30000,
  });

  const patients = data?.patients || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filteredPatients = patients.filter((patient: any) => {
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
          <p className="text-muted-foreground mt-1">View and manage patient records</p>
        </div>
        <PatientRegistrationDialog onSuccess={() => refetch()} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Patient Directory</CardTitle>
          <CardDescription>
            {total > 0 ? `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total} patients` : "Search and view all registered patients"}
          </CardDescription>
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
                      <TableCell colSpan={5} className="text-center py-8">Loading patients...</TableCell>
                    </TableRow>
                  ) : filteredPatients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        {searchTerm ? "No patients found matching your search." : "No patients registered yet."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPatients.map((patient: any) => (
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

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <PatientDetailDialog patientId={selectedPatientId} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
};

export default Patients;
