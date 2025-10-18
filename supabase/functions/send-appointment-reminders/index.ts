import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Checking for appointment reminders to send...');

    // Get upcoming appointments (next 24 hours)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);

    const { data: appointments, error: apptError } = await supabase
      .from('appointments')
      .select(`
        id,
        appointment_date,
        reason,
        patient_id,
        departments(name)
      `)
      .gte('appointment_date', tomorrow.toISOString())
      .lt('appointment_date', dayAfter.toISOString())
      .eq('status', 'scheduled');

    if (apptError) {
      console.error('Error fetching appointments:', apptError);
      throw apptError;
    }

    console.log(`Found ${appointments?.length || 0} appointments`);

    let sentCount = 0;
    let errorCount = 0;

    for (const appointment of appointments || []) {
      // Check if reminder already sent
      const { data: existingReminder } = await supabase
        .from('appointment_reminders')
        .select('*')
        .eq('appointment_id', appointment.id)
        .eq('sent', true)
        .maybeSingle();

      if (existingReminder) {
        console.log(`Reminder already sent for appointment ${appointment.id}`);
        continue;
      }

      // Get patient details
      const { data: patient } = await supabase
        .from('patients')
        .select('user_id')
        .eq('id', appointment.patient_id)
        .single();

      if (!patient) continue;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone')
        .eq('user_id', patient.user_id)
        .single();

      if (!profile?.phone) {
        console.log(`No phone number for patient ${appointment.patient_id}`);
        continue;
      }

      // Format appointment date
      const apptDate = new Date(appointment.appointment_date);
      const dateStr = apptDate.toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      });
      const timeStr = apptDate.toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      const deptName = (appointment.departments as any)?.name || 'Hospital';
      const message = `Dear ${profile.full_name}, reminder: You have an appointment at ${deptName} on ${dateStr} at ${timeStr}. ${appointment.reason ? `Reason: ${appointment.reason}` : ''}`;

      try {
        // Send SMS
        const smsResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            phoneNumber: profile.phone,
            message: message,
            notificationType: 'appointment_reminder',
            referenceId: appointment.id,
          }),
        });

        const smsResult = await smsResponse.json();

        if (smsResult.success) {
          // Create reminder record
          await supabase.from('appointment_reminders').insert({
            appointment_id: appointment.id,
            reminder_time: new Date().toISOString(),
            sent: true,
            sent_at: new Date().toISOString(),
          });

          sentCount++;
          console.log(`Reminder sent for appointment ${appointment.id}`);
        } else {
          errorCount++;
          console.error(`Failed to send reminder for appointment ${appointment.id}`);
        }
      } catch (error) {
        errorCount++;
        console.error(`Error sending reminder for appointment ${appointment.id}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sent ${sentCount} reminders, ${errorCount} errors`,
        sentCount,
        errorCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Appointment reminders error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
