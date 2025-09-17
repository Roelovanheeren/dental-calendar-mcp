import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GoogleCalendarService } from '../services/google-calendar.js';
import { GetAppointmentSchema } from '../services/validation.js';
import { DateHelpers } from '../utils/date-helpers.js';
import { MCPError } from '../types.js';

export const getAppointmentTool: Tool = {
  name: 'get_appointment_details',
  description: 'Retrieve detailed information about a specific appointment using its ID.',
  inputSchema: {
    type: 'object',
    properties: {
      appointment_id: {
        type: 'string',
        description: 'The unique ID of the appointment to retrieve',
      },
    },
    required: ['appointment_id'],
  },
};

export async function executeGetAppointment(
  args: any,
  calendarService: GoogleCalendarService
): Promise<string> {
  try {
    // Validate input
    const validatedArgs = GetAppointmentSchema.parse(args);

    // Get appointment details
    let appointment;
    try {
      appointment = await calendarService.getAppointmentDetails(validatedArgs.appointment_id);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: 'Appointment not found',
        message: 'No appointment found with the provided ID. Please verify the appointment ID and try again.',
        suggestedAction: 'Use list_appointments to find the correct appointment ID or search by patient phone',
      });
    }

    const appointmentDate = new Date(appointment.datetime);
    const now = new Date();
    const isPast = appointmentDate < now;
    const isToday = appointmentDate.toDateString() === now.toDateString();
    const hoursUntilAppointment = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Determine appointment status context
    let statusContext = '';
    if (isPast) {
      statusContext = 'This appointment has already occurred.';
    } else if (isToday) {
      statusContext = 'This appointment is scheduled for today.';
    } else if (hoursUntilAppointment < 24) {
      statusContext = 'This appointment is coming up soon (within 24 hours).';
    } else {
      const daysUntil = Math.ceil(hoursUntilAppointment / 24);
      statusContext = `This appointment is in ${daysUntil} day${daysUntil === 1 ? '' : 's'}.`;
    }

    const response = {
      success: true,
      appointment: {
        id: appointment.id,
        patient: {
          name: appointment.patient.name,
          phone: appointment.patient.phone,
          email: appointment.patient.email,
        },
        schedule: {
          datetime: DateHelpers.formatForDisplay(appointmentDate),
          date: appointmentDate.toDateString(),
          time: appointmentDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }),
          duration: appointment.duration,
          endTime: new Date(appointmentDate.getTime() + appointment.duration * 60000)
            .toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            }),
        },
        details: {
          type: appointment.appointmentType,
          status: appointment.status,
          notes: appointment.notes || 'No notes',
        },
        timing: {
          isPast,
          isToday,
          hoursUntil: isPast ? 0 : Math.round(hoursUntilAppointment * 10) / 10,
          statusContext,
        },
        metadata: {
          createdAt: DateHelpers.formatForDisplay(new Date(appointment.createdAt)),
          lastUpdated: DateHelpers.formatForDisplay(new Date(appointment.updatedAt)),
        },
      },
      message: `Found appointment for ${appointment.patient.name} on ${DateHelpers.formatForDisplay(appointmentDate)} for ${appointment.appointmentType}. ${statusContext}`,
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
      error: mcpError.message || 'Failed to retrieve appointment details',
      code: mcpError.code || 'RETRIEVAL_ERROR',
      suggestedAction: 'Please verify the appointment ID and try again',
    });
  }
}

// Additional tool for finding appointments by phone
export const findByPhoneTool: Tool = {
  name: 'find_appointment_by_phone',
  description: 'Find upcoming appointments for a patient using their phone number.',
  inputSchema: {
    type: 'object',
    properties: {
      phone: {
        type: 'string',
        description: 'Patient phone number (will be normalized automatically)',
      },
    },
    required: ['phone'],
  },
};

export async function executeFindByPhone(
  args: any,
  calendarService: GoogleCalendarService
): Promise<string> {
  try {
    // Validate and normalize phone number
    const phone = args.phone?.replace(/\D/g, ''); // Remove non-digits

    if (!phone || phone.length < 10) {
      return JSON.stringify({
        success: false,
        error: 'Invalid phone number',
        message: 'Please provide a valid phone number with at least 10 digits',
      });
    }

    // Search for appointment
    const appointment = await calendarService.findAppointmentByPhone(phone);

    if (!appointment) {
      return JSON.stringify({
        success: false,
        error: 'No appointment found',
        message: 'No upcoming appointments found for this phone number',
        suggestedAction: 'Please verify the phone number or check if the appointment might be under a different number',
      });
    }

    const appointmentDate = new Date(appointment.datetime);
    const now = new Date();
    const hoursUntilAppointment = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    const response = {
      success: true,
      appointment: {
        id: appointment.id,
        patient: {
          name: appointment.patient.name,
          phone: appointment.patient.phone,
          email: appointment.patient.email,
        },
        datetime: DateHelpers.formatForDisplay(appointmentDate),
        type: appointment.appointmentType,
        duration: appointment.duration,
        status: appointment.status,
        notes: appointment.notes || 'No notes',
        hoursUntil: Math.round(hoursUntilAppointment * 10) / 10,
      },
      message: `Found appointment for ${appointment.patient.name} on ${DateHelpers.formatForDisplay(appointmentDate)} for ${appointment.appointmentType}`,
    };

    return JSON.stringify(response, null, 2);

  } catch (error: any) {
    const mcpError = error as MCPError;
    return JSON.stringify({
      success: false,
      error: mcpError.message || 'Failed to find appointment',
      code: mcpError.code || 'SEARCH_ERROR',
      suggestedAction: 'Please verify the phone number and try again',
    });
  }
}