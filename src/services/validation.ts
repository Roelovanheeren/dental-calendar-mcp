import { z } from 'zod';
import { AppointmentType } from '../types.js';
import { DateHelpers } from '../utils/date-helpers.js';

// Base schemas
export const PatientInfoSchema = z.object({
  name: z.string().min(1, 'Patient name is required').max(100),
  phone: z.string()
    .regex(/^\+?[\d\s\-\(\)]{10,}$/, 'Invalid phone number format')
    .transform(val => val.replace(/\D/g, '')), // Remove non-digits
  email: z.string().email('Invalid email format'),
  notes: z.string().optional(),
});

export const AppointmentTypeSchema = z.enum([
  'cleaning',
  'checkup',
  'consultation',
  'filling',
  'root_canal',
  'crown',
  'extraction',
  'emergency'
] as const);

export const DateTimeSchema = z.string()
  .refine((val) => {
    try {
      const date = DateHelpers.parseDateTime(val);
      return DateHelpers.canBookAppointment(date);
    } catch {
      return false;
    }
  }, 'Invalid date or too close to current time')
  .transform(val => DateHelpers.parseDateTime(val).toISOString());

export const DurationSchema = z.number()
  .min(15, 'Minimum appointment duration is 15 minutes')
  .max(240, 'Maximum appointment duration is 4 hours')
  .refine(val => val % 15 === 0, 'Duration must be in 15-minute increments');

// Tool input schemas
export const CheckAvailabilitySchema = z.object({
  date: z.string()
    .refine((val) => {
      try {
        const date = DateHelpers.parseDateTime(val);
        return DateHelpers.isWithinMaxAdvance(date);
      } catch {
        return false;
      }
    }, 'Invalid date or too far in the future'),
  duration: DurationSchema.default(30),
  timeRange: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
  }).optional(),
});

export const BookAppointmentSchema = z.object({
  patient_name: z.string().min(1, 'Patient name is required').max(100),
  phone: z.string()
    .regex(/^\+?[\d\s\-\(\)]{10,}$/, 'Invalid phone number format'),
  email: z.string().email('Invalid email format'),
  datetime: DateTimeSchema,
  duration: DurationSchema.default(30),
  appointment_type: AppointmentTypeSchema.default('checkup'),
  notes: z.string().optional(),
});

export const CancelAppointmentSchema = z.object({
  appointment_id: z.string().min(1, 'Appointment ID is required'),
});

export const RescheduleAppointmentSchema = z.object({
  appointment_id: z.string().min(1, 'Appointment ID is required'),
  new_datetime: DateTimeSchema,
});

export const GetAppointmentSchema = z.object({
  appointment_id: z.string().min(1, 'Appointment ID is required'),
});

export const ListAppointmentsSchema = z.object({
  date_range: z.object({
    start: z.string().refine((val) => {
      try {
        DateHelpers.parseDateTime(val);
        return true;
      } catch {
        return false;
      }
    }, 'Invalid start date'),
    end: z.string().refine((val) => {
      try {
        DateHelpers.parseDateTime(val);
        return true;
      } catch {
        return false;
      }
    }, 'Invalid end date'),
  }).refine((range) => {
    try {
      const { start, end } = DateHelpers.validateDateRange(range.start, range.end);
      return start <= end;
    } catch {
      return false;
    }
  }, 'Start date must be before or equal to end date'),
});

export const FindByPhoneSchema = z.object({
  phone: z.string()
    .regex(/^\+?[\d\s\-\(\)]{10,}$/, 'Invalid phone number format'),
});

// Validation helper functions
export class ValidationHelpers {
  /**
   * Validate business hours
   */
  static validateBusinessHours(datetime: Date): boolean {
    return DateHelpers.isWithinBusinessHours(datetime);
  }

  /**
   * Validate appointment type duration
   */
  static validateAppointmentDuration(type: AppointmentType, duration: number): boolean {
    const typeDurations: Record<AppointmentType, { min: number; max: number }> = {
      cleaning: { min: 30, max: 60 },
      checkup: { min: 15, max: 30 },
      consultation: { min: 30, max: 60 },
      filling: { min: 30, max: 120 },
      root_canal: { min: 60, max: 180 },
      crown: { min: 60, max: 120 },
      extraction: { min: 30, max: 90 },
      emergency: { min: 15, max: 240 },
    };

    const { min, max } = typeDurations[type];
    return duration >= min && duration <= max;
  }

  /**
   * Validate phone number format and normalize it
   */
  static normalizePhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');

    // Add country code if missing
    if (digits.length === 10) {
      return `+1${digits}`;
    }

    if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }

    if (digits.length >= 10) {
      return `+${digits}`;
    }

    throw new Error('Invalid phone number format');
  }

  /**
   * Validate email format
   */
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Sanitize patient name
   */
  static sanitizeName(name: string): string {
    return name.trim()
      .replace(/[^\w\s\-'\.]/g, '') // Remove special characters except dash, apostrophe, period
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Validate appointment conflicts
   */
  static hasTimeConflict(
    newStart: Date,
    newEnd: Date,
    existingStart: Date,
    existingEnd: Date,
    bufferMinutes: number = 5
  ): boolean {
    const buffer = bufferMinutes * 60 * 1000; // Convert to milliseconds

    const newStartTime = newStart.getTime() - buffer;
    const newEndTime = newEnd.getTime() + buffer;
    const existingStartTime = existingStart.getTime();
    const existingEndTime = existingEnd.getTime();

    return !(newEndTime <= existingStartTime || newStartTime >= existingEndTime);
  }
}

// Error messages
export const ErrorMessages = {
  INVALID_DATE: 'Please provide a valid date in YYYY-MM-DD format or use natural language like "tomorrow" or "next Monday"',
  INVALID_TIME: 'Please provide a valid time in HH:MM format (e.g., "14:30" or "2:30 PM")',
  OUTSIDE_BUSINESS_HOURS: 'Appointments can only be scheduled during business hours (9 AM - 5 PM, Monday - Friday)',
  TOO_SOON: 'Appointments must be scheduled at least 2 hours in advance',
  TOO_FAR: 'Appointments cannot be scheduled more than 90 days in advance',
  INVALID_DURATION: 'Duration must be between 15 and 240 minutes in 15-minute increments',
  INVALID_PHONE: 'Please provide a valid phone number with at least 10 digits',
  INVALID_EMAIL: 'Please provide a valid email address',
  REQUIRED_FIELD: 'This field is required',
  APPOINTMENT_NOT_FOUND: 'Appointment not found with the provided ID',
  SCHEDULING_CONFLICT: 'The requested time slot conflicts with an existing appointment',
};