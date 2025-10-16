import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface Comment {
  id: string;
  comment: string;
  stage: string;
  created_at: string;
  user: {
    full_name: string;
  };
}

interface TicketCommentsDialogProps {
  ticketId: string;
  currentStage: string;
}

export const TicketCommentsDialog = ({ ticketId, currentStage }: TicketCommentsDialogProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchComments();
    }
  }, [open]);

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from("ticket_comments")
      .select(`
        id,
        comment,
        stage,
        created_at,
        user_id
      `)
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching comments:", error);
      return;
    }

    // Fetch user names for each comment
    const commentsWithUsers = await Promise.all(
      (data || []).map(async (comment) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", comment.user_id)
          .single();

        return {
          ...comment,
          user: { full_name: profile?.full_name || "Unknown" },
        };
      })
    );

    setComments(commentsWithUsers as any);
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) {
      toast({
        title: "Comment cannot be empty",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("ticket_comments")
        .insert({
          ticket_id: ticketId,
          user_id: user.id,
          stage: currentStage,
          comment: newComment,
        });

      if (error) throw error;

      toast({
        title: "Comment added",
      });
      setNewComment("");
      fetchComments();
    } catch (error: any) {
      toast({
        title: "Error adding comment",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1">
          <MessageSquare className="h-3 w-3" />
          Comments
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ticket Comments</DialogTitle>
          <DialogDescription>
            View and add comments for this ticket
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={3}
            />
            <Button onClick={handleAddComment} disabled={loading} size="sm">
              {loading ? "Adding..." : "Add Comment"}
            </Button>
          </div>

          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-3">
              {comments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No comments yet
                </p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="font-medium text-sm">{comment.user.full_name}</p>
                        <Badge variant="outline" className="text-xs">
                          {comment.stage.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(comment.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm">{comment.comment}</p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};
