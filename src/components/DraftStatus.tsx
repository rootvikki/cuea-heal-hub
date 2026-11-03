import { Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FormDraft } from "@/hooks/useFormDraft";
import { cn } from "@/lib/utils";

/** Small "Draft saved 12:03 · Discard" line shown on forms that autosave. */
export function DraftStatus({ draft, className }: { draft: FormDraft; className?: string }) {
  if (!draft.savedAt && !draft.restored) {
    return <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}><Save className="h-3 w-3" /> Autosaves as you type</p>;
  }
  const time = draft.savedAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-xs", className)}>
      <span className={cn("flex items-center gap-1.5", draft.restored ? "text-primary font-medium" : "text-muted-foreground")}>
        <Save className="h-3 w-3" />
        {draft.restored ? `Draft restored${time ? ` (saved ${time})` : ""}` : `Draft saved ${time}`}
      </span>
      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={draft.discard}>
        <RotateCcw className="h-3 w-3 mr-1" /> Discard draft
      </Button>
    </div>
  );
}
