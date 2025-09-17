import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GoogleCalendarService } from '../services/google-calendar.js';
import { CancelAppointmentSchema } from '../services/validation.js';
import { DateHelpers } from '../utils/date-helpers.js';
import { MCPError } from '../types.js';

export const cancelAppointmentTool: Tool = {
  name: 'cancel_appointment',
  description: 'Cancel an existing appointment by appointment ID. Sends cancellation notification to the patient.',
  inputSchema: {
    type: 'object',
    properties: {
      appointment_id: {
        type: 'string',
        description: 'The unique ID of the appointment to cancel',
      },
    },
    required: ['appointment_id'],
  },
};

export async function executeCancelAppointment(
  args: any,
  calendarService: GoogleCalendarService
): Promise<string> {
  try {
    // Validate input
    const validatedArgs = CancelAppointmentSchema.parse(args);

    // First, get the appointment details to show confirmation
    let appointmentDetails;
    try {
      appointmentDetails = await calendarService.getAppointmentDetails(validatedArgs.appointment_id);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: 'Appointment not found',
        message: 'No appointment found with the provided ID. Please verify the appointment ID and try again.',
        suggestedAction: 'Use list_appointments to find the correct appointment ID',
      });
    }

    // Check if appointment is in the past
    const appointmentDate = new Date(appointmentDetails.datetime);
    const now = new Date();

    if (appointmentDate < now) {
      return JSON.stringify({
        success: false,
        error: 'Cannot cancel past appointment',
        message: 'This appointment has already occurred and cannot be cancelled.',
        appointment: {
          id: appointmentDetails.id,
          patient: appointmentDetails.patient.name,
          datetime: DateHelpers.formatForDisplay(appointmentDate),
          type: appointmentDetails.appointmentType,
        },
      });
    }

    // Check if cancellation is too late (less than 2 hours notice)
    const hoursUntilAppointment = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    const isLastMinute = hoursUntilAppointment < 2;

    // Cancel the appointment
    const cancelled = await calendarService.cancelAppointment(validatedArgs.appointment_id);

    if (!cancelled) {
      return JSON.stringify({
        success: false,
        error: 'Failed to cancel appointment',
        message: 'There was an error cancelling the appointment. Please try again.',
      });
    }

    const response = {
      success: true,
      cancelledAppointment: {
        id: appointmentDetails.id,
        patient: {
          name: appointmentDetails.patient.name,
          phone: appointmentDetails.patient.phone,
          email: appointmentDetails.patient.email,
        },
        originalDatetime: DateHelpers.formatForDisplay(appointmentDate),
        type: appointmentDetails.appointmentType,
        duration: appointmentDetails.duration,
      },
      cancellationTime: DateHelpers.formatForDisplay(now),
      hoursNotice: Math.round(hoursUntilAppointment * 10) / 10,
      isLastMinute,
      message: `Appointment successfully cancelled for ${appointmentDetails.patient.name} on ${DateHelpers.formatForDisplay(appointmentDate)}. Cancellation notification has been sent to ${appointmentDetails.patient.email}.`,
      notice: isLastMinute
        ? 'Note: This is a last-minute cancellation (less than 2 hours notice). Please consider the clinic\'s cancellation policy.'
        : 'Cancellation processed with appropriate notice.',
    };

    return JSON.stringify(response, null, 2);

  } catch (error: any) {
    if (error.name === 'ZodError') {
      const issues = error.issues.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`);
      return JSON.stringify({
        success: false,
        error: 'Invalid appointment ID format',
        details: issues,
        suggestedAction: 'Please provide a valid appointment ID',
      });
    }

    const mcpError = error as MCPError;
    return JSON.stringify({
      success: false,
      error: mcpError.message || 'Failed to cancel appointment',
      code: mcpError.code || 'CANCELLATION_ERROR',
      suggestedAction: 'Please verify the appointment ID and try again, or contact the office directly',
    });
  }
}