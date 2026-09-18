import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, BrainCircuit, Loader2, ShieldCheck } from "lucide-react";

export interface TriageRecommendation {
  urgencyPriority: number;
  rationale: string;
  redFlags: string[];
  recommendedChecks: string[];
}

const labels: Record<number, string> = { 1: "Normal", 2: "High", 3: "Emergency" };

interface Props {
  recommendation: TriageRecommendation | null;
  loading: boolean;
  disabled: boolean;
  onReview: () => void;
}

export function TriageAIRecommendation({ recommendation, loading, disabled, onReview }: Props) {
  return (
    <Card className="border-primary/30">
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg"><BrainCircuit className="h-5 w-5 text-primary" /> AI Triage Review</CardTitle>
        <Button type="button" variant="outline" onClick={onReview} disabled={loading || disabled} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
          {recommendation ? "Review again" : "Suggest urgency"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>This suggestion supports clinical review only. The nurse must verify findings and make the final urgency decision.</p>
        </div>
        {recommendation ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Suggested urgency</span>
              <Badge variant={recommendation.urgencyPriority === 3 ? "destructive" : recommendation.urgencyPriority === 2 ? "default" : "outline"}>
                {labels[recommendation.urgencyPriority] ?? "Review required"}
              </Badge>
            </div>
            <p className="text-sm leading-relaxed">{recommendation.rationale}</p>
            {recommendation.redFlags.length > 0 && (
              <div><p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-destructive"><AlertTriangle className="h-4 w-4" /> Red flags</p><ul className="list-disc space-y-1 pl-5 text-sm">{recommendation.redFlags.map((item) => <li key={item}>{item}</li>)}</ul></div>
            )}
            {recommendation.recommendedChecks.length > 0 && (
              <div><p className="mb-2 text-sm font-semibold">Immediate checks to consider</p><ul className="list-disc space-y-1 pl-5 text-sm">{recommendation.recommendedChecks.map((item) => <li key={item}>{item}</li>)}</ul></div>
            )}
          </div>
        ) : <p className="text-sm text-muted-foreground">Record the presenting complaint and available vital signs, then request a review.</p>}
      </CardContent>
    </Card>
  );
}