#!/usr/bin/env python3
"""
Dental Calendar MCP Server

A Model Context Protocol (MCP) server for dental appointment management.
Provides tools for booking, checking availability, and managing appointments.
"""

import os
import json
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from mcp.types import TextContent

# Load environment variables
load_dotenv()

# Initialize FastMCP server
mcp = FastMCP("DentalCalendar")

# Load dental settings
def load_dental_settings():
    """Load dental clinic settings from config file."""
    try:
        with open('config/dental-settings.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {
            "clinicName": "Tandarts Praktijk Van Heeren",
            "timezone": "Europe/Amsterdam",
            "businessHours": {
                "monday": {"start": "09:00", "end": "17:00", "breakStart": "12:00", "breakEnd": "13:00"},
                "tuesday": {"start": "09:00", "end": "17:00", "breakStart": "12:00", "breakEnd": "13:00"},
                "wednesday": {"start": "09:00", "end": "17:00", "breakStart": "12:00", "breakEnd": "13:00"},
                "thursday": {"start": "09:00", "end": "17:00", "breakStart": "12:00", "breakEnd": "13:00"},
                "friday": {"start": "09:00", "end": "17:00", "breakStart": "12:00", "breakEnd": "13:00"},
                "saturday": {"start": "09:00", "end": "14:00", "breakStart": None, "breakEnd": None},
                "sunday": {"start": None, "end": None, "breakStart": None, "breakEnd": None}
            },
            "appointmentTypes": {
                "cleaning": {"duration": 45, "buffer": 15, "description": "Regular dental cleaning"},
                "checkup": {"duration": 30, "buffer": 15, "description": "Routine examination"},
                "consultation": {"duration": 45, "buffer": 15, "description": "New patient consultation"},
                "filling": {"duration": 60, "buffer": 15, "description": "Dental filling procedure"},
                "root_canal": {"duration": 120, "buffer": 30, "description": "Root canal treatment"},
                "crown": {"duration": 90, "buffer": 30, "description": "Crown procedure"},
                "extraction": {"duration": 45, "buffer": 15, "description": "Tooth extraction"},
                "emergency": {"duration": 30, "buffer": 0, "description": "Emergency dental care"}
            }
        }

dental_settings = load_dental_settings()

# Mock appointment storage (in real implementation, this would be Google Calendar)
appointments = {}

@mcp.tool()
def check_availability(
    date: str,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    appointment_type: str = "checkup"
) -> List[TextContent]:
    """
    Check available appointment slots for a specific date and time range.
    
    Args:
        date: Date to check availability (YYYY-MM-DD format)
        start_time: Start time in HH:MM format (24-hour), optional
        end_time: End time in HH:MM format (24-hour), optional  
        appointment_type: Type of appointment (cleaning, checkup, consultation, etc.)
    
    Returns:
        List of available time slots
    """
    try:
        # Parse date
        target_date = datetime.strptime(date, "%Y-%m-%d")
        day_name = target_date.strftime("%A").lower()
        
        # Get business hours for the day
        business_hours = dental_settings["businessHours"].get(day_name)
        if not business_hours or not business_hours["start"]:
            return [TextContent(type="text", text=f"Clinic is closed on {day_name}")]
        
        # Get appointment type details
        appointment_details = dental_settings["appointmentTypes"].get(appointment_type, {})
        duration = appointment_details.get("duration", 30)
        
        # Generate available slots
        available_slots = []
        start_hour = int(business_hours["start"].split(":")[0])
        end_hour = int(business_hours["end"].split(":")[0])
        
        current_time = target_date.replace(hour=start_hour, minute=0)
        end_time = target_date.replace(hour=end_hour, minute=0)
        
        while current_time < end_time:
            # Check if it's during break time
            if business_hours.get("breakStart") and business_hours.get("breakEnd"):
                break_start = current_time.replace(
                    hour=int(business_hours["breakStart"].split(":")[0]),
                    minute=int(business_hours["breakStart"].split(":")[1])
                )
                break_end = current_time.replace(
                    hour=int(business_hours["breakEnd"].split(":")[0]),
                    minute=int(business_hours["breakEnd"].split(":")[1])
                )
                
                if break_start <= current_time < break_end:
                    current_time = break_end
                    continue
            
            # Check if slot is available (not booked)
            slot_key = current_time.strftime("%Y-%m-%d %H:%M")
            if slot_key not in appointments:
                available_slots.append(current_time.strftime("%H:%M"))
            
            # Move to next slot
            current_time += timedelta(minutes=duration)
        
        if available_slots:
            result = f"Available slots on {date} for {appointment_type}:\n"
            result += "\n".join([f"- {slot}" for slot in available_slots[:10]])  # Show first 10 slots
            if len(available_slots) > 10:
                result += f"\n... and {len(available_slots) - 10} more slots"
        else:
            result = f"No available slots on {date} for {appointment_type}"
        
        return [TextContent(type="text", text=result)]
        
    except ValueError as e:
        return [TextContent(type="text", text=f"Invalid date format: {e}")]
    except Exception as e:
        return [TextContent(type="text", text=f"Error checking availability: {e}")]

