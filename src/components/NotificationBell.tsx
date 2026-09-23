import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationRow {
  id: string;
  title: string;
  message: string;
  category: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const { user } = useUser();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, title, message, category, link, read, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data as NotificationRow[]) || []);
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as NotificationRow;
          setItems((prev) => [row, ...prev].slice(0, 30));
          toast({ title: row.title, description: row.message });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, toast]);

  const unread = items.filter((i) => !i.read).length;

  const markAllRead = async () => {
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (ids.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  };

  const openItem = async (item: NotificationRow) => {
    if (!item.read) {
      await supabase.from("notifications").update({ read: true }).eq("id", item.id);
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
    }
    if (item.link) {
      setOpen(false);
      navigate(item.link);
    }
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="font-semibold text-sm">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No notifications yet</p>
          ) : (
            <div className="divide-y">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => openItem(item)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-muted/60 transition-colors",
                    !item.read && "bg-primary/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{item.title}</p>
                    {!item.read && <Badge className="text-[10px] shrink-0">New</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
