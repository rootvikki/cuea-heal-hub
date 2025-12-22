import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Bed, Users, Home, AlertCircle, UserPlus, LogOut } from "lucide-react";

interface Ward {
  id: string;
  name: string;
  ward_type: string;
  total_beds: number;
  floor_number: number;
  description: string;
}

interface BedInfo {
  id: string;
  ward_id: string;
  bed_number: string;
  bed_type: string;
  status: string;
  current_patient_id: string | null;
  ward?: Ward;
}

interface Admission {
  id: string;
  patient_id: string;
  bed_id: string;
  admission_type: string;
  admitted_at: string;
  expected_discharge_date: string | null;
  discharged_at: string | null;
  discharge_summary: string | null;
  diagnosis_on_admission: string[];
  status: string;
  patient?: {
    patient_id: string;
    profiles?: {
      full_name: string;
      phone: string;
    };
  };
  bed?: BedInfo;
}

const Inpatient = () => {
  const { toast } = useToast();
  const [wards, setWards] = useState<Ward[]>([]);
  const [beds, setBeds] = useState<BedInfo[]>([]);
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAdmission, setSelectedAdmission] = useState<Admission | null>(null);
  const [dischargeDialogOpen, setDischargeDialogOpen] = useState(false);
  const [dischargeSummary, setDischargeSummary] = useState("");
  const [dischargeType, setDischargeType] = useState("normal");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch wards
      const { data: wardsData, error: wardsError } = await supabase
        .from("wards")
        .select("*")
        .eq("active", true)
        .order("name");

      if (wardsError) throw wardsError;
      setWards(wardsData || []);

      // Fetch beds with ward info
      const { data: bedsData, error: bedsError } = await supabase
        .from("beds")
        .select(`*, ward:wards(*)`)
        .order("bed_number");

      if (bedsError) throw bedsError;
      setBeds(bedsData || []);

      // Fetch active admissions
      const { data: admissionsData, error: admissionsError } = await supabase
        .from("admissions")
        .select(`*, bed:beds(*, ward:wards(*))`)
        .eq("status", "admitted")
        .order("admitted_at", { ascending: false });

      if (admissionsError) throw admissionsError;

      // Fetch patient info
      const admissionsWithPatients = await Promise.all(
        (admissionsData || []).map(async (admission) => {
          const { data: patient } = await supabase
            .from("patients")
            .select("patient_id, user_id")
            .eq("id", admission.patient_id)
            .single();

          let profile = null;
          if (patient) {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("full_name, phone")
              .eq("user_id", patient.user_id)
              .single();
            profile = profileData;
          }

          return {
            ...admission,
            patient: patient ? { ...patient, profiles: profile } : null,
          };
        })
      );

      setAdmissions(admissionsWithPatients);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDischarge = async () => {
    if (!selectedAdmission) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Update admission
      const { error: admissionError } = await supabase
        .from("admissions")
        .update({
          status: "discharged",
          discharged_at: new Date().toISOString(),
          discharged_by: user?.id,
          discharge_type: dischargeType,
          discharge_summary: dischargeSummary,
        })
        .eq("id", selectedAdmission.id);

      if (admissionError) throw admissionError;

      // Free up the bed
      const { error: bedError } = await supabase
        .from("beds")
        .update({
          status: "available",
          current_patient_id: null,
          current_admission_id: null,
        })
        .eq("id", selectedAdmission.bed_id);

      if (bedError) throw bedError;

      toast({
        title: "Patient Discharged",
        description: "Patient has been discharged successfully",
      });

      setDischargeDialogOpen(false);
      setSelectedAdmission(null);
      setDischargeSummary("");
      fetchData();
    } catch (error) {
      console.error("Error discharging patient:", error);
      toast({
        title: "Error",
        description: "Failed to discharge patient",
        variant: "destructive",
      });
    }
  };

  const getBedStatusColor = (status: string) => {
    switch (status) {
      case "available": return "bg-green-500";
      case "occupied": return "bg-red-500";
      case "maintenance": return "bg-yellow-500";
      case "reserved": return "bg-blue-500";
      default: return "bg-gray-500";
    }
  };

  const getWardStats = (wardId: string) => {
    const wardBeds = beds.filter((b) => b.ward_id === wardId);
    const available = wardBeds.filter((b) => b.status === "available").length;
    const occupied = wardBeds.filter((b) => b.status === "occupied").length;
    return { total: wardBeds.length, available, occupied };
  };

  const totalBeds = beds.length;
  const availableBeds = beds.filter((b) => b.status === "available").length;
  const occupiedBeds = beds.filter((b) => b.status === "occupied").length;
  const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Inpatient Management</h1>
          <p className="text-muted-foreground">Admissions, Discharge & Transfers</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-blue-100">
              <Bed className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Beds</p>
              <p className="text-2xl font-bold">{totalBeds}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-green-100">
              <Home className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Available</p>
              <p className="text-2xl font-bold">{availableBeds}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-red-100">
              <Users className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Occupied</p>
              <p className="text-2xl font-bold">{occupiedBeds}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-purple-100">
              <AlertCircle className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Occupancy Rate</p>
              <p className="text-2xl font-bold">{occupancyRate}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="admissions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="admissions">Current Admissions</TabsTrigger>
          <TabsTrigger value="beds">Bed Management</TabsTrigger>
          <TabsTrigger value="wards">Wards Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="admissions">
          <Card>
            <CardHeader>
              <CardTitle>Current Inpatients</CardTitle>
            </CardHeader>
            <CardContent>
              {admissions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No current admissions</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient</TableHead>
                      <TableHead>Ward / Bed</TableHead>
                      <TableHead>Admission Type</TableHead>
                      <TableHead>Admitted</TableHead>
                      <TableHead>Expected Discharge</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {admissions.map((admission) => {
                      const daysAdmitted = Math.ceil(
                        (new Date().getTime() - new Date(admission.admitted_at).getTime()) / (1000 * 60 * 60 * 24)
                      );
                      return (
                        <TableRow key={admission.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{admission.patient?.profiles?.full_name || "Unknown"}</p>
                              <p className="text-sm text-muted-foreground">{admission.patient?.patient_id}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{admission.bed?.ward?.name}</p>
                              <p className="text-sm text-muted-foreground">Bed: {admission.bed?.bed_number}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {admission.admission_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(admission.admitted_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {admission.expected_discharge_date
                              ? new Date(admission.expected_discharge_date).toLocaleDateString()
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={daysAdmitted > 7 ? "destructive" : "secondary"}>
                              {daysAdmitted} days
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedAdmission(admission);
                                setDischargeDialogOpen(true);
                              }}
                            >
                              <LogOut className="h-4 w-4 mr-1" />
                              Discharge
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="beds">
          <div className="grid gap-6">
            {wards.map((ward) => {
              const wardBeds = beds.filter((b) => b.ward_id === ward.id);
              return (
                <Card key={ward.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{ward.name}</span>
                      <Badge variant="outline">
                        {wardBeds.filter((b) => b.status === "available").length} / {wardBeds.length} Available
                      </Badge>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{ward.description}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                      {wardBeds.map((bed) => (
                        <div
                          key={bed.id}
                          className={`aspect-square rounded-lg flex items-center justify-center text-white text-sm font-medium cursor-pointer hover:opacity-80 transition-opacity ${getBedStatusColor(bed.status)}`}
                          title={`${bed.bed_number} - ${bed.status}`}
                        >
                          {bed.bed_number.split("-")[1] || bed.bed_number}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-4 mt-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-green-500"></div>
                        <span>Available</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-red-500"></div>
                        <span>Occupied</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-yellow-500"></div>
                        <span>Maintenance</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-blue-500"></div>
                        <span>Reserved</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="wards">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {wards.map((ward) => {
              const stats = getWardStats(ward.id);
              const occupancy = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0;
              return (
                <Card key={ward.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bed className="h-5 w-5" />
                      {ward.name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground capitalize">{ward.ward_type} Ward</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between text-sm">
                        <span>Floor {ward.floor_number}</span>
                        <Badge variant="outline">{ward.ward_type}</Badge>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Occupancy</span>
                          <span className="font-medium">{occupancy}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${occupancy > 80 ? "bg-red-500" : occupancy > 50 ? "bg-yellow-500" : "bg-green-500"}`}
                            style={{ width: `${occupancy}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-muted rounded">
                          <p className="text-lg font-bold">{stats.total}</p>
                          <p className="text-xs text-muted-foreground">Total</p>
                        </div>
                        <div className="p-2 bg-green-50 rounded">
                          <p className="text-lg font-bold text-green-600">{stats.available}</p>
                          <p className="text-xs text-muted-foreground">Available</p>
                        </div>
                        <div className="p-2 bg-red-50 rounded">
                          <p className="text-lg font-bold text-red-600">{stats.occupied}</p>
                          <p className="text-xs text-muted-foreground">Occupied</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Discharge Dialog */}
      <Dialog open={dischargeDialogOpen} onOpenChange={setDischargeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discharge Patient</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <p className="font-medium">{selectedAdmission?.patient?.profiles?.full_name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedAdmission?.bed?.ward?.name} - Bed {selectedAdmission?.bed?.bed_number}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Discharge Type</Label>
              <Select value={dischargeType} onValueChange={setDischargeType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal Discharge</SelectItem>
                  <SelectItem value="against_advice">Against Medical Advice</SelectItem>
                  <SelectItem value="transfer">Transfer to Another Facility</SelectItem>
                  <SelectItem value="deceased">Deceased</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Discharge Summary</Label>
              <Textarea
                placeholder="Enter discharge summary, instructions, and follow-up notes..."
                value={dischargeSummary}
                onChange={(e) => setDischargeSummary(e.target.value)}
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDischargeDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleDischarge} disabled={!dischargeSummary}>
                Confirm Discharge
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inpatient;
