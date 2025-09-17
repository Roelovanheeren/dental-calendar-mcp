import { format, parse, isValid, isAfter, isBefore, addHours, addDays, startOfDay, endOfDay } from 'date-fns';

export class DateHelpers {
  static readonly TIMEZONE = process.env.CLINIC_TIMEZONE || 'America/New_York';

  /**
   * Parse various date/time formats that might come from voice input
   */
  static parseDateTime(input: string): Date {
    const patterns = [
      'yyyy-MM-dd HH:mm',
      'yyyy-MM-dd h:mm a',
      'MM/dd/yyyy HH:mm',
      'MM/dd/yyyy h:mm a',
      'yyyy-MM-dd\'T\'HH:mm:ss',
      'yyyy-MM-dd\'T\'HH:mm:ss.SSSxxx',
    ];

    // Try ISO format first
    const isoDate = new Date(input);
    if (isValid(isoDate)) {
      return isoDate;
    }

    // Try common patterns
    for (const pattern of patterns) {
      try {
        const parsed = parse(input, pattern, new Date());
        if (isValid(parsed)) {
          return parsed;
        }
      } catch {
        continue;
      }
    }

    throw new Error(`Unable to parse date: ${input}`);
  }

  /**
   * Format date for display
   */
  static formatForDisplay(date: Date): string {
    return format(date, 'EEEE, MMMM do, yyyy \'at\' h:mm a');
  }

  /**
   * Format date for API (ISO string)
   */
  static formatForAPI(date: Date): string {
    return date.toISOString();
  }

  /**
   * Check if date is within business hours
   */
  static isWithinBusinessHours(
    date: Date,
    businessStart: string = '09:00',
    businessEnd: string = '17:00'
  ): boolean {
    const dayOfWeek = date.getDay();

    // Check if it's a weekend (assuming Monday-Friday business days)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }

    const [startHour, startMinute] = businessStart.split(':').map(Number);
    const [endHour, endMinute] = businessEnd.split(':').map(Number);

    const hour = date.getHours();
    const minute = date.getMinutes();
    const totalMinutes = hour * 60 + minute;
    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;

    return totalMinutes >= startTotalMinutes && totalMinutes < endTotalMinutes;
  }

  /**
   * Check if appointment can be booked (minimum advance notice)
   */
  static canBookAppointment(
    appointmentDate: Date,
    minimumAdvanceHours: number = 2
  ): boolean {
    const now = new Date();
    const minimumBookingTime = addHours(now, minimumAdvanceHours);
    return isAfter(appointmentDate, minimumBookingTime);
  }

  /**
   * Check if appointment is not too far in the future
   */
  static isWithinMaxAdvance(
    appointmentDate: Date,
    maxAdvanceDays: number = 90
  ): boolean {
    const now = new Date();
    const maxBookingTime = addDays(now, maxAdvanceDays);
    return isBefore(appointmentDate, maxBookingTime);
  }

  /**
   * Get next business day
   */
  static getNextBusinessDay(fromDate: Date = new Date()): Date {
    let nextDay = addDays(fromDate, 1);

    while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
      nextDay = addDays(nextDay, 1);
    }

    return nextDay;
  }

  /**
   * Convert time string to minutes from midnight
   */
  static timeToMinutes(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Convert minutes from midnight to time string
   */
  static minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * Check if date is a holiday
   */
  static isHoliday(date: Date, holidays: string[] = []): boolean {
    const dateString = format(date, 'yyyy-MM-dd');
    return holidays.includes(dateString);
  }

  /**
   * Parse natural language date expressions
   */
  static parseNaturalLanguage(input: string): Date {
    const lowerInput = input.toLowerCase().trim();
    const now = new Date();

    // Handle "today", "tomorrow", etc.
    if (lowerInput.includes('today')) {
      return now;
    }

    if (lowerInput.includes('tomorrow')) {
      return addDays(now, 1);
    }

    if (lowerInput.includes('next week')) {
      return addDays(now, 7);
    }

    // Handle day names (next Monday, etc.)
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < dayNames.length; i++) {
      if (lowerInput.includes(dayNames[i])) {
        const targetDay = i;
        const currentDay = now.getDay();
        let daysToAdd = targetDay - currentDay;

        if (daysToAdd <= 0) {
          daysToAdd += 7; // Next week
        }

        return addDays(now, daysToAdd);
      }
    }

    // Fallback to regular parsing
    return this.parseDateTime(input);
  }

  /**
   * Validate date range
   */
  static validateDateRange(start: string, end: string): { start: Date; end: Date } {
    const startDate = this.parseDateTime(start);
    const endDate = this.parseDateTime(end);

    if (!isValid(startDate) || !isValid(endDate)) {
      throw new Error('Invalid date format');
    }

    if (isAfter(startDate, endDate)) {
      throw new Error('Start date must be before end date');
    }

    return { start: startDate, end: endDate };
  }

  /**
   * Get business days between two dates
   */
  static getBusinessDaysBetween(start: Date, end: Date): Date[] {
    const businessDays: Date[] = [];
    let current = startOfDay(start);
    const endDay = endOfDay(end);

    while (isBefore(current, endDay) || current.getTime() === endDay.getTime()) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not weekend
        businessDays.push(new Date(current));
      }
      current = addDays(current, 1);
    }

    return businessDays;
  }
}