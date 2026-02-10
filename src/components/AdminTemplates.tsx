import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Building2, TestTube, Camera, Stethoscope } from "lucide-react";

export const AdminTemplates = () => {
  const { toast } = useToast();
  const [departments, setDepartments] = useState<any[]>([]);
  const [labTests, setLabTests] = useState<any[]>([]);
  const [imagingCatalog, setImagingCatalog] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("departments");

  // Department form
  const [deptForm, setDeptForm] = useState({ name: "", description: "" });
  // Lab form
  const [labForm, setLabForm] = useState({ test_name: "", test_code: "", price: "", category: "", normal_range: "", unit: "" });
  // Imaging form
  const [imgForm, setImgForm] = useState({ name: "", modality: "", price: "", body_part: "", turnaround_hours: "" });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const [depts, labs, imgs] = await Promise.all([
      supabase.from("departments").select("*").order("name"),
      supabase.from("lab_tests_catalog").select("*").order("test_name"),
      supabase.from("imaging_catalog").select("*").order("modality, name"),
    ]);
    setDepartments(depts.data || []);
    setLabTests(labs.data || []);
    setImagingCatalog(imgs.data || []);
  };

  const openAdd = () => {
    setEditMode(null);
    if (activeTab === "departments") setDeptForm({ name: "", description: "" });
    if (activeTab === "lab_tests") setLabForm({ test_name: "", test_code: "", price: "", category: "", normal_range: "", unit: "" });
    if (activeTab === "imaging") setImgForm({ name: "", modality: "", price: "", body_part: "", turnaround_hours: "" });
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditMode(item.id);
    if (activeTab === "departments") setDeptForm({ name: item.name, description: item.description || "" });
    if (activeTab === "lab_tests") setLabForm({ test_name: item.test_name, test_code: item.test_code || "", price: String(item.price), category: item.category || "", normal_range: item.normal_range || "", unit: item.unit || "" });
    if (activeTab === "imaging") setImgForm({ name: item.name, modality: item.modality, price: String(item.price), body_part: item.body_part || "", turnaround_hours: item.turnaround_hours ? String(item.turnaround_hours) : "" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (activeTab === "departments") {
        if (editMode) {
          await supabase.from("departments").update({ name: deptForm.name, description: deptForm.description || null }).eq("id", editMode);
        } else {
          await supabase.from("departments").insert({ name: deptForm.name, description: deptForm.description || null });
        }
      } else if (activeTab === "lab_tests") {
        const data = { test_name: labForm.test_name, test_code: labForm.test_code || null, price: parseFloat(labForm.price), category: labForm.category || null, normal_range: labForm.normal_range || null, unit: labForm.unit || null };
        if (editMode) {
          await supabase.from("lab_tests_catalog").update(data).eq("id", editMode);
        } else {
          await supabase.from("lab_tests_catalog").insert(data);
        }
      } else if (activeTab === "imaging") {
        const data = { name: imgForm.name, modality: imgForm.modality, price: parseFloat(imgForm.price), body_part: imgForm.body_part || null, turnaround_hours: imgForm.turnaround_hours ? parseInt(imgForm.turnaround_hours) : null };
        if (editMode) {
          await supabase.from("imaging_catalog").update(data).eq("id", editMode);
        } else {
          await supabase.from("imaging_catalog").insert(data);
        }
      }
      toast({ title: "Saved", description: `${editMode ? "Updated" : "Created"} successfully` });
      setDialogOpen(false);
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string, table: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    const { error } = await supabase.from(table as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Deleted" });
    fetchAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">System Configuration</h2>
        <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" /> Add New</Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="departments"><Building2 className="h-3.5 w-3.5 mr-1" />Departments</TabsTrigger>
          <TabsTrigger value="lab_tests"><TestTube className="h-3.5 w-3.5 mr-1" />Lab Tests</TabsTrigger>
          <TabsTrigger value="imaging"><Camera className="h-3.5 w-3.5 mr-1" />Imaging</TabsTrigger>
        </TabsList>

        <TabsContent value="departments">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Description</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {departments.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>{d.description || "-"}</TableCell>
                      <TableCell className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(d.id, "departments")}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lab_tests">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Test Name</TableHead><TableHead>Code</TableHead><TableHead>Category</TableHead><TableHead>Price (KES)</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {labTests.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.test_name}</TableCell>
                      <TableCell>{t.test_code || "-"}</TableCell>
                      <TableCell><Badge variant="outline">{t.category || "General"}</Badge></TableCell>
                      <TableCell>{t.price}</TableCell>
                      <TableCell className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(t.id, "lab_tests_catalog")}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="imaging">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Study</TableHead><TableHead>Modality</TableHead><TableHead>Body Part</TableHead><TableHead>Price (KES)</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {imagingCatalog.map(i => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell>{i.modality}</TableCell>
                      <TableCell>{i.body_part || "-"}</TableCell>
                      <TableCell>{i.price}</TableCell>
                      <TableCell className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(i)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(i.id, "imaging_catalog")}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editMode ? "Edit" : "Add"} {activeTab === "departments" ? "Department" : activeTab === "lab_tests" ? "Lab Test" : "Imaging Study"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {activeTab === "departments" && (
              <>
                <div className="space-y-2"><Label>Name *</Label><Input value={deptForm.name} onChange={e => setDeptForm({ ...deptForm, name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Description</Label><Input value={deptForm.description} onChange={e => setDeptForm({ ...deptForm, description: e.target.value })} /></div>
              </>
            )}
            {activeTab === "lab_tests" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Test Name *</Label><Input value={labForm.test_name} onChange={e => setLabForm({ ...labForm, test_name: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Test Code</Label><Input value={labForm.test_code} onChange={e => setLabForm({ ...labForm, test_code: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>Price (KES) *</Label><Input type="number" value={labForm.price} onChange={e => setLabForm({ ...labForm, price: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Category</Label><Input value={labForm.category} onChange={e => setLabForm({ ...labForm, category: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Unit</Label><Input value={labForm.unit} onChange={e => setLabForm({ ...labForm, unit: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label>Normal Range</Label><Input value={labForm.normal_range} onChange={e => setLabForm({ ...labForm, normal_range: e.target.value })} /></div>
              </>
            )}
            {activeTab === "imaging" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Study Name *</Label><Input value={imgForm.name} onChange={e => setImgForm({ ...imgForm, name: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Modality *</Label><Input value={imgForm.modality} onChange={e => setImgForm({ ...imgForm, modality: e.target.value })} placeholder="X-Ray, Ultrasound, CT..." /></div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>Price (KES) *</Label><Input type="number" value={imgForm.price} onChange={e => setImgForm({ ...imgForm, price: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Body Part</Label><Input value={imgForm.body_part} onChange={e => setImgForm({ ...imgForm, body_part: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Turnaround (hrs)</Label><Input type="number" value={imgForm.turnaround_hours} onChange={e => setImgForm({ ...imgForm, turnaround_hours: e.target.value })} /></div>
                </div>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>{editMode ? "Update" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
