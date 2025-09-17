#!/usr/bin/env python3
"""
Dental Calendar MCP HTTP Server

An HTTP wrapper for the Dental Calendar MCP Server that ElevenLabs can connect to.
"""

import asyncio
import json
import os
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="Dental Calendar MCP Server", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.get("/health")
async def health_check():
    """Health check endpoint for Railway."""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.post("/mcp")
async def mcp_endpoint(request: Request):
    """Main MCP endpoint that handles JSON-RPC requests."""
    try:
        body = await request.json()
        
        # Handle different MCP methods
        method = body.get("method")
        
        if method == "initialize":
            return {
                "jsonrpc": "2.0",
                "id": body.get("id"),
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "experimental": {},
                        "prompts": {"listChanged": False},
                        "resources": {"subscribe": False, "listChanged": False},
                        "tools": {"listChanged": False}
                    },
                    "serverInfo": {
                        "name": "DentalCalendar",
                        "version": "1.0.0"
                    }
                }
            }
        
        elif method == "tools/list":
            return {
                "jsonrpc": "2.0",
                "id": body.get("id"),
                "result": {
                    "tools": [
                        {
                            "name": "check_availability",
                            "description": "Check available appointment slots for a specific date and time range.",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "date": {"type": "string", "title": "Date"},
                                    "start_time": {"type": "string", "title": "Start Time", "default": None},
                                    "end_time": {"type": "string", "title": "End Time", "default": None},
                                    "appointment_type": {"type": "string", "title": "Appointment Type", "default": "checkup"}
                                },
                                "required": ["date"]
                            }
                        },
                        {
                            "name": "book_appointment",
                            "description": "Book a new dental appointment.",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "patient_name": {"type": "string", "title": "Patient Name"},
                                    "patient_email": {"type": "string", "title": "Patient Email"},
                                    "date": {"type": "string", "title": "Date"},
                                    "start_time": {"type": "string", "title": "Start Time"},
                                    "appointment_type": {"type": "string", "title": "Appointment Type", "default": "checkup"},
                                    "notes": {"type": "string", "title": "Notes", "default": None}
                                },
                                "required": ["patient_name", "patient_email", "date", "start_time"]
                            }
                        },
                        {
                            "name": "list_appointments",
                            "description": "List upcoming appointments for a date range.",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "start_date": {"type": "string", "title": "Start Date"},
                                    "end_date": {"type": "string", "title": "End Date", "default": None}
                                },
                                "required": ["start_date"]
                            }
                        },
                        {
                            "name": "get_appointment",
                            "description": "Get details of a specific appointment.",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "appointment_id": {"type": "string", "title": "Appointment ID"}
                                },
                                "required": ["appointment_id"]
                            }
                        },
                        {
                            "name": "reschedule_appointment",
                            "description": "Reschedule an existing appointment to a new time.",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "appointment_id": {"type": "string", "title": "Appointment ID"},
                                    "new_date": {"type": "string", "title": "New Date"},
                                    "new_start_time": {"type": "string", "title": "New Start Time"}
                                },
                                "required": ["appointment_id", "new_date", "new_start_time"]
                            }
                        },
                        {
                            "name": "cancel_appointment",
                            "description": "Cancel an existing appointment.",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "appointment_id": {"type": "string", "title": "Appointment ID"},
                                    "reason": {"type": "string", "title": "Reason", "default": None}
                                },
                                "required": ["appointment_id"]
                            }
                        }
                    ]
                }
            }
        
        elif method == "tools/call":
            return await handle_tool_call(body)
        
        else:
            return {
                "jsonrpc": "2.0",
                "id": body.get("id"),
                "error": {
                    "code": -32601,
                    "message": f"Method not found: {method}"
                }
            }
    
    except Exception as e:
        return {
            "jsonrpc": "2.0",
            "id": body.get("id") if 'body' in locals() else None,
            "error": {
                "code": -32603,
                "message": f"Internal error: {str(e)}"
            }
        }

async def handle_tool_call(body):
    """Handle tool call requests."""
    params = body.get("params", {})
    tool_name = params.get("name")
    arguments = params.get("arguments", {})
    
    try:
        if tool_name == "check_availability":
            result = await check_availability(
                arguments.get("date"),
                arguments.get("start_time"),
                arguments.get("end_time"),
                arguments.get("appointment_type", "checkup")
            )
        elif tool_name == "book_appointment":
            result = await book_appointment(
                arguments.get("patient_name"),
                arguments.get("patient_email"),
                arguments.get("date"),
                arguments.get("start_time"),
                arguments.get("appointment_type", "checkup"),
                arguments.get("notes")
            )
        elif tool_name == "list_appointments":
            result = await list_appointments(
                arguments.get("start_date"),
                arguments.get("end_date")
            )
        elif tool_name == "get_appointment":
            result = await get_appointment(arguments.get("appointment_id"))
        elif tool_name == "reschedule_appointment":
            result = await reschedule_appointment(
                arguments.get("appointment_id"),
                arguments.get("new_date"),
                arguments.get("new_start_time")
            )
        elif tool_name == "cancel_appointment":
            result = await cancel_appointment(
                arguments.get("appointment_id"),
                arguments.get("reason")
            )
        else:
            return {
                "jsonrpc": "2.0",
                "id": body.get("id"),
                "error": {
                    "code": -32601,
                    "message": f"Tool not found: {tool_name}"
                }
            }
        
        return {
            "jsonrpc": "2.0",
            "id": body.get("id"),
            "result": {
                "content": [
                    {"type": "text", "text": result}
                ]
            }
        }
    
    except Exception as e:
        return {
            "jsonrpc": "2.0",
            "id": body.get("id"),
            "error": {
                "code": -32603,
                "message": f"Tool execution error: {str(e)}"
            }
        }

