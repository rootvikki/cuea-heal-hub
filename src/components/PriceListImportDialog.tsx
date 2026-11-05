import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Check, ChevronsUpDown, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Pager, usePaged } from "@/components/Pager";
import { logAuditEvent } from "@/lib/auditLog";
import { formatKES } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { isPriceChange, matchLines, parsePriceRows, sectionCategory, type Match, type PriceLine, type Target } from "@/lib/priceList";

type Row = Match & { key: string; selected: boolean; targetId: string | null };
type Filter = "changes" | "check" | "new" | "same" | "lab" | "skipped";

const keyOf = (l: PriceLine) => `${l.kind}:${l.row}:${l.name}`;
const money = (n: number | null | undefined) => (n == null ? "—" : formatKES(n));

/** Lets the pharmacist load a price list (Excel) and review every price change before saving it. */
export function PriceListImportDialog({ open, onOpenChange, inventory, canEditLab, onDone }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  inventory: { id: string; drug_name: string; strength_size?: string | null; formulation?: string | null; unit_price: number | null; insurance_price?: number | null }[];
  /** Lab prices belong to the lab catalog, which only administrators may change. */
  canEditLab: boolean;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [labTargets, setLabTargets] = useState<Target[]>([]);
  const [skipped, setSkipped] = useState<PriceLine[]>([]);
  const [filter, setFilter] = useState<Filter>("changes");
  const [addNew, setAddNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const drugTargets: Target[] = useMemo(() => inventory.map((i) => ({
    id: i.id,
    name: `${i.drug_name}${i.strength_size && !String(i.drug_name).toLowerCase().includes(String(i.strength_size).toLowerCase()) ? ` ${i.strength_size}` : ""}${i.formulation ? ` ${i.formulation}` : ""}`,
    cash: i.unit_price, insurance: i.insurance_price,
  })), [inventory]);

  const reset = () => { setRows([]); setSkipped([]); setFileName(""); setFilter("changes"); setAddNew(false); if (fileRef.current) fileRef.current.value = ""; };

  const readFile = async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const { lines, error } = parsePriceRows(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true }));
      if (error) return toast.error("This file can't be read as a price list", { description: error });
      if (!lines.length) return toast.error("No priced lines found in the file");
      const { data: lab } = await supabase.from("lab_tests_catalog").select("id, test_name, price, insurance_price").order("test_name");
      const labT: Target[] = (lab || []).map((t) => ({ id: t.id, name: t.test_name, cash: t.price, insurance: t.insurance_price }));
      setLabTargets(labT);
      const toRows = (ms: Match[]): Row[] => ms.map((m) => ({ ...m, key: keyOf(m.line), targetId: m.target?.id ?? null, selected: !!m.target && m.change && m.score >= 0.85 }));
      setRows([
        ...toRows(matchLines(lines.filter((l) => l.kind === "drug"), drugTargets)),
        ...toRows(matchLines(lines.filter((l) => l.kind === "lab"), labT)).map((r) => ({ ...r, selected: r.selected && canEditLab })),
      ]);
      setSkipped(lines.filter((l) => l.kind === "procedure"));
      setFileName(file.name);
      setFilter("changes");
    } catch (e) {
      toast.error("Could not open the file", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const targetsFor = (r: Row) => (r.line.kind === "lab" ? labTargets : drugTargets);
  const targetOf = (r: Row) => targetsFor(r).find((t) => t.id === r.targetId);
  const changed = (r: Row) => { const t = targetOf(r); return !!t && isPriceChange(r.line, t); };
  const group = (r: Row): Filter => {
    if (r.line.kind === "lab") return "lab";
    if (!r.targetId) return "new";
    if (r.status === "similar" && r.targetId === r.target?.id) return "check";
    return changed(r) ? "changes" : "same";
  };
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { changes: 0, check: 0, new: 0, same: 0, lab: 0, skipped: skipped.length };
    rows.forEach((r) => { c[group(r)]++; });
    return c;
  }, [rows, skipped]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => rows.filter((r) => group(r) === filter), [rows, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = usePaged(shown, { size: 25, resetKey: `${filter}|${fileName}` });

  const update = (key: string, patch: Partial<Row>) => setRows((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setAll = (sel: boolean) => setRows((p) => p.map((r) => (group(r) === filter && (r.line.kind !== "lab" || canEditLab) ? { ...r, selected: sel && (r.targetId ? changed(r) : true) } : r)));

  const toSave = rows.filter((r) => r.selected && (r.targetId ? changed(r) && (r.line.kind !== "lab" || canEditLab) : r.line.kind === "drug" && addNew));
  const priceUpdates = toSave.filter((r) => r.targetId);
  const newDrugs = toSave.filter((r) => !r.targetId);

  const save = async () => {
    if (!toSave.length) return toast.info("Nothing ticked to save");
    setSaving(true);
    let ok = 0; const failed: string[] = [];
    try {
      // Same target picked twice: the last ticked line wins, so each drug is written once
      const byTarget = new Map(priceUpdates.map((r) => [`${r.line.kind}:${r.targetId}`, r]));
      const jobs = [...byTarget.values()].map((r) => async () => {
        const values = { insurance_price: r.line.insurance };
        const { error } = r.line.kind === "lab"
          ? await supabase.from("lab_tests_catalog").update({ price: r.line.cash, ...values }).eq("id", r.targetId!)
          : await supabase.from("pharmacy_inventory").update({ unit_price: r.line.cash, ...values }).eq("id", r.targetId!);
        if (error) failed.push(`${r.line.name}: ${error.message}`); else ok++;
      });
      for (let i = 0; i < jobs.length; i += 10) await Promise.all(jobs.slice(i, i + 10).map((j) => j()));
      if (newDrugs.length) {
        const { error } = await supabase.from("pharmacy_inventory").insert(newDrugs.map((r) => ({
          drug_name: r.line.name, category: r.line.section ? sectionCategory(r.line.section) : null,
          quantity: 0, unit_price: r.line.cash, insurance_price: r.line.insurance,
        })));
        if (error) failed.push(`New drugs: ${error.message}`); else ok += newDrugs.length;
      }
      logAuditEvent({ action: "price_list_imported", module: "pharmacy", details: {
        file: fileName, updated: byTarget.size, added: newDrugs.length, failed: failed.length,
        lab: priceUpdates.filter((r) => r.line.kind === "lab").length,
      } });
      if (failed.length) toast.error(`${failed.length} line(s) not saved`, { description: failed.slice(0, 4).join("\n") });
      if (ok) toast.success("Price list saved", { description: `${byTarget.size} price(s) updated${newDrugs.length ? `, ${newDrugs.length} drug(s) added with 0 stock` : ""}` });
      onDone();
      if (!failed.length) { reset(); onOpenChange(false); }
    } finally {
      setSaving(false);
    }
  };

  const FILTERS: { key: Filter; label: string; hint: string }[] = [
    { key: "changes", label: "Price changes", hint: "Drug found — the price list has a different price. Ticked ones will be saved." },
    { key: "check", label: "Check the name", hint: "A drug with a similar name was found. Make sure it is the same drug (same strength), or pick the right one." },
    { key: "new", label: "Not in inventory", hint: "No matching drug. Pick the right drug, or tick to add it as a new drug with 0 stock." },
    { key: "same", label: "Already correct", hint: "These drugs already have these prices." },
    { key: "lab", label: "Lab tests", hint: canEditLab ? "Lab test prices (cash and insurance)." : "Only an administrator can change lab test prices — ask an admin to import the same file." },
    { key: "skipped", label: "Procedures (not imported)", hint: "Procedure prices are set on the procedures screen, not in the pharmacy." },
  ];
  const info = FILTERS.find((f) => f.key === filter)!;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-5xl max-h-[92vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Import price list</DialogTitle>
          <DialogDescription className="text-left">Load the Excel price list (columns: name, Cash, INS). Nothing is saved until you review and press Save.</DialogDescription>
        </DialogHeader>

        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); }} />
        {!rows.length ? (
          <button type="button" onClick={() => fileRef.current?.click()}
            className="w-full rounded-lg border-2 border-dashed p-10 text-center hover:bg-muted/40 transition-colors">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="mt-2 font-medium">Choose the price list file</p>
            <p className="text-sm text-muted-foreground">Excel (.xlsx) with Cash and INS price columns, drugs grouped under headings</p>
          </button>
        ) : (
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span><b>{fileName}</b> · {rows.length + skipped.length} priced lines</span>
              <Button variant="outline" size="sm" onClick={() => { reset(); fileRef.current?.click(); }}>Choose another file</Button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} className="h-9" onClick={() => setFilter(f.key)}>
                  {f.label} <Badge variant="secondary" className="ml-1.5">{counts[f.key]}</Badge>
                </Button>
              ))}
            </div>
            <p className={cn("rounded-md border p-2.5 text-sm", filter === "check" && "border-amber-300 bg-amber-50 text-amber-900", filter === "lab" && !canEditLab && "border-amber-300 bg-amber-50 text-amber-900")}>{info.hint}</p>

            {filter === "skipped" ? (
              <ul className="text-sm grid sm:grid-cols-2 gap-1">
                {skipped.map((l) => <li key={l.row} className="flex justify-between gap-2 border rounded px-2 py-1"><span>{l.name}</span><span className="text-muted-foreground whitespace-nowrap">{money(l.cash)} / {money(l.insurance)}</span></li>)}
              </ul>
            ) : (
              <>
                {filter === "new" && (
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={addNew} onChange={(e) => setAddNew(e.target.checked)} />
                    Add the ticked drugs to the inventory as new drugs (stock 0 — receive stock when it arrives)
                  </label>
                )}
                {shown.length > 0 && (filter !== "lab" || canEditLab) && (
                  <div className="flex gap-2 text-sm">
                    <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setAll(true)}>Tick all</Button>
                    <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setAll(false)}>Untick all</Button>
                  </div>
                )}
                <div className="overflow-x-auto max-w-full">
                  <table className="w-full border-collapse text-sm min-w-[720px]">
                    <thead>
                      <tr>{["", "On the price list", filter === "lab" ? "Lab test" : "Drug in inventory", "Now (cash / ins.)", "New (cash / ins.)"].map((h, i) => <th key={i} className="border bg-muted px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {pages.pageItems.map((r) => {
                        const t = targetOf(r);
                        const locked = r.line.kind === "lab" && !canEditLab;
                        return (
                          <tr key={r.key} className={cn(r.selected && "bg-primary/5")}>
                            <td className="border px-2 py-1.5 w-8 text-center">
                              <input type="checkbox" className="h-4 w-4 accent-primary" disabled={locked || (!!t && !changed(r))} checked={r.selected}
                                onChange={(e) => update(r.key, { selected: e.target.checked })} aria-label={`Save ${r.line.name}`} />
                            </td>
                            <td className="border px-2 py-1.5">
                              <p className="font-medium">{r.line.name}</p>
                              <p className="text-xs text-muted-foreground">{r.line.section} · row {r.line.row}</p>
                            </td>
                            <td className="border px-2 py-1.5 min-w-[220px]">
                              <TargetPicker value={t} options={targetsFor(r)} disabled={locked}
                                onChange={(id) => { const nt = targetsFor(r).find((x) => x.id === id); update(r.key, { targetId: id, selected: id ? !!nt && isPriceChange(r.line, nt) : false }); }} />
                              {r.status === "similar" && r.targetId === r.target?.id && <p className="text-xs text-amber-700 mt-1">Similar name — check it is the same drug</p>}
                            </td>
                            <td className="border px-2 py-1.5 whitespace-nowrap">{t ? `${money(t.cash)} / ${money(t.insurance)}` : "—"}</td>
                            <td className={cn("border px-2 py-1.5 whitespace-nowrap", t && changed(r) && "font-semibold")}>{money(r.line.cash)} / {money(r.line.insurance)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pager pager={pages} label="lines" />
              </>
            )}

            <div className="sticky bottom-0 -mx-4 -mb-4 sm:-mx-6 sm:-mb-6 border-t bg-background/95 backdrop-blur px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                Will save: <b>{priceUpdates.filter((r) => r.line.kind === "drug").length}</b> drug price(s)
                {canEditLab && <>, <b>{priceUpdates.filter((r) => r.line.kind === "lab").length}</b> lab price(s)</>}
                {addNew && <>, <b>{newDrugs.length}</b> new drug(s)</>}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={saving}>Cancel</Button>
                <Button onClick={save} disabled={saving || !toSave.length}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save {toSave.length || ""} change{toSave.length === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Searchable list to choose (or clear) which drug / test a price-list line belongs to. */
function TargetPicker({ value, options, onChange, disabled }: { value?: Target; options: Target[]; onChange: (id: string | null) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className={cn("h-auto min-h-9 w-full justify-between text-left font-normal whitespace-normal", !value && "text-muted-foreground")}>
          {value ? value.name : "Not found — choose…"}
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,380px)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList className="max-h-64">
            <CommandEmpty>No match</CommandEmpty>
            <CommandGroup>
              {value && <CommandItem value="__none__ not in inventory" onSelect={() => { onChange(null); setOpen(false); }}>None of these (new)</CommandItem>}
              {options.map((o) => (
                <CommandItem key={o.id} value={`${o.name} ${o.id}`} onSelect={() => { onChange(o.id); setOpen(false); }}>
                  <Check className={cn("h-4 w-4 mr-2", value?.id === o.id ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1">{o.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{o.cash != null ? formatKES(o.cash) : ""}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
