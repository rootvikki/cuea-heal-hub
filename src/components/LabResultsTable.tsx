import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { resultCategory } from "@/lib/labFields";

export interface LabResultOrder {
  id: string;
  status?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  result_entered_at?: string | null;
  result_value?: string | null;
  result_notes?: string | null;
  flag?: string | null;
  test?: { test_name?: string | null; unit?: string | null; normal_range?: string | null } | null;
  fields?: { field_name: string; field_value: string | null; unit?: string | null; reference_range?: string | null; flag?: string | null; sort_order?: number | null }[] | null;
  lab_result_fields?: LabResultOrder["fields"];
}

const flagCell = (flag?: string | null) => {
  if (!flag || flag === "N") return null;
  const high = flag === "H";
  return (
    <span className={cn("font-bold", high ? "text-destructive" : "text-blue-700")}>{high ? "↑ H" : flag === "L" ? "↓ L" : flag}</span>
  );
};

/**
 * All tests of one visit combined into a single bordered table:
 * Test | Parameter | Result | Unit | Reference range | Flag.
 * Used by the doctor, dental, lab and patient record screens.
 */
export function LabResultsTable({ orders, compact = false, className }: { orders: LabResultOrder[]; compact?: boolean; className?: string }) {
  const cell = cn("border border-border px-2", compact ? "py-1 text-xs" : "py-1.5 text-sm");
  const head = cn(cell, "bg-muted font-semibold text-left whitespace-nowrap");

  if (orders.length === 0) return <p className="text-sm text-muted-foreground">No lab tests for this visit.</p>;

  const notes = orders.filter((o) => o.result_notes?.trim());

  return (
    <div className={cn("space-y-2", className)}>
      <div className="overflow-x-auto rounded-md">
        <table className="w-full border-collapse border border-border min-w-[560px]">
          <thead>
            <tr>
              <th className={head}>Test</th>
              <th className={head}>Parameter</th>
              <th className={head}>Result</th>
              <th className={head}>Unit</th>
              <th className={head}>Reference range</th>
              <th className={cn(head, "text-center")}>Flag</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const fields = [...(o.fields || o.lab_result_fields || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
              const name = o.test?.test_name || "Lab test";
              const done = o.status === "completed";
              const testCell = (span: number) => (
                <td rowSpan={span} className={cn(cell, "align-top font-semibold bg-muted/30")}>
                  {name}
                  {!done && <Badge variant="outline" className="ml-1 text-[10px]">{(o.status || "pending").replace(/_/g, " ")}</Badge>}
                  {done && o.flag === "abnormal" && <Badge variant="destructive" className="ml-1 text-[10px]">Abnormal</Badge>}
                </td>
              );

              if (!done) {
                return (
                  <tr key={o.id}>
                    {testCell(1)}
                    <td colSpan={5} className={cn(cell, "text-muted-foreground italic")}>Result pending</td>
                  </tr>
                );
              }

              if (fields.length > 0) {
                return (
                  <Fragment key={o.id}>
                    {fields.map((f, i) => {
                      const abnormal = f.flag && f.flag !== "N";
                      return (
                        <tr key={`${o.id}-${f.field_name}`} className={abnormal ? "bg-destructive/5" : undefined}>
                          {i === 0 && testCell(fields.length)}
                          <td className={cell}>{f.field_name}</td>
                          <td className={cn(cell, "font-medium", abnormal && "font-bold text-destructive")}>{f.field_value || "—"}</td>
                          <td className={cn(cell, "text-muted-foreground")}>{f.unit || ""}</td>
                          <td className={cn(cell, "text-muted-foreground")}>{f.reference_range || ""}</td>
                          <td className={cn(cell, "text-center")}>{flagCell(f.flag)}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              }

              const cat = resultCategory(o);
              const alert = o.flag === "abnormal" || cat === "positive";
              return (
                <tr key={o.id} className={alert ? "bg-destructive/5" : undefined}>
                  {testCell(1)}
                  <td className={cn(cell, "text-muted-foreground")}>Result</td>
                  <td className={cn(cell, "font-medium", alert && "font-bold text-destructive")}>{o.result_value || "—"}</td>
                  <td className={cn(cell, "text-muted-foreground")}>{o.test?.unit || ""}</td>
                  <td className={cn(cell, "text-muted-foreground")}>{o.test?.normal_range || ""}</td>
                  <td className={cn(cell, "text-center")}>{cat === "positive" ? flagCell("+ve") : cat === "negative" ? <span className="text-muted-foreground">-ve</span> : o.flag === "abnormal" ? flagCell("Abn") : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {notes.length > 0 && (
        <div className={cn("rounded-md border bg-muted/30 p-2 space-y-0.5", compact ? "text-xs" : "text-sm")}>
          <p className="font-semibold">Lab comments</p>
          {notes.map((o) => <p key={o.id}><span className="font-medium">{o.test?.test_name}:</span> {o.result_notes}</p>)}
        </div>
      )}
    </div>
  );
}

/** Groups lab orders by visit (encounter), newest visit first. */
export function groupByVisit<T extends { encounter_id?: string | null; created_at?: string | null }>(orders: T[]) {
  const groups = new Map<string, T[]>();
  for (const o of orders) {
    const k = o.encounter_id || "no-visit";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(o);
  }
  return [...groups.entries()]
    .map(([encounterId, list]) => ({ encounterId, orders: list, date: list[0]?.created_at || "" }))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}
