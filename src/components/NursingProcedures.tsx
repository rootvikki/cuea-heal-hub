import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";

const PROCEDURE_OPTIONS = [
  { value: "cleaning_dressing_minor", label: "Cleaning & Dressing - Minor", price: 200 },
  { value: "cleaning_dressing_normal", label: "Cleaning & Dressing - Normal", price: 400 },
  { value: "cleaning_dressing_major", label: "Cleaning & Dressing - Major", price: 800 },
  { value: "debridement", label: "Debridement", price: 1000 },
  { value: "ear_syringing", label: "Ear Syringing", price: 500 },
  { value: "suturing", label: "Suturing", price: 1500 },
  { value: "removal_of_sutures", label: "Removal of Sutures", price: 300 },
  { value: "cannulation", label: "Cannulation", price: 500 },
  { value: "injection_im", label: "Injection - I/M", price: 200 },
  { value: "injection_iv", label: "Injection - I/V", price: 300 },
  { value: "injection_subcutaneous", label: "Injection - Subcutaneous", price: 200 },
  { value: "injection_dermal", label: "Injection - Dermal", price: 200 },
  { value: "infusion_normal_saline", label: "Infusion - Normal Saline", price: 500 },
  { value: "infusion_dns", label: "Infusion - DNS", price: 500 },
  { value: "infusion_hartmans", label: "Infusion - Hartman's Solution", price: 500 },
  { value: "infusion_d5", label: "Infusion - D5", price: 500 },
  { value: "infusion_d10", label: "Infusion - D10", price: 500 },
  { value: "infusion_d50", label: "Infusion - D50", price: 600 },
  { value: "infusion_metronidazole", label: "Infusion - Metronidazole", price: 700 },
  { value: "infusion_paracetamol", label: "Infusion - Paracetamol", price: 600 },
  { value: "observation", label: "Observation", price: 300 },
  { value: "nebulization", label: "Nebulization", price: 500 },
  { value: "incision_drainage", label: "Incision & Drainage", price: 2000 },
  { value: "removal_foreign_bodies", label: "Removal of Foreign Bodies", price: 1000 },
];

export interface SelectedProcedure {
  type: string;
  label: string;
  price: number;
  notes: string;
}

interface NursingProceduresProps {
  procedures: SelectedProcedure[];
  onChange: (procedures: SelectedProcedure[]) => void;
}

export function NursingProcedures({ procedures, onChange }: NursingProceduresProps) {
  const [selectedType, setSelectedType] = useState("");

  const addProcedure = () => {
    const opt = PROCEDURE_OPTIONS.find((p) => p.value === selectedType);
    if (!opt) return;
    onChange([...procedures, { type: opt.value, label: opt.label, price: opt.price, notes: "" }]);
    setSelectedType("");
  };

  const removeProcedure = (index: number) => {
    onChange(procedures.filter((_, i) => i !== index));
  };

  const updateNotes = (index: number, notes: string) => {
    const updated = [...procedures];
    updated[index] = { ...updated[index], notes };
    onChange(updated);
  };

  const total = procedures.reduce((s, p) => s + p.price, 0);

  return (
    <div className="space-y-3">
      <Label className="font-semibold">Nursing Procedures</Label>
      <div className="flex gap-2">
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select procedure..." />
          </SelectTrigger>
          <SelectContent>
            {PROCEDURE_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label} — KES {p.price}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" onClick={addProcedure} disabled={!selectedType}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {procedures.length > 0 && (
        <div className="space-y-2">
          {procedures.map((proc, i) => (
            <div key={i} className="flex items-center gap-2 p-2 border rounded-lg text-sm">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{proc.label}</span>
                  <Badge variant="outline">KES {proc.price}</Badge>
                </div>
                <Input
                  placeholder="Notes..."
                  className="mt-1 h-7 text-xs"
                  value={proc.notes}
                  onChange={(e) => updateNotes(i, e.target.value)}
                />
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeProcedure(i)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div className="text-sm font-semibold text-right">Total: KES {total}</div>
        </div>
      )}
    </div>
  );
}
