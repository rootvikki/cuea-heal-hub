import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fieldKind, isValidNumber, isCriticalFlag, splitMulti, toggleMulti, type LabFieldDef } from "@/lib/labFields";

interface Props {
  def: LabFieldDef;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  flag?: string | null;
  size?: "sm" | "lg";
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/** One result box: number-only input, answer buttons / drop-down, or multi-select chips — by the field's type. */
export function LabFieldInput({ def, value, onChange, disabled, flag, size = "sm", onKeyDown }: Props) {
  const kind = fieldKind(def);
  const bad = !!flag;
  const critical = isCriticalFlag(flag);
  const h = size === "lg" ? "h-11 text-base" : "h-9 text-sm";

  if (kind === "number" || kind === "text") {
    const invalid = kind === "number" && !def.freeText && !!value.trim() && !isValidNumber(value);
    return (
      <div>
        <Input
          data-lab-field
          // Not a numeric keypad: the lab also types "<5", ">100" or a range such as "0-2"
          inputMode={undefined}
          placeholder={kind === "number" ? (def.freeText ? "e.g. 0-2" : "e.g. 12.5") : undefined}
          value={value}
          disabled={disabled}
          onKeyDown={onKeyDown}
          onChange={(e) => onChange(kind === "number" ? e.target.value.replace(",", ".") : e.target.value)}
          aria-label={def.name}
          aria-invalid={invalid}
          className={cn(h, size === "lg" ? "w-28" : "w-28", (bad || invalid) && "border-destructive font-bold text-destructive", critical && "bg-destructive/10")}
        />
        {invalid && <p className="text-[11px] text-destructive mt-0.5">Type a number, &lt;5, &gt;100 or 5-10</p>}
      </div>
    );
  }

  const options = def.options || [];

  if (kind === "multi") {
    const picked = new Set(splitMulti(value));
    return (
      <div className="flex flex-wrap gap-1" role="group" aria-label={def.name}>
        {options.map((o) => (
          <Button key={o} type="button" size="sm" disabled={disabled} variant={picked.has(o) ? "default" : "outline"}
            className={cn("h-7 px-2 text-xs", picked.has(o) && o !== options[0] && bad && "bg-destructive hover:bg-destructive/90")}
            onClick={() => onChange(toggleMulti(def, value, o))}>
            {o}
          </Button>
        ))}
      </div>
    );
  }

  const short = options.length <= 4 && options.join("").length <= 40;
  if (short) {
    return (
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={def.name}>
        {options.map((o) => {
          const on = value === o;
          const abnormal = on && bad;
          return (
            <Button key={o} type="button" size="sm" role="radio" aria-checked={on} disabled={disabled}
              variant={on ? "default" : "outline"}
              className={cn(size === "lg" ? "h-10 px-3" : "h-7 px-2 text-xs", abnormal && "bg-destructive hover:bg-destructive/90")}
              onClick={() => onChange(on ? "" : o)}>
              {o}
            </Button>
          );
        })}
      </div>
    );
  }

  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={def.name} className={cn(h, "min-w-[11rem]", bad && "border-destructive font-bold text-destructive")}>
        <SelectValue placeholder="Choose…" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
