import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GoogleCalendarService } from '../services/google-calendar.js';
import { RescheduleAppointmentSchema } from '../services/validation.js';
import { DateHelpers } from '../utils/date-helpers.js';
import { MCPError } from '../types.js';

export const rescheduleAppointmentTool: Tool = {
  name: 'reschedule_appointment',
  description: 'Reschedule an existing appointment to a new date and time. Validates availability and sends updated confirmation to the patient.',
  inputSchema: {
    type: 'object',
    properties: {
      appointment_id: {
        type: 'string',
        description: 'The unique ID of the appointment to reschedule',
      },
      new_datetime: {
        type: 'string',
        description: 'New appointment date and time (ISO format or natural language)',
      },
    },
    required: ['appointment_id', 'new_datetime'],
  },
};

export async function executeRescheduleAppointment(
  args: any,
  calendarService: GoogleCalendarService
): Promise<string> {
  try {
    // Validate input
    const validatedArgs = RescheduleAppointmentSchema.parse(args);

    // First, get the existing appointment details
    let originalAppointment;
    try {
      originalAppointment = await calendarService.getAppointmentDetails(validatedArgs.appointment_id);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: 'Appointment not found',
        message: 'No appointment found with the provided ID. Please verify the appointment ID and try again.',
        suggestedAction: 'Use list_appointments to find the correct appointment ID',
      });
    }

    // Parse new datetime
    let newAppointmentDate: Date;
    try {
      newAppointmentDate = DateHelpers.parseNaturalLanguage(validatedArgs.new_datetime);
    } catch {
      newAppointmentDate = new Date(validatedArgs.new_datetime);
    }

    // Validate new appointment time
    if (!DateHelpers.isWithinBusinessHours(newAppointmentDate)) {
      return JSON.stringify({
        success: false,
        error: 'New time is outside business hours',
        message: 'Appointments can only be scheduled during business hours (9 AM - 5 PM, Monday - Friday)',
        originalAppointment: {
          datetime: DateHelpers.formatForDisplay(new Date(originalAppointment.datetime)),
          patient: originalAppointment.patient.name,
        },
        suggestedAction: 'Please choose a time between 9:00 AM and 5:00 PM on a weekday',
      });
    }

    if (!DateHelpers.canBookAppointment(newAppointmentDate)) {
      return JSON.stringify({
        success: false,
        error: 'New time is too soon',
        message: 'Appointments must be scheduled at least 2 hours in advance',
        originalAppointment: {
          datetime: DateHelpers.formatForDisplay(new Date(originalAppointment.datetime)),
          patient: originalAppointment.patient.name,
        },
        suggestedAction: 'Please choose a time at least 2 hours from now',
      });
    }

    // Check availability for new time slot
    const dateStr = newAppointmentDate.toISOString().split('T')[0];
    const availableSlots = await calendarService.getAvailableSlots(
      dateStr,
      originalAppointment.duration
    );

    const requestedStartTime = newAppointmentDate.toISOString();
    const hasAvailableSlot = availableSlots.some(slot =>
      Math.abs(new Date(slot.start).getTime() - newAppointmentDate.getTime()) < 60000 // Within 1 minute
    );

    if (!hasAvailableSlot) {
      return JSON.stringify({
        success: false,
        error: 'New time slot is not available',
        message: 'The requested new time conflicts with existing appointments',
        originalAppointment: {
          id: originalAppointment.id,
          datetime: DateHelpers.formatForDisplay(new Date(originalAppointment.datetime)),
          patient: originalAppointment.patient.name,
          type: originalAppointment.appointmentType,
        },
        suggestedAction: 'Please check available slots for that date and choose an available time',
        availableSlots: availableSlots.slice(0, 5).map(slot => ({
          time: DateHelpers.formatForDisplay(new Date(slot.start)),
          duration: originalAppointment.duration,
        })),
      });
    }

    // Perform the reschedule
    const rescheduledAppointment = await calendarService.rescheduleAppointment(
      validatedArgs.appointment_id,
      newAppointmentDate.toISOString()
    );

    const originalDate = new Date(originalAppointment.datetime);
    const newDate = new Date(rescheduledAppointment.datetime);

    const response = {
      success: true,
      rescheduledAppointment: {
        id: rescheduledAppointment.id,
        patient: {
          name: rescheduledAppointment.patient.name,
          phone: rescheduledAppointment.patient.phone,
          email: rescheduledAppointment.patient.email,
        },
        originalDatetime: DateHelpers.formatForDisplay(originalDate),
        newDatetime: DateHelpers.formatForDisplay(newDate),
        type: rescheduledAppointment.appointmentType,
        duration: rescheduledAppointment.duration,
        status: rescheduledAppointment.status,
      },
      rescheduleTime: DateHelpers.formatForDisplay(new Date()),
      message: `Appointment successfully rescheduled for ${rescheduledAppointment.patient.name} from ${DateHelpers.formatForDisplay(originalDate)} to ${DateHelpers.formatForDisplay(newDate)}. Updated confirmation has been sent to ${rescheduledAppointment.patient.email}.`,
      reminderInfo: 'The patient will receive updated email reminders for the new appointment time.',
    };

    return JSON.stringify(response, null, 2);

  } catch (error: any) {
    if (error.name === 'ZodError') {
      const issues = error.issues.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`);
      return JSON.stringify({
        success: false,
        error: 'Invalid reschedule information provided',
        details: issues,
        suggestedAction: 'Please provide a valid appointment ID and new date/time',
      });
    }

    const mcpError = error as MCPError;
    return JSON.stringify({
      success: false,
      error: mcpError.message || 'Failed to reschedule appointment',
      code: mcpError.code || 'RESCHEDULE_ERROR',
      suggestedAction: 'Please verify the appointment ID and new time, then try again',
    });
  }
}