@mcp.tool()
def book_appointment(
    patient_name: str,
    patient_email: str,
    date: str,
    start_time: str,
    appointment_type: str = "checkup",
    notes: Optional[str] = None
) -> List[TextContent]:
    """
    Book a new dental appointment.
    
    Args:
        patient_name: Full name of the patient
        patient_email: Email address of the patient
        date: Date of the appointment (YYYY-MM-DD format)
        start_time: Start time in HH:MM format (24-hour)
        appointment_type: Type of appointment (cleaning, checkup, consultation, etc.)
        notes: Additional notes for the appointment
    
    Returns:
        Confirmation of the booked appointment
    """
    try:
        # Parse date and time
        appointment_datetime = datetime.strptime(f"{date} {start_time}", "%Y-%m-%d %H:%M")
        slot_key = appointment_datetime.strftime("%Y-%m-%d %H:%M")
        
        # Check if slot is already booked
        if slot_key in appointments:
            return [TextContent(type="text", text=f"Sorry, the slot {date} at {start_time} is already booked.")]
        
        # Get appointment details
        appointment_details = dental_settings["appointmentTypes"].get(appointment_type, {})
        duration = appointment_details.get("duration", 30)
        
        # Create appointment
        appointment = {
            "id": f"APT_{len(appointments) + 1:04d}",
            "patient_name": patient_name,
            "patient_email": patient_email,
            "date": date,
            "start_time": start_time,
            "appointment_type": appointment_type,
            "duration": duration,
            "notes": notes or "",
            "status": "confirmed"
        }
        
        appointments[slot_key] = appointment
        
        result = f"✅ Appointment booked successfully!\n\n"
        result += f"Appointment ID: {appointment['id']}\n"
        result += f"Patient: {patient_name}\n"
        result += f"Email: {patient_email}\n"
        result += f"Date: {date}\n"
        result += f"Time: {start_time}\n"
        result += f"Type: {appointment_type}\n"
        result += f"Duration: {duration} minutes\n"
        if notes:
            result += f"Notes: {notes}\n"
        
        return [TextContent(type="text", text=result)]
        
    except ValueError as e:
        return [TextContent(type="text", text=f"Invalid date/time format: {e}")]
    except Exception as e:
        return [TextContent(type="text", text=f"Error booking appointment: {e}")]

@mcp.tool()
def list_appointments(
    start_date: str,
    end_date: Optional[str] = None
) -> List[TextContent]:
    """
    List upcoming appointments for a date range.
    
    Args:
        start_date: Start date for the range (YYYY-MM-DD format)
        end_date: End date for the range (YYYY-MM-DD format), optional
    
    Returns:
        List of appointments in the date range
    """
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d") if end_date else start + timedelta(days=7)
        
        matching_appointments = []
        for slot_key, appointment in appointments.items():
            appointment_date = datetime.strptime(appointment["date"], "%Y-%m-%d")
            if start <= appointment_date <= end:
                matching_appointments.append(appointment)
        
        if not matching_appointments:
            return [TextContent(type="text", text=f"No appointments found between {start_date} and {end_date or start_date}")]
        
        result = f"Appointments between {start_date} and {end_date or start_date}:\n\n"
        for apt in sorted(matching_appointments, key=lambda x: f"{x['date']} {x['start_time']}"):
            result += f"• {apt['id']}: {apt['patient_name']} - {apt['date']} at {apt['start_time']} ({apt['appointment_type']})\n"
        
        return [TextContent(type="text", text=result)]
        
    except ValueError as e:
        return [TextContent(type="text", text=f"Invalid date format: {e}")]
    except Exception as e:
        return [TextContent(type="text", text=f"Error listing appointments: {e}")]

