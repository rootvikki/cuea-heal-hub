import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Shield, Building, FileText, Clock, CheckCircle, XCircle, Plus, Search } from "lucide-react";

interface InsuranceProvider {
  id: string;
  name: string;
  code: string;
  provider_type: string;
  contact_phone: string;
  contact_email: string;
  discount_percentage: number;
  active: boolean;
}

interface InsuranceClaim {
  id: string;
  claim_number: string;
  invoice_id: string;
  patient_id: string;
  provider_id: string;
  member_number: string;
  amount_claimed: number;
  amount_approved: number | null;
  patient_liability: number;
  status: string;
  submitted_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  provider?: InsuranceProvider;
  patient?: {
    patient_id: string;
    profiles?: {
      full_name: string;
    };
  };
}

interface PreAuthorization {
  id: string;
  patient_id: string;
  provider_id: string;
  member_number: string;
  auth_number: string | null;
  service_type: string;
  estimated_cost: number | null;
  approved_amount: number | null;
  status: string;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  provider?: InsuranceProvider;
  patient?: {
    patient_id: string;
    profiles?: {
      full_name: string;
    };
  };
}

const Insurance = () => {
  const { toast } = useToast();
  const [providers, setProviders] = useState<InsuranceProvider[]>([]);
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [preAuths, setPreAuths] = useState<PreAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [newProvider, setNewProvider] = useState({
    name: "",
    code: "",
    provider_type: "private",
    contact_phone: "",
    contact_email: "",
    discount_percentage: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch providers
      const { data: providersData, error: providersError } = await supabase
        .from("insurance_providers")
        .select("*")
        .order("name");

      if (providersError) throw providersError;
      setProviders(providersData || []);

      // Fetch claims with provider info
      const { data: claimsData, error: claimsError } = await supabase
        .from("insurance_claims")
        .select(`*, provider:insurance_providers(*)`)
        .order("created_at", { ascending: false });

      if (claimsError) throw claimsError;

      // Fetch patient info for claims
      const claimsWithPatients = await Promise.all(
        (claimsData || []).map(async (claim) => {
          const { data: patient } = await supabase
            .from("patients")
            .select("patient_id, user_id")
            .eq("id", claim.patient_id)
            .single();

          let profile = null;
          if (patient) {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", patient.user_id)
              .single();
            profile = profileData;
          }

          return {
            ...claim,
            patient: patient ? { ...patient, profiles: profile } : null,
          };
        })
      );

      setClaims(claimsWithPatients);

      // Fetch pre-authorizations
      const { data: preAuthsData, error: preAuthsError } = await supabase
        .from("pre_authorizations")
        .select(`*, provider:insurance_providers(*)`)
        .order("created_at", { ascending: false });

      if (preAuthsError) throw preAuthsError;

      // Fetch patient info for pre-auths
      const preAuthsWithPatients = await Promise.all(
        (preAuthsData || []).map(async (auth) => {
          const { data: patient } = await supabase
            .from("patients")
            .select("patient_id, user_id")
            .eq("id", auth.patient_id)
            .single();

          let profile = null;
          if (patient) {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", patient.user_id)
              .single();
            profile = profileData;
          }

          return {
            ...auth,
            patient: patient ? { ...patient, profiles: profile } : null,
          };
        })
      );

      setPreAuths(preAuthsWithPatients);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProvider = async () => {
    try {
      const { error } = await supabase.from("insurance_providers").insert(newProvider);

      if (error) throw error;

      toast({
        title: "Provider Added",
        description: `${newProvider.name} has been added successfully`,
      });

      setAddProviderOpen(false);
      setNewProvider({
        name: "",
        code: "",
        provider_type: "private",
        contact_phone: "",
        contact_email: "",
        discount_percentage: 0,
      });
      fetchData();
    } catch (error) {
      console.error("Error adding provider:", error);
      toast({
        title: "Error",
        description: "Failed to add insurance provider",
        variant: "destructive",
      });
    }
  };

  const updateClaimStatus = async (claimId: string, status: string, approvedAmount?: number) => {
    try {
      const updates: Record<string, unknown> = { status };
      
      if (status === "submitted") {
        updates.submitted_at = new Date().toISOString();
        const { data: { user } } = await supabase.auth.getUser();
        updates.submitted_by = user?.id;
      }
      
      if (status === "approved" || status === "partially_approved") {
        updates.amount_approved = approvedAmount;
        updates.reviewed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("insurance_claims")
        .update(updates)
        .eq("id", claimId);

      if (error) throw error;

      toast({
        title: "Claim Updated",
        description: `Claim status changed to ${status}`,
      });

      fetchData();
    } catch (error) {
      console.error("Error updating claim:", error);
      toast({
        title: "Error",
        description: "Failed to update claim",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "submitted": return "bg-blue-100 text-blue-800";
      case "under_review": return "bg-purple-100 text-purple-800";
      case "approved": return "bg-green-100 text-green-800";
      case "partially_approved": return "bg-orange-100 text-orange-800";
      case "rejected": return "bg-red-100 text-red-800";
      case "paid": return "bg-emerald-100 text-emerald-800";
      case "expired": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const pendingClaims = claims.filter((c) => c.status === "pending");
  const submittedClaims = claims.filter((c) => c.status === "submitted" || c.status === "under_review");
  const totalClaimedAmount = claims.reduce((sum, c) => sum + c.amount_claimed, 0);
  const totalApprovedAmount = claims.reduce((sum, c) => sum + (c.amount_approved || 0), 0);

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
          <h1 className="text-3xl font-bold">Insurance Management</h1>
          <p className="text-muted-foreground">Claims, pre-authorizations & provider management</p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-yellow-100">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pending Claims</p>
              <p className="text-2xl font-bold">{pendingClaims.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-blue-100">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Submitted</p>
              <p className="text-2xl font-bold">{submittedClaims.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Claimed</p>
              <p className="text-2xl font-bold">KES {totalClaimedAmount.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-emerald-100">
              <Shield className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Approved</p>
              <p className="text-2xl font-bold">KES {totalApprovedAmount.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="claims" className="space-y-4">
        <TabsList>
          <TabsTrigger value="claims">Claims</TabsTrigger>
          <TabsTrigger value="preauth">Pre-Authorizations</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
        </TabsList>

        <TabsContent value="claims">
          <Card>
            <CardHeader>
              <CardTitle>Insurance Claims</CardTitle>
            </CardHeader>
            <CardContent>
              {claims.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No insurance claims</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Claim #</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Member #</TableHead>
                      <TableHead>Amount Claimed</TableHead>
                      <TableHead>Approved</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {claims.map((claim) => (
                      <TableRow key={claim.id}>
                        <TableCell className="font-mono text-sm">{claim.claim_number}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{claim.patient?.profiles?.full_name || "Unknown"}</p>
                            <p className="text-sm text-muted-foreground">{claim.patient?.patient_id}</p>
                          </div>
                        </TableCell>
                        <TableCell>{claim.provider?.name}</TableCell>
                        <TableCell>{claim.member_number || "-"}</TableCell>
                        <TableCell>KES {claim.amount_claimed.toLocaleString()}</TableCell>
                        <TableCell>
                          {claim.amount_approved ? `KES ${claim.amount_approved.toLocaleString()}` : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(claim.status)}>
                            {claim.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {claim.status === "pending" && (
                              <Button
                                size="sm"
                                onClick={() => updateClaimStatus(claim.id, "submitted")}
                              >
                                Submit
                              </Button>
                            )}
                            {claim.status === "under_review" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateClaimStatus(claim.id, "approved", claim.amount_claimed)}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => updateClaimStatus(claim.id, "rejected")}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preauth">
          <Card>
            <CardHeader>
              <CardTitle>Pre-Authorizations</CardTitle>
            </CardHeader>
            <CardContent>
              {preAuths.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No pre-authorizations</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Auth #</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Service Type</TableHead>
                      <TableHead>Estimated Cost</TableHead>
                      <TableHead>Approved Amount</TableHead>
                      <TableHead>Valid Until</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preAuths.map((auth) => (
                      <TableRow key={auth.id}>
                        <TableCell className="font-mono text-sm">{auth.auth_number || "Pending"}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{auth.patient?.profiles?.full_name || "Unknown"}</p>
                            <p className="text-sm text-muted-foreground">{auth.patient?.patient_id}</p>
                          </div>
                        </TableCell>
                        <TableCell>{auth.provider?.name}</TableCell>
                        <TableCell className="capitalize">{auth.service_type}</TableCell>
                        <TableCell>
                          {auth.estimated_cost ? `KES ${auth.estimated_cost.toLocaleString()}` : "-"}
                        </TableCell>
                        <TableCell>
                          {auth.approved_amount ? `KES ${auth.approved_amount.toLocaleString()}` : "-"}
                        </TableCell>
                        <TableCell>
                          {auth.valid_until ? new Date(auth.valid_until).toLocaleDateString() : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(auth.status)}>
                            {auth.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="providers">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Insurance Providers</CardTitle>
              <Dialog open={addProviderOpen} onOpenChange={setAddProviderOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Provider
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Insurance Provider</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Provider Name</Label>
                        <Input
                          value={newProvider.name}
                          onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                          placeholder="e.g., Jubilee Insurance"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Code</Label>
                        <Input
                          value={newProvider.code}
                          onChange={(e) => setNewProvider({ ...newProvider, code: e.target.value.toUpperCase() })}
                          placeholder="e.g., JUB"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select
                        value={newProvider.provider_type}
                        onValueChange={(value) => setNewProvider({ ...newProvider, provider_type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nhif">NHIF</SelectItem>
                          <SelectItem value="private">Private Insurance</SelectItem>
                          <SelectItem value="corporate">Corporate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input
                          value={newProvider.contact_phone}
                          onChange={(e) => setNewProvider({ ...newProvider, contact_phone: e.target.value })}
                          placeholder="+254..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={newProvider.contact_email}
                          onChange={(e) => setNewProvider({ ...newProvider, contact_email: e.target.value })}
                          placeholder="claims@provider.com"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Discount %</Label>
                      <Input
                        type="number"
                        value={newProvider.discount_percentage}
                        onChange={(e) => setNewProvider({ ...newProvider, discount_percentage: parseFloat(e.target.value) || 0 })}
                        min="0"
                        max="100"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setAddProviderOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddProvider} disabled={!newProvider.name || !newProvider.code}>
                        Add Provider
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.map((provider) => (
                    <TableRow key={provider.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{provider.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{provider.code}</TableCell>
                      <TableCell className="capitalize">{provider.provider_type}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>{provider.contact_phone}</p>
                          <p className="text-muted-foreground">{provider.contact_email}</p>
                        </div>
                      </TableCell>
                      <TableCell>{provider.discount_percentage}%</TableCell>
                      <TableCell>
                        <Badge variant={provider.active ? "default" : "secondary"}>
                          {provider.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Insurance;
