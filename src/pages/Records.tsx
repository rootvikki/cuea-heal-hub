import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileText, Search } from "lucide-react";

const Records = () => {
  const [encounters, setEncounters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchEncounters();
  }, []);

  const fetchEncounters = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("encounters")
      .select("*, patients!inner(patient_id, user_id, profiles:profiles!inner(full_name)), departments!inner(name)")
      .order("encounter_date", { ascending: false })
      .limit(50);

    if (data) {
      const mapped = (data as any[]).map((enc) => ({
        ...enc,
        patient: {
          patient_id: enc.patients?.patient_id,
          profile: enc.patients?.profiles,
        },
        department: enc.departments,
      }));
      setEncounters(mapped);
    }
    setLoading(false);
  };

  const filtered = encounters.filter((enc) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      enc.patient?.profile?.full_name?.toLowerCase().includes(term) ||
      enc.patient?.patient_id?.toLowerCase().includes(term) ||
      enc.chief_complaint?.toLowerCase().includes(term) ||
      enc.assessment?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Medical Records (EMR)</h1>
          <p className="text-muted-foreground mt-1">
            Electronic health records and clinical notes
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by patient, complaint, diagnosis..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-80"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Clinical Encounters
          </CardTitle>
          <CardDescription>{filtered.length} record(s) found</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Loading records...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No encounters found</p>
          ) : (
            <div className="space-y-4">
              {filtered.map((enc) => (
                <div key={enc.id} className="p-4 border rounded-lg space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">
                        {enc.patient?.profile?.full_name} ({enc.patient?.patient_id})
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {enc.department?.name} •{" "}
                        {new Date(enc.encounter_date).toLocaleDateString()}
                      </p>
                    </div>
                    {enc.diagnosis && enc.diagnosis.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {enc.diagnosis.map((d: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{d}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <p><strong>Chief Complaint:</strong> {enc.chief_complaint}</p>
                    {enc.subjective && <p><strong>S:</strong> {enc.subjective}</p>}
                    {enc.objective && <p><strong>O:</strong> {enc.objective}</p>}
                    {enc.assessment && <p><strong>A:</strong> {enc.assessment}</p>}
                    {enc.plan && <p><strong>P:</strong> {enc.plan}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Records;
