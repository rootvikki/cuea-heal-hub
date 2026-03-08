import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, CheckCircle } from "lucide-react";

const VISIT_REASONS = [
  "Consultation",
  "Treatment",
  "Nursing Care",
  "Lab Tests",
  "Pharmacy",
  "Dental",
  "Other",
];

const QUESTIONS = [
  "How satisfied are you with the time you waited before being attended?",
  "How satisfied are you with how the healthcare provider communicated with you?",
  "How satisfied are you with the cleanliness of the facility?",
  "How satisfied are you with the quality of treatment received?",
  "How satisfied are you with the pharmacy services?",
  "How satisfied are you with the laboratory services?",
  "How satisfied are you with the overall experience?",
];

const RATINGS = ["Very Dissatisfied", "Dissatisfied", "Neutral", "Satisfied", "Very Satisfied"];

interface FeedbackFormProps {
  patientId: string;
}

const FeedbackForm = ({ patientId }: FeedbackFormProps) => {
  const { toast } = useToast();
  const [visitReason, setVisitReason] = useState("");
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleRating = (questionIdx: number, value: string) => {
    setRatings((prev) => ({ ...prev, [`q${questionIdx}`]: value }));
  };

  const handleSubmit = async () => {
    if (!visitReason) {
      toast({ title: "Please select visit reason", variant: "destructive" });
      return;
    }
    if (Object.keys(ratings).length < QUESTIONS.length) {
      toast({ title: "Please answer all questions", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("patient_feedback" as any).insert({
        patient_id: patientId,
        visit_reason: visitReason,
        ratings,
        comments: comments || null,
      });

      if (error) throw error;
      toast({ title: "Thank you!", description: "Your feedback has been submitted" });
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card>
        <CardContent className="py-16 text-center space-y-4">
          <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
          <h2 className="text-xl font-semibold">Thank You for Your Feedback!</h2>
          <p className="text-muted-foreground">Your responses help us improve our services.</p>
          <Button variant="outline" onClick={() => { setSubmitted(false); setRatings({}); setComments(""); setVisitReason(""); }}>
            Submit Another
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" /> Patient Feedback Form
        </CardTitle>
        <CardDescription>
          CUEA University Infirmary — Help us improve our services
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Visit Reason */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Reason for Visit</Label>
          <Select value={visitReason} onValueChange={setVisitReason}>
            <SelectTrigger className="h-12 text-base">
              <SelectValue placeholder="Select reason..." />
            </SelectTrigger>
            <SelectContent>
              {VISIT_REASONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Questions */}
        <div className="space-y-6">
          {QUESTIONS.map((question, idx) => (
            <div key={idx} className="space-y-3 p-4 border rounded-lg">
              <Label className="text-sm font-medium">{idx + 1}. {question}</Label>
              <RadioGroup
                value={ratings[`q${idx}`] || ""}
                onValueChange={(val) => handleRating(idx, val)}
                className="flex flex-wrap gap-3"
              >
                {RATINGS.map((r) => (
                  <div key={r} className="flex items-center space-x-2">
                    <RadioGroupItem value={r} id={`q${idx}-${r}`} />
                    <Label htmlFor={`q${idx}-${r}`} className="text-xs cursor-pointer">{r}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          ))}
        </div>

        {/* Comments */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Additional Comments (Optional)</Label>
          <Textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Any suggestions or comments..."
            rows={4}
          />
        </div>

        <div className="flex justify-end">
          <Button size="lg" onClick={handleSubmit} disabled={submitting} className="gap-2">
            <MessageSquare className="h-4 w-4" />
            {submitting ? "Submitting..." : "Submit Feedback"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default FeedbackForm;
