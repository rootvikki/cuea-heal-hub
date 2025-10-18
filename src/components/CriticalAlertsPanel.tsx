import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Bell, CheckCircle2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CriticalAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  patient_id: string;
  acknowledged: boolean;
  created_at: string;
  patients?: {
    patient_id: string;
    profiles?: {
      full_name: string;
    };
  };
}

export const CriticalAlertsPanel = () => {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<CriticalAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel('critical-alerts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'critical_alerts',
        },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchAlerts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('critical_alerts')
      .select(`
        *,
        patients (
          patient_id,
          user_id
        )
      `)
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching alerts:', error);
      return;
    }

    // Fetch patient profiles
    const alertsWithProfiles = await Promise.all(
      (data || []).map(async (alert) => {
        if (alert.patients?.user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('user_id', alert.patients.user_id)
            .single();
          
          return {
            ...alert,
            patients: {
              ...alert.patients,
              profiles: profile,
            },
          };
        }
        return alert;
      })
    );

    setAlerts(alertsWithProfiles as any);
    setLoading(false);
  };

  const handleAcknowledge = async (alertId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from('critical_alerts')
      .update({
        acknowledged: true,
        acknowledged_by: user?.id,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', alertId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to acknowledge alert",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Alert acknowledged",
        description: "The alert has been marked as acknowledged",
      });
      fetchAlerts();
    }
  };

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      critical: "bg-destructive text-destructive-foreground",
      high: "bg-warning text-warning-foreground",
      medium: "bg-status-in-progress",
      low: "bg-status-pending",
    };
    return colors[severity] || "bg-muted";
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'lab_result':
      case 'critical_value':
        return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case 'low_stock':
        return <AlertTriangle className="h-5 w-5 text-warning" />;
      default:
        return <Bell className="h-5 w-5" />;
    }
  };

  if (loading) return null;
  if (alerts.length === 0) return null;

  return (
    <Card className="mb-6 border-destructive/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-lg">Critical Alerts</CardTitle>
          </div>
          <Badge variant="destructive" className="text-sm">
            {alerts.length} Active
          </Badge>
        </div>
        <CardDescription>Urgent items requiring immediate attention</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert) => (
          <Alert key={alert.id} className="relative">
            <div className="flex items-start gap-3">
              {getAlertIcon(alert.alert_type)}
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <AlertTitle className="text-sm font-medium">
                    {alert.title}
                  </AlertTitle>
                  <Badge className={getSeverityColor(alert.severity)}>
                    {alert.severity}
                  </Badge>
                </div>
                <AlertDescription className="text-sm">
                  {alert.message}
                </AlertDescription>
                {alert.patients && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Patient: {alert.patients.profiles?.full_name} ({alert.patients.patient_id})
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {new Date(alert.created_at).toLocaleString()}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAcknowledge(alert.id)}
                className="gap-1"
              >
                <CheckCircle2 className="h-3 w-3" />
                Acknowledge
              </Button>
            </div>
          </Alert>
        ))}
      </CardContent>
    </Card>
  );
};
