import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GoogleCalendarService } from '../services/google-calendar.js';
import { ListAppointmentsSchema } from '../services/validation.js';
import { DateHelpers } from '../utils/date-helpers.js';
import { MCPError, AppointmentDetails } from '../types.js';

export const listAppointmentsTool: Tool = {
  name: 'list_appointments',
  description: 'List all appointments within a specified date range. Useful for viewing schedule and checking for conflicts.',
  inputSchema: {
    type: 'object',
    properties: {
      date_range: {
        type: 'object',
        description: 'Date range to search for appointments',
        properties: {
          start: {
            type: 'string',
            description: 'Start date (YYYY-MM-DD format or natural language)',
          },
          end: {
            type: 'string',
            description: 'End date (YYYY-MM-DD format or natural language)',
          },
        },
        required: ['start', 'end'],
      },
    },
    required: ['date_range'],
  },
};

export async function executeListAppointments(
  args: any,
  calendarService: GoogleCalendarService
): Promise<string> {
  try {
    // Validate input
    const validatedArgs = ListAppointmentsSchema.parse(args);

    // Parse dates (handle natural language)
    let startDate: Date, endDate: Date;
    try {
      startDate = DateHelpers.parseNaturalLanguage(validatedArgs.date_range.start);
    } catch {
      startDate = DateHelpers.parseDateTime(validatedArgs.date_range.start);
    }

    try {
      endDate = DateHelpers.parseNaturalLanguage(validatedArgs.date_range.end);
    } catch {
      endDate = DateHelpers.parseDateTime(validatedArgs.date_range.end);
    }

    // Ensure we get the full end date (end of day)
    endDate.setHours(23, 59, 59, 999);

    const dateRange = {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    };

    // Get appointments
    const appointments = await calendarService.listAppointments(dateRange);

    // Sort appointments by date
    appointments.sort((a, b) =>
      new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
    );

    const now = new Date();

    // Group appointments by date and add helpful context
    const groupedAppointments = groupAppointmentsByDate(appointments, now);
    const summary = generateSummary(appointments, startDate, endDate, now);

    const response = {
      success: true,
      dateRange: {
        start: DateHelpers.formatForDisplay(startDate),
        end: DateHelpers.formatForDisplay(endDate),
        totalDays: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
      },
      summary,
      appointmentsByDate: groupedAppointments,
      totalAppointments: appointments.length,
      message: appointments.length > 0
        ? `Found ${appointments.length} appointment${appointments.length === 1 ? '' : 's'} between ${DateHelpers.formatForDisplay(startDate)} and ${DateHelpers.formatForDisplay(endDate)}`
        : `No appointments found between ${DateHelpers.formatForDisplay(startDate)} and ${DateHelpers.formatForDisplay(endDate)}`,
    };

    return JSON.stringify(response, null, 2);

  } catch (error: any) {
    if (error.name === 'ZodError') {
      const issues = error.issues.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`);
      return JSON.stringify({
        success: false,
        error: 'Invalid date range provided',
        details: issues,
        suggestedAction: 'Please provide valid start and end dates',
      });
    }

    const mcpError = error as MCPError;
    return JSON.stringify({
      success: false,
      error: mcpError.message || 'Failed to list appointments',
      code: mcpError.code || 'LIST_ERROR',
      suggestedAction: 'Please verify the date range and try again',
    });
  }
}

function groupAppointmentsByDate(appointments: AppointmentDetails[], now: Date) {
  const grouped: Record<string, any> = {};

  appointments.forEach(appointment => {
    const appointmentDate = new Date(appointment.datetime);
    const dateKey = appointmentDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const dayName = appointmentDate.toLocaleDateString('en-US', { weekday: 'long' });
    const isPast = appointmentDate < now;
    const isToday = appointmentDate.toDateString() === now.toDateString();

    if (!grouped[dateKey]) {
      grouped[dateKey] = {
        date: DateHelpers.formatForDisplay(appointmentDate).split(' at ')[0], // Just the date part
        dayOfWeek: dayName,
        isPast,
        isToday,
        appointments: [],
        totalDuration: 0,
        appointmentCount: 0,
      };
    }

    grouped[dateKey].appointments.push({
      id: appointment.id,
      time: appointmentDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      patient: appointment.patient.name,
      phone: appointment.patient.phone,
      email: appointment.patient.email,
      type: appointment.appointmentType,
      duration: appointment.duration,
      status: appointment.status,
      notes: appointment.notes || 'No notes',
      endTime: new Date(appointmentDate.getTime() + appointment.duration * 60000)
        .toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
    });

    grouped[dateKey].totalDuration += appointment.duration;
    grouped[dateKey].appointmentCount += 1;
  });

  // Convert to array and sort by date
  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, data]) => data);
}

function generateSummary(appointments: AppointmentDetails[], startDate: Date, endDate: Date, now: Date) {
  const totalAppointments = appointments.length;
  const pastAppointments = appointments.filter(apt => new Date(apt.datetime) < now).length;
  const upcomingAppointments = totalAppointments - pastAppointments;
  const todaysAppointments = appointments.filter(apt =>
    new Date(apt.datetime).toDateString() === now.toDateString()
  ).length;

  // Calculate total duration
  const totalDuration = appointments.reduce((sum, apt) => sum + apt.duration, 0);
  const totalHours = Math.round(totalDuration / 60 * 10) / 10;

  // Group by appointment type
  const appointmentTypes = appointments.reduce((acc, apt) => {
    acc[apt.appointmentType] = (acc[apt.appointmentType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Find busiest day
  const dayGroups = appointments.reduce((acc, apt) => {
    const dateKey = new Date(apt.datetime).toISOString().split('T')[0];
    acc[dateKey] = (acc[dateKey] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const busiestDay = Object.entries(dayGroups)
    .sort(([,a], [,b]) => b - a)[0];

  return {
    total: totalAppointments,
    past: pastAppointments,
    upcoming: upcomingAppointments,
    today: todaysAppointments,
    totalDurationHours: totalHours,
    appointmentTypes,
    busiestDay: busiestDay ? {
      date: DateHelpers.formatForDisplay(new Date(busiestDay[0])).split(' at ')[0],
      count: busiestDay[1],
    } : null,
  };
}