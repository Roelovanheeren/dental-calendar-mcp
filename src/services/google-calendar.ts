import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { calendar_v3 } from 'googleapis';
import {
  CalendarEvent,
  AppointmentDetails,
  PatientInfo,
  AppointmentType,
  DateRange,
  MCPError
} from '../types.js';
import { formatISO, parseISO, addMinutes } from 'date-fns';

export class GoogleCalendarService {
  private calendar: calendar_v3.Calendar;
  private oauth2Client: OAuth2Client;
  private calendarId: string;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Set credentials if available
    if (process.env.GOOGLE_ACCESS_TOKEN && process.env.GOOGLE_REFRESH_TOKEN) {
      this.oauth2Client.setCredentials({
        access_token: process.env.GOOGLE_ACCESS_TOKEN,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      });
    }

    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    this.calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  }

  /**
   * Ensure credentials are valid, refresh if needed
   */
  private async ensureValidCredentials(): Promise<void> {
    try {
      // Check if credentials are expired
      const credentials = this.oauth2Client.credentials;
      
      if (!credentials.access_token) {
        throw new Error('No access token available');
      }

      // If we have a refresh token, try to refresh
      if (credentials.refresh_token) {
        try {
          await this.oauth2Client.refreshAccessToken();
          console.log('Access token refreshed successfully');
        } catch (refreshError) {
          console.error('Failed to refresh access token:', refreshError);
          throw new Error('Failed to refresh access token');
        }
      }
    } catch (error) {
      console.error('Credential validation failed:', error);
      throw new Error('Google Calendar authentication failed. Please check your OAuth tokens.');
    }
  }

  /**
   * Get available time slots for a given date
   */
  async getAvailableSlots(
    date: string,
    duration: number = 30,
    timeRange?: { start: string; end: string }
  ): Promise<{ start: string; end: string }[]> {
    try {
      // Ensure credentials are valid before making API calls
      await this.ensureValidCredentials();
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const response = await this.calendar.events.list({
        calendarId: this.calendarId,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      const availableSlots = this.calculateAvailableSlots(
        date,
        events,
        duration,
        timeRange
      );

      return availableSlots;
    } catch (error) {
      throw this.handleError('Failed to get available slots', error);
    }
  }

  /**
   * Create a new appointment
   */
  async createAppointment(
    patient: PatientInfo,
    datetime: string,
    duration: number,
    appointmentType: AppointmentType,
    notes?: string
  ): Promise<AppointmentDetails> {
    try {
      // Ensure credentials are valid before making API calls
      await this.ensureValidCredentials();
      const startTime = parseISO(datetime);
      const endTime = addMinutes(startTime, duration);

      const event: calendar_v3.Schema$Event = {
        summary: `${appointmentType.charAt(0).toUpperCase() + appointmentType.slice(1)} - ${patient.name}`,
        description: this.buildEventDescription(patient, appointmentType, notes),
        start: {
          dateTime: formatISO(startTime),
          timeZone: process.env.CLINIC_TIMEZONE || 'America/New_York',
        },
        end: {
          dateTime: formatISO(endTime),
          timeZone: process.env.CLINIC_TIMEZONE || 'America/New_York',
        },
        attendees: [
          {
            email: patient.email,
            displayName: patient.name,
            responseStatus: 'needsAction',
          },
        ],
        extendedProperties: {
          private: {
            patientName: patient.name,
            patientPhone: patient.phone,
            patientEmail: patient.email,
            appointmentType,
            duration: duration.toString(),
            notes: notes || '',
          },
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 24 hours
            { method: 'popup', minutes: 60 }, // 1 hour
          ],
        },
      };

      const response = await this.calendar.events.insert({
        calendarId: this.calendarId,
        requestBody: event,
        sendUpdates: 'all',
      });

      if (!response.data || !response.data.id) {
        throw new Error('Failed to create calendar event');
      }

      return this.convertToAppointmentDetails(response.data);
    } catch (error) {
      throw this.handleError('Failed to create appointment', error);
    }
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(appointmentId: string): Promise<boolean> {
    try {
      await this.calendar.events.delete({
        calendarId: this.calendarId,
        eventId: appointmentId,
        sendUpdates: 'all',
      });

      return true;
    } catch (error) {
      throw this.handleError('Failed to cancel appointment', error);
    }
  }

  /**
   * Reschedule an appointment
   */
  async rescheduleAppointment(
    appointmentId: string,
    newDatetime: string
  ): Promise<AppointmentDetails> {
    try {
      // First get the existing event
      const existingEvent = await this.calendar.events.get({
        calendarId: this.calendarId,
        eventId: appointmentId,
      });

      if (!existingEvent.data) {
        throw new Error('Appointment not found');
      }

      // Calculate duration from existing event
      const existingStart = parseISO(existingEvent.data.start?.dateTime || '');
      const existingEnd = parseISO(existingEvent.data.end?.dateTime || '');
      const duration = (existingEnd.getTime() - existingStart.getTime()) / (1000 * 60);

      const newStartTime = parseISO(newDatetime);
      const newEndTime = addMinutes(newStartTime, duration);

      // Update the event
      const updatedEvent = {
        ...existingEvent.data,
        start: {
          dateTime: formatISO(newStartTime),
          timeZone: process.env.CLINIC_TIMEZONE || 'America/New_York',
        },
        end: {
          dateTime: formatISO(newEndTime),
          timeZone: process.env.CLINIC_TIMEZONE || 'America/New_York',
        },
      };

      const response = await this.calendar.events.update({
        calendarId: this.calendarId,
        eventId: appointmentId,
        requestBody: updatedEvent,
        sendUpdates: 'all',
      });

      if (!response.data) {
        throw new Error('Failed to update calendar event');
      }

      return this.convertToAppointmentDetails(response.data);
    } catch (error) {
      throw this.handleError('Failed to reschedule appointment', error);
    }
  }

  /**
   * Get appointment details
   */
  async getAppointmentDetails(appointmentId: string): Promise<AppointmentDetails> {
    try {
      const response = await this.calendar.events.get({
        calendarId: this.calendarId,
        eventId: appointmentId,
      });

      if (!response.data) {
        throw new Error('Appointment not found');
      }

      return this.convertToAppointmentDetails(response.data);
    } catch (error) {
      throw this.handleError('Failed to get appointment details', error);
    }
  }

  /**
   * List appointments in date range
   */
  async listAppointments(dateRange: DateRange): Promise<AppointmentDetails[]> {
    try {
      // Ensure credentials are valid before making API calls
      await this.ensureValidCredentials();
      const response = await this.calendar.events.list({
        calendarId: this.calendarId,
        timeMin: new Date(dateRange.start).toISOString(),
        timeMax: new Date(dateRange.end).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      return events
        .filter(event => this.isDentalAppointment(event))
        .map(event => this.convertToAppointmentDetails(event));
    } catch (error) {
      throw this.handleError('Failed to list appointments', error);
    }
  }

  /**
   * Find appointment by patient phone
   */
  async findAppointmentByPhone(phone: string): Promise<AppointmentDetails | null> {
    try {
      const response = await this.calendar.events.list({
        calendarId: this.calendarId,
        timeMin: new Date().toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      const matchingEvent = events.find(event =>
        event.extendedProperties?.private?.patientPhone === phone
      );

      return matchingEvent ? this.convertToAppointmentDetails(matchingEvent) : null;
    } catch (error) {
      throw this.handleError('Failed to find appointment by phone', error);
    }
  }

  private calculateAvailableSlots(
    date: string,
    events: calendar_v3.Schema$Event[],
    duration: number,
    timeRange?: { start: string; end: string }
  ): { start: string; end: string }[] {
    const dateObj = new Date(date);
    const businessStart = timeRange?.start || process.env.BUSINESS_HOURS_START || '09:00';
    const businessEnd = timeRange?.end || process.env.BUSINESS_HOURS_END || '17:00';

    const [startHour, startMinute] = businessStart.split(':').map(Number);
    const [endHour, endMinute] = businessEnd.split(':').map(Number);

    const dayStart = new Date(dateObj);
    dayStart.setHours(startHour, startMinute, 0, 0);

    const dayEnd = new Date(dateObj);
    dayEnd.setHours(endHour, endMinute, 0, 0);

    // Create busy periods from existing events
    const busyPeriods = events
      .filter(event => event.start?.dateTime && event.end?.dateTime)
      .map(event => ({
        start: parseISO(event.start!.dateTime!),
        end: parseISO(event.end!.dateTime!),
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    // Calculate available slots
    const availableSlots: { start: string; end: string }[] = [];
    let currentTime = dayStart;

    for (const busyPeriod of busyPeriods) {
      while (currentTime.getTime() + duration * 60 * 1000 <= busyPeriod.start.getTime()) {
        const slotEnd = addMinutes(currentTime, duration);
        if (slotEnd <= dayEnd) {
          availableSlots.push({
            start: formatISO(currentTime),
            end: formatISO(slotEnd),
          });
        }
        currentTime = addMinutes(currentTime, 15); // 15-minute increments
      }
      currentTime = new Date(Math.max(currentTime.getTime(), busyPeriod.end.getTime()));
    }

    // Add remaining slots after last busy period
    while (currentTime.getTime() + duration * 60 * 1000 <= dayEnd.getTime()) {
      const slotEnd = addMinutes(currentTime, duration);
      availableSlots.push({
        start: formatISO(currentTime),
        end: formatISO(slotEnd),
      });
      currentTime = addMinutes(currentTime, 15);
    }

    return availableSlots;
  }

  private buildEventDescription(
    patient: PatientInfo,
    appointmentType: AppointmentType,
    notes?: string
  ): string {
    return [
      `Patient: ${patient.name}`,
      `Phone: ${patient.phone}`,
      `Email: ${patient.email}`,
      `Type: ${appointmentType}`,
      notes ? `Notes: ${notes}` : '',
    ].filter(Boolean).join('\n');
  }

  private convertToAppointmentDetails(event: calendar_v3.Schema$Event): AppointmentDetails {
    const props = event.extendedProperties?.private || {};

    return {
      id: event.id!,
      patient: {
        name: props.patientName || 'Unknown',
        phone: props.patientPhone || '',
        email: props.patientEmail || '',
        notes: props.notes || '',
      },
      datetime: event.start?.dateTime!,
      duration: parseInt(props.duration || '30'),
      appointmentType: (props.appointmentType as AppointmentType) || 'checkup',
      status: 'scheduled',
      notes: props.notes,
      createdAt: event.created!,
      updatedAt: event.updated!,
    };
  }

  private isDentalAppointment(event: calendar_v3.Schema$Event): boolean {
    return !!(event.extendedProperties?.private?.patientName);
  }

  private handleError(message: string, error: any): MCPError {
    console.error(`${message}:`, error);
    return {
      code: 'CALENDAR_ERROR',
      message,
      details: error.message || error,
    };
  }
}