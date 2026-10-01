import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  order: {
    id: string;
    doctor_reviewed_at?: string | null;
    doctor_review_comments?: string | null;
    reviewer?: { profile?: { full_name?: string | null } | null } | null;
  };
  canSignOff: boolean;
  onSigned?: () => void;
}

export function LabResultSignOff({ order, canSignOff, onSigned }: Props) {
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);

  if (order.doctor_reviewed_at) {
    return (
      <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs space-y-1">
        <p className="flex items-center gap-1 font-semibold text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" /> Reviewed & signed off
        </p>
        <p className="text-muted-foreground">
          {new Date(order.doctor_reviewed_at).toLocaleString()}
          {order.reviewer?.profile?.full_name ? ` · ${order.reviewer.profile.full_name}` : ""}
        </p>
        {order.doctor_review_comments && <p>Comments: {order.doctor_review_comments}</p>}
      </div>
    );
  }

  if (!canSignOff) {
    return <p className="text-xs text-muted-foreground">Awaiting doctor review</p>;
  }

  const signOff = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("sign_off_lab_order" as any, { _order_id: order.id, _comments: comments });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Results reviewed and signed off");
    setComments("");
    onSigned?.();
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        placeholder="Review comments (interpretation, next steps)..."
        rows={3}
        className="text-sm"
      />
      <Button size="sm" onClick={signOff} disabled={saving}>
        <CheckCircle2 className="h-4 w-4 mr-1" /> {saving ? "Signing off..." : "Review & Sign Off"}
      </Button>
    </div>
  );
}
