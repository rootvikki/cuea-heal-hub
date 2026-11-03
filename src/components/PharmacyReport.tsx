import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Download, FileSpreadsheet, Loader2, Printer, RotateCcw } from "lucide-react";
import { openPdfWindow } from "@/lib/letterhead";
import { FORMULATIONS } from "@/lib/rxFormat";
import {
  EXPIRY_LABEL, MOVE_LABEL, STOCK_STATUS_LABEL, expiryBucket, filterInventory, moveType, nairobiToday, stockStatus, stockValue, summarizeInventory,
  type ExpiryBucket, type InvFilters, type InvItem, type MoveType, type StockStatus,
} from "@/lib/pharmacyReport";
import { buildPharmacyPdf, buildPharmacyWorkbook, movesCsv, stockCsv, type MoveView } from "@/lib/pharmacyExport";
import { cn } from "@/lib/utils";

const kes = (n: number) => `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const ddmm = (ymd?: string | null) => (ymd ? ymd.slice(0, 10).split("-").reverse().join("/") : "-");
const shift = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return nairobiToday(d); };

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
};

type SortKey = "name" | "qty" | "value" | "expiry" | "price";

function Pick({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-72">{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

/** Pharmacy reports: the drug list (stock, expiry, value) and stock movements, with CSV / Excel / branded PDF. */
export function PharmacyReport({ inventory }: { inventory: InvItem[] }) {
  const { profile } = useUser();
  const today = nairobiToday();
  const [view, setView] = useState<"stock" | "moves">("stock");

  // stock filters
  const [text, setText] = useState("");
  const [category, setCategory] = useState("all");
  const [formulation, setFormulation] = useState("all");
  const [status, setStatus] = useState<InvFilters["status"]>("all");
  const [expiry, setExpiry] = useState<InvFilters["expiry"]>("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  // movement filters
  const [from, setFrom] = useState(shift(-30));
  const [to, setTo] = useState(today);
  const [drug, setDrug] = useState("all");
  const [moveKind, setMoveKind] = useState<"all" | MoveType>("all");
  const [moves, setMoves] = useState<MoveView[]>([]);
  const [loadingMoves, setLoadingMoves] = useState(false);

  const categories = useMemo(() => [...new Set(inventory.map((i) => i.category).filter(Boolean) as string[])].sort(), [inventory]);
  const byId = useMemo(() => new Map(inventory.map((i) => [i.id, i])), [inventory]);

  const stockRows = useMemo(() => {
    const rows = filterInventory(inventory, {
      text, category, formulation, status, expiry,
      minPrice: minPrice === "" ? null : Number(minPrice), maxPrice: maxPrice === "" ? null : Number(maxPrice),
    }, today);
    const cmp: Record<SortKey, (a: InvItem, b: InvItem) => number> = {
      name: (a, b) => a.drug_name.localeCompare(b.drug_name),
      qty: (a, b) => a.quantity - b.quantity,
      value: (a, b) => stockValue(b) - stockValue(a),
      price: (a, b) => (Number(b.unit_price) || 0) - (Number(a.unit_price) || 0),
      expiry: (a, b) => (a.expiry_date || "9999").localeCompare(b.expiry_date || "9999"),
    };
    return [...rows].sort(cmp[sort]);
  }, [inventory, text, category, formulation, status, expiry, minPrice, maxPrice, sort, today]);
  const sum = useMemo(() => summarizeInventory(stockRows, today), [stockRows, today]);

  useEffect(() => {
    if (view !== "moves") return;
    let cancelled = false;
    (async () => {
      setLoadingMoves(true);
      let q = supabase.from("pharmacy_stock_transactions").select("*").gte("transaction_date", from).lte("transaction_date", to)
        .order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).limit(5000);
      if (drug !== "all") q = q.eq("inventory_id", drug);
      const { data } = await q;
      const rows = data || [];
      const staffIds = [...new Set(rows.map((r) => r.recorded_by).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (staffIds.length) {
        const { data: st } = await supabase.from("staff").select("id, user_id").in("id", staffIds);
        const uids = (st || []).map((s) => s.user_id);
        const { data: pr } = uids.length ? await supabase.from("profiles").select("user_id, full_name").in("user_id", uids) : { data: [] as any[] };
        const nm = new Map((pr || []).map((p: any) => [p.user_id, p.full_name]));
        (st || []).forEach((s) => names.set(s.id, nm.get(s.user_id) || ""));
      }
      if (cancelled) return;
      setMoves(rows.map((r) => ({ ...r, drug: byId.get(r.inventory_id)?.drug_name || "(removed drug)", strength: byId.get(r.inventory_id)?.strength_size || "", recordedBy: r.recorded_by ? names.get(r.recorded_by) || "" : "" })));
      setLoadingMoves(false);
    })();
    return () => { cancelled = true; };
  }, [view, from, to, drug, byId]);

  const moveRows = useMemo(() => moves.filter((r) => moveKind === "all" || moveType(r) === moveKind), [moves, moveKind]);
  const moveSum = useMemo(() => ({
    received: moveRows.reduce((a, r) => a + (r.qty_received || 0), 0),
    issued: moveRows.reduce((a, r) => a + (r.qty_issued || 0), 0),
    value: moveRows.reduce((a, r) => a + (r.qty_issued || 0) * (Number(r.unit_price) || 0), 0),
    drugs: new Set(moveRows.map((r) => r.inventory_id)).size,
  }), [moveRows]);

  const filterSummary = () => view === "stock" ? [
    `As at ${ddmm(today)}`,
    category !== "all" && `Category: ${category === "none" ? "none" : category}`,
    formulation !== "all" && `Form: ${formulation}`,
    status !== "all" && `Stock: ${status === "attention" ? "Out or low" : STOCK_STATUS_LABEL[status as StockStatus]}`,
    expiry !== "all" && `Expiry: ${expiry === "within90" ? "Expired or within 90 days" : EXPIRY_LABEL[expiry as ExpiryBucket]}`,
    (minPrice || maxPrice) && `Price: ${minPrice || 0}–${maxPrice || "any"}`,
    text && `Search: "${text}"`,
  ].filter(Boolean) as string[] : [
    `${ddmm(from)} to ${ddmm(to)}`,
    drug !== "all" && `Drug: ${byId.get(drug)?.drug_name}`,
    moveKind !== "all" && `Type: ${MOVE_LABEL[moveKind as MoveType]}`,
  ].filter(Boolean) as string[];

  const base = view === "stock" ? `Pharmacy_Stock_${today}` : `Pharmacy_Movements_${from}_${to}`;
  const exportCsv = () => download(`${base}.csv`, view === "stock" ? stockCsv(stockRows, today) : movesCsv(moveRows));
  const exportXlsx = () => XLSX.writeFile(buildPharmacyWorkbook(stockRows, view === "moves" ? moveRows : null, filterSummary(), today), `${base}.xlsx`);
  const exportPdf = () => void openPdfWindow(() => buildPharmacyPdf(view, stockRows, moveRows, filterSummary(), profile?.full_name, today));

  const resetStock = () => { setText(""); setCategory("all"); setFormulation("all"); setStatus("all"); setExpiry("all"); setMinPrice(""); setMaxPrice(""); setSort("name"); };

  const stat = (label: string, value: string | number, onClick?: () => void, tone?: string) => (
    <button type="button" onClick={onClick} disabled={!onClick} className={cn("rounded-lg border p-3 text-left transition-colors", onClick && "hover:bg-muted/50", tone)}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </button>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Pharmacy reports</CardTitle>
        <CardDescription>Query the drug list any way you need, then download it as CSV, Excel or a branded PDF.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as "stock" | "moves")}>
            <TabsList>
              <TabsTrigger value="stock">Drug list &amp; stock</TabsTrigger>
              <TabsTrigger value="moves">Stock movements</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> CSV</Button>
            <Button variant="outline" size="sm" onClick={exportXlsx}><FileSpreadsheet className="h-4 w-4 mr-1" /> Excel</Button>
            <Button size="sm" onClick={exportPdf}><Printer className="h-4 w-4 mr-1" /> Branded PDF</Button>
          </div>
        </div>

        {view === "stock" ? (
          <>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-8 items-end">
              <div className="space-y-1 col-span-2"><Label className="text-xs">Search</Label><Input className="h-10" placeholder="Drug, generic, batch, strength…" value={text} onChange={(e) => setText(e.target.value)} /></div>
              <Pick label="Category" value={category} onChange={setCategory} options={[{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c })), { value: "none", label: "No category" }]} />
              <Pick label="Form" value={formulation} onChange={setFormulation} options={[{ value: "all", label: "All forms" }, ...FORMULATIONS.map((f) => ({ value: f, label: f })), { value: "none", label: "Not set" }]} />
              <Pick label="Stock" value={status || "all"} onChange={(v) => setStatus(v as InvFilters["status"])} options={[{ value: "all", label: "All" }, { value: "attention", label: "Out or low" }, ...(Object.keys(STOCK_STATUS_LABEL) as StockStatus[]).map((s) => ({ value: s, label: STOCK_STATUS_LABEL[s] }))]} />
              <Pick label="Expiry" value={expiry || "all"} onChange={(v) => setExpiry(v as InvFilters["expiry"])} options={[{ value: "all", label: "All" }, { value: "within90", label: "Expired or ≤ 90 days" }, ...(Object.keys(EXPIRY_LABEL) as ExpiryBucket[]).map((b) => ({ value: b, label: EXPIRY_LABEL[b] }))]} />
              <div className="space-y-1"><Label className="text-xs">Price (KES)</Label>
                <div className="flex items-center gap-1"><Input className="h-10" type="number" placeholder="min" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} /><Input className="h-10" type="number" placeholder="max" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} /></div>
              </div>
              <Pick label="Sort by" value={sort} onChange={(v) => setSort(v as SortKey)} options={[{ value: "name", label: "Name A–Z" }, { value: "qty", label: "Lowest stock first" }, { value: "value", label: "Highest stock value" }, { value: "price", label: "Highest price" }, { value: "expiry", label: "Soonest expiry" }]} />
            </div>
            <Button variant="ghost" size="sm" onClick={resetStock}><RotateCcw className="h-4 w-4 mr-1" /> Clear filters</Button>

            <div className="grid gap-2 grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
              {stat("Drugs", sum.items)}
              {stat("Units in stock", sum.units.toLocaleString())}
              {stat("Stock value", kes(sum.value))}
              {stat("Out of stock", sum.out, () => setStatus("out"), sum.out ? "border-destructive/40" : "")}
              {stat("Low", sum.low, () => setStatus("low"), sum.low ? "border-orange-300" : "")}
              {stat("Above max", sum.over, () => setStatus("over"))}
              {stat("Expired", `${sum.expired}${sum.expiredValue ? ` · ${kes(sum.expiredValue)}` : ""}`, () => setExpiry("expired"), sum.expired ? "border-destructive/40" : "")}
              {stat("Expiring ≤ 90 days", sum.expiringIn90, () => setExpiry("within90"))}
            </div>

            <div className="overflow-auto max-h-[60vh] border rounded-md">
              <table className="w-full border-collapse text-sm min-w-[1100px]">
                <thead className="sticky top-0 z-10">
                  <tr>{["Drug", "Form", "Strength", "Pack", "Category", "Batch", "Expiry", "Qty", "Reorder", "Min / Max", "Status", "Price", "Ins. price", "Value"].map((h) => <th key={h} className="border bg-muted px-2 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {stockRows.length === 0 ? (
                    <tr><td colSpan={14} className="border px-2 py-8 text-center text-muted-foreground">No drugs match these filters</td></tr>
                  ) : stockRows.map((i) => {
                    const s = stockStatus(i), b = expiryBucket(i.expiry_date, today);
                    return (
                      <tr key={i.id} className="hover:bg-muted/40">
                        <td className="border px-2 py-1"><p className="font-medium">{i.drug_name}</p>{i.generic_name && <p className="text-xs text-muted-foreground">{i.generic_name}</p>}</td>
                        <td className="border px-2 py-1">{i.formulation || "-"}</td>
                        <td className="border px-2 py-1">{i.strength_size || "-"}</td>
                        <td className="border px-2 py-1">{i.package || "-"}</td>
                        <td className="border px-2 py-1">{i.category || "-"}</td>
                        <td className="border px-2 py-1">{i.batch_number || "-"}</td>
                        <td className={cn("border px-2 py-1 whitespace-nowrap", b === "expired" && "text-destructive font-semibold", b === "30" && "text-orange-600 font-semibold")}>{ddmm(i.expiry_date)}{b === "expired" && " · expired"}</td>
                        <td className="border px-2 py-1 text-right font-semibold">{i.quantity}</td>
                        <td className="border px-2 py-1 text-right">{i.reorder_level ?? "-"}</td>
                        <td className="border px-2 py-1 text-right whitespace-nowrap">{i.minimum_stock ?? "-"} / {i.maximum_stock ?? "-"}</td>
                        <td className="border px-2 py-1"><Badge variant={s === "out" || s === "low" ? "destructive" : "outline"} className="whitespace-nowrap font-normal">{STOCK_STATUS_LABEL[s].replace(" (at / below reorder)", "")}</Badge></td>
                        <td className="border px-2 py-1 text-right whitespace-nowrap">{kes(Number(i.unit_price) || 0)}</td>
                        <td className="border px-2 py-1 text-right whitespace-nowrap">{i.insurance_price != null ? kes(Number(i.insurance_price)) : "-"}</td>
                        <td className="border px-2 py-1 text-right whitespace-nowrap">{kes(stockValue(i))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-6 items-end">
              <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" className="h-10" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" className="h-10" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              <div className="flex gap-1 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => { setFrom(today); setTo(today); }}>Today</Button>
                <Button variant="outline" size="sm" onClick={() => { setFrom(shift(-6)); setTo(today); }}>7 days</Button>
                <Button variant="outline" size="sm" onClick={() => { setFrom(today.slice(0, 8) + "01"); setTo(today); }}>This month</Button>
              </div>
              <Pick label="Drug" value={drug} onChange={setDrug} options={[{ value: "all", label: "All drugs" }, ...[...inventory].sort((a, b) => a.drug_name.localeCompare(b.drug_name)).map((i) => ({ value: i.id, label: `${i.drug_name}${i.strength_size ? ` ${i.strength_size}` : ""}` }))]} />
              <Pick label="Type" value={moveKind} onChange={(v) => setMoveKind(v as "all" | MoveType)} options={[{ value: "all", label: "All movements" }, ...(Object.keys(MOVE_LABEL) as MoveType[]).map((m) => ({ value: m, label: MOVE_LABEL[m] }))]} />
            </div>
            <div className="grid gap-2 grid-cols-2 md:grid-cols-5">
              {stat("Lines", moveRows.length)}
              {stat("Drugs", moveSum.drugs)}
              {stat("Units received", moveSum.received.toLocaleString())}
              {stat("Units issued", moveSum.issued.toLocaleString())}
              {stat("Issued value", kes(moveSum.value))}
            </div>
            {loadingMoves ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
              <div className="overflow-auto max-h-[60vh] border rounded-md">
                <table className="w-full border-collapse text-sm min-w-[960px]">
                  <thead className="sticky top-0 z-10">
                    <tr>{["Date", "Drug", "Type", "From / To", "Ref", "Received", "Issued", "Balance", "Price", "Recorded by"].map((h) => <th key={h} className="border bg-muted px-2 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {moveRows.length === 0 ? (
                      <tr><td colSpan={10} className="border px-2 py-8 text-center text-muted-foreground">No stock movements in this period</td></tr>
                    ) : moveRows.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/40">
                        <td className="border px-2 py-1 whitespace-nowrap">{ddmm(r.transaction_date)}</td>
                        <td className="border px-2 py-1">{r.drug}{r.strength ? ` ${r.strength}` : ""}</td>
                        <td className="border px-2 py-1 whitespace-nowrap">{MOVE_LABEL[moveType(r)]}</td>
                        <td className="border px-2 py-1">{r.received_from || r.issued_to || "-"}</td>
                        <td className="border px-2 py-1">{r.invoice_ref || "-"}</td>
                        <td className="border px-2 py-1 text-right text-[hsl(var(--success))] font-semibold">{r.qty_received || ""}</td>
                        <td className="border px-2 py-1 text-right text-destructive font-semibold">{r.qty_issued || ""}</td>
                        <td className="border px-2 py-1 text-right font-bold">{r.balance ?? ""}</td>
                        <td className="border px-2 py-1 text-right whitespace-nowrap">{r.unit_price ? kes(Number(r.unit_price)) : ""}</td>
                        <td className="border px-2 py-1">{r.recordedBy || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