# Tool implementations (same as in the MCP server)
async def check_availability(date: str, start_time: Optional[str] = None, end_time: Optional[str] = None, appointment_type: str = "checkup") -> str:
    """Check available appointment slots for a specific date and time range."""
    try:
        # Parse date
        target_date = datetime.strptime(date, "%Y-%m-%d")
        day_name = target_date.strftime("%A").lower()
        
        # Get business hours for the day
        business_hours = dental_settings["businessHours"].get(day_name)
        if not business_hours or not business_hours["start"]:
            return f"Clinic is closed on {day_name}"
        
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
        
        return result
        
    except ValueError as e:
        return f"Invalid date format: {e}"
    except Exception as e:
        return f"Error checking availability: {e}"

async def book_appointment(patient_name: str, patient_email: str, date: str, start_time: str, appointment_type: str = "checkup", notes: Optional[str] = None) -> str:
    """Book a new dental appointment."""
    try:
        # Parse date and time
        appointment_datetime = datetime.strptime(f"{date} {start_time}", "%Y-%m-%d %H:%M")
        slot_key = appointment_datetime.strftime("%Y-%m-%d %H:%M")
        
        # Check if slot is already booked
        if slot_key in appointments:
            return f"Sorry, the slot {date} at {start_time} is already booked."
        
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
        
        return result
        
    except ValueError as e:
        return f"Invalid date/time format: {e}"
    except Exception as e:
        return f"Error booking appointment: {e}"

async def list_appointments(start_date: str, end_date: Optional[str] = None) -> str:
    """List upcoming appointments for a date range."""
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d") if end_date else start + timedelta(days=7)
        
        matching_appointments = []
        for slot_key, appointment in appointments.items():
            appointment_date = datetime.strptime(appointment["date"], "%Y-%m-%d")
            if start <= appointment_date <= end:
                matching_appointments.append(appointment)
        
        if not matching_appointments:
            return f"No appointments found between {start_date} and {end_date or start_date}"
        
        result = f"Appointments between {start_date} and {end_date or start_date}:\n\n"
        for apt in sorted(matching_appointments, key=lambda x: f"{x['date']} {x['start_time']}"):
            result += f"• {apt['id']}: {apt['patient_name']} - {apt['date']} at {apt['start_time']} ({apt['appointment_type']})\n"
        
        return result
        
    except ValueError as e:
        return f"Invalid date format: {e}"
    except Exception as e:
        return f"Error listing appointments: {e}"

async def get_appointment(appointment_id: str) -> str:
    """Get details of a specific appointment."""
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
                return result
        
        return f"Appointment {appointment_id} not found"
        
    except Exception as e:
        return f"Error retrieving appointment: {e}"

async def reschedule_appointment(appointment_id: str, new_date: str, new_start_time: str) -> str:
    """Reschedule an existing appointment to a new time."""
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
            return f"Appointment {appointment_id} not found"
        
        # Check if new slot is available
        new_slot_key = f"{new_date} {new_start_time}"
        if new_slot_key in appointments:
            return f"Sorry, the slot {new_date} at {new_start_time} is already booked."
        
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
        
        return result
        
    except ValueError as e:
        return f"Invalid date/time format: {e}"
    except Exception as e:
        return f"Error rescheduling appointment: {e}"

async def cancel_appointment(appointment_id: str, reason: Optional[str] = None) -> str:
    """Cancel an existing appointment."""
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
            return f"Appointment {appointment_id} not found"
        
        # Remove appointment
        del appointments[slot_key_to_remove]
        
        result = f"✅ Appointment cancelled successfully!\n\n"
        result += f"Appointment ID: {appointment_id}\n"
        result += f"Patient: {appointment['patient_name']}\n"
        result += f"Date: {appointment['date']}\n"
        result += f"Time: {appointment['start_time']}\n"
        if reason:
            result += f"Reason: {reason}\n"
        
        return result
        
    except Exception as e:
        return f"Error cancelling appointment: {e}"

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
