import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Most common countries first (East Africa), then the rest alphabetically. */
export const COUNTRY_CODES: { code: string; dial: string; name: string }[] = [
  { code: "KE", dial: "254", name: "Kenya" },
  { code: "UG", dial: "256", name: "Uganda" },
  { code: "TZ", dial: "255", name: "Tanzania" },
  { code: "RW", dial: "250", name: "Rwanda" },
  { code: "BI", dial: "257", name: "Burundi" },
  { code: "SS", dial: "211", name: "South Sudan" },
  { code: "ET", dial: "251", name: "Ethiopia" },
  { code: "SO", dial: "252", name: "Somalia" },
  { code: "CD", dial: "243", name: "DR Congo" },
  { code: "CM", dial: "237", name: "Cameroon" },
  { code: "CA", dial: "1", name: "Canada / USA" },
  { code: "EG", dial: "20", name: "Egypt" },
  { code: "ER", dial: "291", name: "Eritrea" },
  { code: "GH", dial: "233", name: "Ghana" },
  { code: "IN", dial: "91", name: "India" },
  { code: "IT", dial: "39", name: "Italy" },
  { code: "MW", dial: "265", name: "Malawi" },
  { code: "NG", dial: "234", name: "Nigeria" },
  { code: "ZA", dial: "27", name: "South Africa" },
  { code: "SD", dial: "249", name: "Sudan" },
  { code: "GB", dial: "44", name: "United Kingdom" },
  { code: "ZM", dial: "260", name: "Zambia" },
  { code: "ZW", dial: "263", name: "Zimbabwe" },
];

const splitValue = (value: string) => {
  const v = (value || "").replace(/[\s\-()]/g, "");
  if (/^0\d+/.test(v)) return { dial: "254", local: v.replace(/^0/, "") };
  const plain = v.replace(/^\+|^00/, "");
  // Longest dial code that matches wins (e.g. 254 before 25)
  const match = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length).find((c) => plain.startsWith(c.dial));
  if (match && (v.startsWith("+") || v.startsWith("00") || plain.length > 9)) return { dial: match.dial, local: plain.slice(match.dial.length) };
  return { dial: "254", local: plain };
};

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
  id?: string;
  placeholder?: string;
}

/**
 * Phone number with a country-code picker. Emits "+<dial><number>",
 * e.g. +254712345678 or +256712345678. Kenya is the default.
 */
export function PhoneInput({ value, onChange, required, className, id, placeholder }: PhoneInputProps) {
  const initial = useMemo(() => splitValue(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [dial, setDial] = useState(initial.dial);
  const [local, setLocal] = useState(initial.local);

  // Keep in sync when the parent resets the form
  useEffect(() => {
    if (!value) { setLocal(""); return; }
    const s = splitValue(value);
    if (`+${s.dial}${s.local}` !== `+${dial}${local}`) { setDial(s.dial); setLocal(s.local); }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = (d: string, l: string) => {
    const digits = l.replace(/[^\d]/g, "").replace(/^0+/, "");
    onChange(digits ? `+${d}${digits}` : "");
  };

  return (
    <div className={cn("flex gap-2", className)}>
      <Select value={dial} onValueChange={(d) => { setDial(d); emit(d, local); }}>
        <SelectTrigger className="h-12 w-[6.5rem] shrink-0 text-base" aria-label="Country code">
          <SelectValue>{`+${dial}`}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {COUNTRY_CODES.map((c) => (
            <SelectItem key={c.code} value={c.dial}>
              +{c.dial} <span className="text-muted-foreground">{c.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        required={required}
        value={local}
        onChange={(e) => { setLocal(e.target.value); emit(dial, e.target.value); }}
        placeholder={placeholder ?? (dial === "254" ? "712 345 678" : "Phone number")}
        className="h-12 text-base flex-1 min-w-0"
      />
    </div>
  );
}
