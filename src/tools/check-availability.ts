import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GoogleCalendarService } from '../services/google-calendar.js';
import { CheckAvailabilitySchema, ErrorMessages } from '../services/validation.js';
import { DateHelpers } from '../utils/date-helpers.js';
import { MCPError } from '../types.js';

export const checkAvailabilityTool: Tool = {
  name: 'check_available_slots',
  description: 'Check available appointment time slots for a specific date. Returns a list of available time slots considering existing appointments and business hours.',
  inputSchema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Date to check availability for (YYYY-MM-DD format or natural language like "tomorrow", "next Monday")',
      },
      duration: {
        type: 'number',
        description: 'Appointment duration in minutes (default: 30, must be 15-minute increments)',
        default: 30,
      },
      timeRange: {
        type: 'object',
        description: 'Optional time range to limit search (e.g., afternoon appointments only)',
        properties: {
          start: {
            type: 'string',
            description: 'Start time in HH:MM format (e.g., "09:00")',
          },
          end: {
            type: 'string',
            description: 'End time in HH:MM format (e.g., "17:00")',
          },
        },
        required: ['start', 'end'],
      },
    },
    required: ['date'],
  },
};

export async function executeCheckAvailability(
  args: any,
  calendarService: GoogleCalendarService
): Promise<string> {
  try {
    // Validate input
    const validatedArgs = CheckAvailabilitySchema.parse(args);

    // Parse the date (handle natural language)
    let targetDate: Date;
    try {
      targetDate = DateHelpers.parseNaturalLanguage(validatedArgs.date);
    } catch {
      targetDate = DateHelpers.parseDateTime(validatedArgs.date);
    }

    // Validate business day
    if (targetDate.getDay() === 0 || targetDate.getDay() === 6) {
      return JSON.stringify({
        success: false,
        error: 'Appointments are only available Monday through Friday',
        availableSlots: [],
      });
    }

    // Check if date is in the past
    if (targetDate < new Date()) {
      return JSON.stringify({
        success: false,
        error: 'Cannot check availability for dates in the past',
        availableSlots: [],
      });
    }

    // Get available slots
    const availableSlots = await calendarService.getAvailableSlots(
      targetDate.toISOString().split('T')[0], // YYYY-MM-DD format
      validatedArgs.duration,
      validatedArgs.timeRange
    );

    // Format slots for ElevenLabs
    const formattedSlots = availableSlots.map(slot => ({
      start: DateHelpers.formatForDisplay(new Date(slot.start)),
      end: DateHelpers.formatForDisplay(new Date(slot.end)),
      startTime: new Date(slot.start).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      endTime: new Date(slot.end).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      duration: validatedArgs.duration,
    }));

    const response = {
      success: true,
      date: DateHelpers.formatForDisplay(targetDate),
      requestedDuration: validatedArgs.duration,
      availableSlots: formattedSlots,
      totalSlots: formattedSlots.length,
      message: formattedSlots.length > 0
        ? `Found ${formattedSlots.length} available time slots on ${DateHelpers.formatForDisplay(targetDate)}`
        : `No available time slots found on ${DateHelpers.formatForDisplay(targetDate)}. Please try a different date.`,
    };

    return JSON.stringify(response, null, 2);

  } catch (error: any) {
    if (error.name === 'ZodError') {
      const issues = error.issues.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`);
      return JSON.stringify({
        success: false,
        error: 'Validation error',
        details: issues,
      });
    }

    const mcpError = error as MCPError;
    return JSON.stringify({
      success: false,
      error: mcpError.message || 'Failed to check availability',
      code: mcpError.code || 'UNKNOWN_ERROR',
    });
  }
}