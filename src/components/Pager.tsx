import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { pageCount, pageNumbers, pageSlice } from "@/lib/paging";

const SIZES = [10, 25, 50, 100];
const SIZE_KEY = "hims-page-size";

/**
 * Splits a list into pages so screens stay short instead of scrolling.
 * The page goes back to 1 whenever `resetKey` changes (new search / filter).
 * The chosen rows-per-page is remembered on this computer.
 */
export function usePaged<T>(items: T[], opts: { size?: number; resetKey?: unknown } = {}) {
  const [size, setSizeState] = useState<number>(() => Number(localStorage.getItem(SIZE_KEY)) || opts.size || 25);
  const [page, setPage] = useState(1);
  const pages = pageCount(items.length, size);
  useEffect(() => { setPage(1); }, [opts.resetKey, size]);
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const pageItems = useMemo(() => pageSlice(items, page, size), [items, page, size]);
  const setSize = (n: number) => { setSizeState(n); localStorage.setItem(SIZE_KEY, String(n)); };
  return { pageItems, page, pages, size, total: items.length, setPage, setSize };
}

export type Paged = Omit<ReturnType<typeof usePaged>, "pageItems">;

/** "Showing 26–50 of 286 · Rows [25] · « ‹ 1 2 3 … 12 › »" */
export function Pager({ pager, className, label = "items" }: { pager: Paged; className?: string; label?: string }) {
  const { page, pages, size, total, setPage, setSize } = pager;
  if (total === 0) return null;
  const from = (page - 1) * size + 1, to = Math.min(page * size, total);
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 py-2 text-sm", className)}>
      <p className="text-muted-foreground">Showing <b className="text-foreground">{from}–{to}</b> of <b className="text-foreground">{total}</b> {label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground hidden sm:inline">Rows</span>
        <Select value={String(size)} onValueChange={(v) => setSize(Number(v))}>
          <SelectTrigger className="h-8 w-[72px]" aria-label="Rows per page"><SelectValue /></SelectTrigger>
          <SelectContent>{SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
        </Select>
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(1)} aria-label="First page"><ChevronsLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
            {pageNumbers(page, pages).map((n, i) => n === null
              ? <span key={`gap-${i}`} className="px-1 text-muted-foreground">…</span>
              : <Button key={n} variant={n === page ? "default" : "outline"} size="sm" className="h-8 min-w-8 px-2" onClick={() => setPage(n)} aria-current={n === page ? "page" : undefined}>{n}</Button>)}
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === pages} onClick={() => setPage(pages)} aria-label="Last page"><ChevronsRight className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
    </div>
  );
}