@mcp.tool()
def get_appointment(appointment_id: str) -> List[TextContent]:
    """
    Get details of a specific appointment.
    
    Args:
        appointment_id: ID of the appointment to retrieve
    
    Returns:
        Details of the appointment
    """
    try:
        for appointment in appointments.values():
            if appointment["id"] == appointment_id:
                result = f"Appointment Details:\n\n"
                result += f"ID: {appointment['id']}\n"
                result += f"Patient: {appointment['patient_name']}\n"
                result += f"Email: {appointment['patient_email']}\n"
                result += f"Date: {appointment['date']}\n"
                result += f"Time: {appointment['start_time']}\n"
                result += f"Type: {appointment['appointment_type']}\n"
                result += f"Duration: {appointment['duration']} minutes\n"
                result += f"Status: {appointment['status']}\n"
                if appointment['notes']:
                    result += f"Notes: {appointment['notes']}\n"
                return [TextContent(type="text", text=result)]
        
        return [TextContent(type="text", text=f"Appointment {appointment_id} not found")]
        
    except Exception as e:
        return [TextContent(type="text", text=f"Error retrieving appointment: {e}")]

@mcp.tool()
def reschedule_appointment(
    appointment_id: str,
    new_date: str,
    new_start_time: str
) -> List[TextContent]:
    """
    Reschedule an existing appointment to a new time.
    
    Args:
        appointment_id: ID of the appointment to reschedule
        new_date: New date for the appointment (YYYY-MM-DD format)
        new_start_time: New start time in HH:MM format (24-hour)
    
    Returns:
        Confirmation of the rescheduled appointment
    """
    try:
        # Find the appointment
        old_slot_key = None
        appointment = None
        for slot_key, apt in appointments.items():
            if apt["id"] == appointment_id:
                old_slot_key = slot_key
                appointment = apt
                break
        
        if not appointment:
            return [TextContent(type="text", text=f"Appointment {appointment_id} not found")]
        
        # Check if new slot is available
        new_slot_key = f"{new_date} {new_start_time}"
        if new_slot_key in appointments:
            return [TextContent(type="text", text=f"Sorry, the slot {new_date} at {new_start_time} is already booked.")]
        
        # Update appointment
        appointment["date"] = new_date
        appointment["start_time"] = new_start_time
        
        # Move to new slot
        appointments[new_slot_key] = appointment
        del appointments[old_slot_key]
        
        result = f"✅ Appointment rescheduled successfully!\n\n"
        result += f"Appointment ID: {appointment_id}\n"
        result += f"New Date: {new_date}\n"
        result += f"New Time: {new_start_time}\n"
        result += f"Patient: {appointment['patient_name']}\n"
        
        return [TextContent(type="text", text=result)]
        
    except ValueError as e:
        return [TextContent(type="text", text=f"Invalid date/time format: {e}")]
    except Exception as e:
        return [TextContent(type="text", text=f"Error rescheduling appointment: {e}")]

@mcp.tool()
def cancel_appointment(
    appointment_id: str,
    reason: Optional[str] = None
) -> List[TextContent]:
    """
    Cancel an existing appointment.
    
    Args:
        appointment_id: ID of the appointment to cancel
        reason: Reason for cancellation
    
    Returns:
        Confirmation of the cancelled appointment
    """
    try:
        # Find and remove the appointment
        slot_key_to_remove = None
        appointment = None
        for slot_key, apt in appointments.items():
            if apt["id"] == appointment_id:
                slot_key_to_remove = slot_key
                appointment = apt
                break
        
        if not appointment:
            return [TextContent(type="text", text=f"Appointment {appointment_id} not found")]
        
        # Remove appointment
        del appointments[slot_key_to_remove]
        
        result = f"✅ Appointment cancelled successfully!\n\n"
        result += f"Appointment ID: {appointment_id}\n"
        result += f"Patient: {appointment['patient_name']}\n"
        result += f"Date: {appointment['date']}\n"
        result += f"Time: {appointment['start_time']}\n"
        if reason:
            result += f"Reason: {reason}\n"
        
        return [TextContent(type="text", text=result)]
        
    except Exception as e:
        return [TextContent(type="text", text=f"Error cancelling appointment: {e}")]

if __name__ == "__main__":
    print("Starting Dental Calendar MCP Server...")
    print("Available tools: check_availability, book_appointment, list_appointments, get_appointment, reschedule_appointment, cancel_appointment")
    print("Server starting on stdio...")
    # Run the MCP server
    mcp.run()
