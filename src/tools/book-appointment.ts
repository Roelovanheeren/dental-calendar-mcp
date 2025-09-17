import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GoogleCalendarService } from '../services/google-calendar.js';
import { BookAppointmentSchema, ValidationHelpers } from '../services/validation.js';
import { DateHelpers } from '../utils/date-helpers.js';
import { MCPError, AppointmentType } from '../types.js';

export const bookAppointmentTool: Tool = {
  name: 'book_appointment',
  description: 'Book a new dental appointment. Creates a calendar event and sends confirmation to the patient.',
  inputSchema: {
    type: 'object',
    properties: {
      patient_name: {
        type: 'string',
        description: 'Full name of the patient',
      },
      phone: {
        type: 'string',
        description: 'Patient phone number (will be normalized automatically)',
      },
      email: {
        type: 'string',
        description: 'Patient email address for appointment confirmations',
      },
      datetime: {
        type: 'string',
        description: 'Appointment date and time (ISO format or natural language)',
      },
      duration: {
        type: 'number',
        description: 'Appointment duration in minutes (default: 30, must be 15-minute increments)',
        default: 30,
      },
      appointment_type: {
        type: 'string',
        description: 'Type of appointment',
        enum: ['cleaning', 'checkup', 'consultation', 'filling', 'root_canal', 'crown', 'extraction', 'emergency'],
        default: 'checkup',
      },
      notes: {
        type: 'string',
        description: 'Optional notes about the appointment',
      },
    },
    required: ['patient_name', 'phone', 'email', 'datetime'],
  },
};

export async function executeBookAppointment(
  args: any,
  calendarService: GoogleCalendarService
): Promise<string> {
  try {
    // Validate input
    const validatedArgs = BookAppointmentSchema.parse(args);

    // Parse and validate datetime
    let appointmentDate: Date;
    try {
      appointmentDate = DateHelpers.parseNaturalLanguage(validatedArgs.datetime);
    } catch {
      appointmentDate = new Date(validatedArgs.datetime);
    }

    // Additional business validations
    if (!DateHelpers.isWithinBusinessHours(appointmentDate)) {
      return JSON.stringify({
        success: false,
        error: 'Appointments can only be scheduled during business hours (9 AM - 5 PM, Monday - Friday)',
        suggestedAction: 'Please choose a time between 9:00 AM and 5:00 PM on a weekday',
      });
    }

    if (!DateHelpers.canBookAppointment(appointmentDate)) {
      return JSON.stringify({
        success: false,
        error: 'Appointments must be scheduled at least 2 hours in advance',
        suggestedAction: 'Please choose a time at least 2 hours from now',
      });
    }

    // Validate appointment type and duration compatibility
    if (!ValidationHelpers.validateAppointmentDuration(
      validatedArgs.appointment_type as AppointmentType,
      validatedArgs.duration
    )) {
      return JSON.stringify({
        success: false,
        error: `Duration ${validatedArgs.duration} minutes is not appropriate for ${validatedArgs.appointment_type} appointments`,
        suggestedAction: 'Please adjust the duration or appointment type',
      });
    }

    // Normalize patient information
    const patientInfo = {
      name: ValidationHelpers.sanitizeName(validatedArgs.patient_name),
      phone: ValidationHelpers.normalizePhoneNumber(validatedArgs.phone),
      email: validatedArgs.email.toLowerCase().trim(),
      notes: validatedArgs.notes || '',
    };

    // Check for time conflicts by getting available slots
    const dateStr = appointmentDate.toISOString().split('T')[0];
    const availableSlots = await calendarService.getAvailableSlots(
      dateStr,
      validatedArgs.duration
    );

    const requestedStartTime = appointmentDate.toISOString();
    const hasAvailableSlot = availableSlots.some(slot =>
      new Date(slot.start).getTime() === appointmentDate.getTime()
    );

    if (!hasAvailableSlot) {
      return JSON.stringify({
        success: false,
        error: 'The requested time slot is not available',
        suggestedAction: 'Please check available slots first and choose an available time',
        availableSlots: availableSlots.slice(0, 5).map(slot => ({
          time: DateHelpers.formatForDisplay(new Date(slot.start)),
          duration: validatedArgs.duration,
        })),
      });
    }

    // Create the appointment
    const appointment = await calendarService.createAppointment(
      patientInfo,
      appointmentDate.toISOString(),
      validatedArgs.duration,
      validatedArgs.appointment_type as AppointmentType,
      validatedArgs.notes
    );

    const response = {
      success: true,
      appointment: {
        id: appointment.id,
        patient: {
          name: appointment.patient.name,
          phone: appointment.patient.phone,
          email: appointment.patient.email,
        },
        datetime: DateHelpers.formatForDisplay(new Date(appointment.datetime)),
        duration: appointment.duration,
        type: appointment.appointmentType,
        status: appointment.status,
        notes: appointment.notes,
      },
      confirmationMessage: `Appointment successfully booked for ${appointment.patient.name} on ${DateHelpers.formatForDisplay(new Date(appointment.datetime))} for ${appointment.appointmentType}. Confirmation has been sent to ${appointment.patient.email}.`,
      reminderInfo: 'The patient will receive email reminders 24 hours and 1 hour before the appointment.',
    };

    return JSON.stringify(response, null, 2);

  } catch (error: any) {
    if (error.name === 'ZodError') {
      const issues = error.issues.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`);
      return JSON.stringify({
        success: false,
        error: 'Invalid appointment information provided',
        details: issues,
        suggestedAction: 'Please provide valid patient information and appointment details',
      });
    }

    const mcpError = error as MCPError;
    return JSON.stringify({
      success: false,
      error: mcpError.message || 'Failed to book appointment',
      code: mcpError.code || 'BOOKING_ERROR',
      suggestedAction: 'Please try again or contact the office directly',
    });
  }
}