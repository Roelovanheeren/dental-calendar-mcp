export interface PatientInfo {
  name: string;
  phone: string;
  email: string;
  notes?: string;
}

export interface AppointmentRequest {
  patient: PatientInfo;
  datetime: string;
  duration: number; // minutes
  appointmentType: AppointmentType;
  notes?: string;
}

export interface AppointmentDetails {
  id: string;
  patient: PatientInfo;
  datetime: string;
  duration: number;
  appointmentType: AppointmentType;
  status: AppointmentStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
  duration: number;
}

export interface AvailabilityRequest {
  date: string;
  duration?: number;
  timeRange?: {
    start: string;
    end: string;
  };
}

export interface DateRange {
  start: string;
  end: string;
}

export type AppointmentType =
  | 'cleaning'
  | 'checkup'
  | 'consultation'
  | 'filling'
  | 'root_canal'
  | 'crown'
  | 'extraction'
  | 'emergency';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export interface BusinessHours {
  start: string;
  end: string;
  breakStart?: string;
  breakEnd?: string;
}

export interface DentalSettings {
  clinicName: string;
  timezone: string;
  businessHours: Record<string, BusinessHours>;
  appointmentTypes: Record<AppointmentType, {
    duration: number;
    bufferTime: number;
    description: string;
  }>;
  holidays: string[];
  defaultDuration: number;
  minimumAdvanceBooking: number; // hours
  maximumAdvanceBooking: number; // days
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
  }>;
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

export interface MCPError {
  code: string;
  message: string;
  details?: any;
}