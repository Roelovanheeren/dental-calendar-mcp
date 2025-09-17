"""
Dental Calendar MCP Server - Production Version

A production-ready MCP server for dental appointment management with Google Calendar integration.
"""

import json
import os
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Amsterdam timezone
AMSTERDAM_TZ = timezone(timedelta(hours=1))  # UTC+1 (winter time)
AMSTERDAM_TZ_SUMMER = timezone(timedelta(hours=2))  # UTC+2 (summer time)

def get_amsterdam_time():
    """Get current time in Amsterdam timezone"""
    now_utc = datetime.now(timezone.utc)
    # Simple check: if month is 4-9, assume summer time (UTC+2)
    if 4 <= now_utc.month <= 9:
        return now_utc.astimezone(AMSTERDAM_TZ_SUMMER)
    else:
        return now_utc.astimezone(AMSTERDAM_TZ)

# Google Calendar service
class GoogleCalendarService:
    def __init__(self):
        self.service = None
        self.calendar_id = os.getenv('GOOGLE_CALENDAR_ID', 'primary')
        self._initialize_service()
    
    def _initialize_service(self):
        """Initialize Google Calendar service with OAuth credentials"""
        try:
            access_token = os.getenv('GOOGLE_ACCESS_TOKEN')
            refresh_token = os.getenv('GOOGLE_REFRESH_TOKEN')
            client_id = os.getenv('GOOGLE_CLIENT_ID')
            client_secret = os.getenv('GOOGLE_CLIENT_SECRET')
            
            if not all([access_token, refresh_token, client_id, client_secret]):
                logger.warning("Google Calendar credentials not found. Using mock mode.")
                return
            
            creds = Credentials(
                token=access_token,
                refresh_token=refresh_token,
                token_uri='https://oauth2.googleapis.com/token',
                client_id=client_id,
                client_secret=client_secret
            )
            
            # Refresh token if needed
            if creds.expired:
                creds.refresh(GoogleRequest())
            
            self.service = build('calendar', 'v3', credentials=creds)
            logger.info("Google Calendar service initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize Google Calendar service: {e}")
            self.service = None
    
    def get_events(self, start_date, end_date):
        """Get events from Google Calendar"""
        if not self.service:
            return []
        
        try:
            events_result = self.service.events().list(
                calendarId=self.calendar_id,
                timeMin=start_date.isoformat() + 'Z',
                timeMax=end_date.isoformat() + 'Z',
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            
            return events_result.get('items', [])
        except Exception as e:
            logger.error(f"Error fetching events: {e}")
            return []
    
    def create_event(self, event_data):
        """Create event in Google Calendar"""
        if not self.service:
            return None
        
        try:
            event = self.service.events().insert(
                calendarId=self.calendar_id,
                body=event_data
            ).execute()
            return event
        except Exception as e:
            logger.error(f"Error creating event: {e}")
            return None

# Initialize Google Calendar service
calendar_service = GoogleCalendarService()

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

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "timestamp": get_amsterdam_time().isoformat()}

@app.get("/mcp")
@app.post("/mcp")
async def mcp_endpoint(request: Request):
    """MCP endpoint for ElevenLabs integration"""
    
    # Handle GET requests (ElevenLabs initial connection)
    if request.method == "GET":
        return {
            "jsonrpc": "2.0",
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "experimental": {},
                    "prompts": {"listChanged": False},
                    "resources": {"subscribe": False, "listChanged": False},
                    "tools": {"listChanged": False}
                },
                "serverInfo": {
                    "name": "DentalCalendarMCP",
                    "version": "1.0.0"
                }
            }
        }
    
    # Handle POST requests (MCP protocol)
    try:
        body = await request.json()
        method = body.get("method")
        
        if method == "initialize":
            response = {
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
                        "name": "DentalCalendarMCP",
                        "version": "1.0.0"
                    }
                }
            }
        elif method == "tools/list":
            response = {
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
            response = {
                "jsonrpc": "2.0",
                "id": body.get("id"),
                "error": {
                    "code": -32601,
                    "message": f"Method not found: {method}"
                }
            }
        
        return JSONResponse(content=response)
    
    except json.JSONDecodeError:
        return JSONResponse(content={"jsonrpc": "2.0", "error": {"code": -32700, "message": "Parse error"}}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"jsonrpc": "2.0", "error": {"code": -32000, "message": f"Server error: {e}"}}, status_code=500)

async def handle_tool_call(body):
    """Handle tool call requests"""
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
        
        response = {
            "jsonrpc": "2.0",
            "id": body.get("id"),
            "result": {
                "content": [
                    {"type": "text", "text": result}
                ]
            }
        }
        return response
    
    except Exception as e:
        return {
            "jsonrpc": "2.0",
            "id": body.get("id"),
            "error": {
                "code": -32603,
                "message": f"Tool execution error: {str(e)}"
            }
        }

# Dental appointment functions
async def check_availability(date: str, start_time: str = None, end_time: str = None, appointment_type: str = "checkup") -> str:
    """Check available appointment slots for a specific date and time range."""
    try:
        # Parse date in Amsterdam timezone
        target_date = datetime.strptime(date, "%Y-%m-%d")
        day_name = target_date.strftime("%A").lower()
        
        # Check if it's a weekend (clinic closed)
        if day_name in ['saturday', 'sunday']:
            return f"Clinic is closed on {day_name}"
        
        # Check if it's a holiday
        if date in ["2025-01-01", "2025-07-04", "2025-11-27", "2025-12-25"]:
            return f"Clinic is closed on {date} (holiday)"
        
        # Business hours: Monday-Friday 9:00-17:00, Friday until 16:00
        end_hour = 16 if day_name == 'friday' else 17
        
        # Get events from Google Calendar for the day
        start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        events = calendar_service.get_events(start_of_day, end_of_day)
        
        # Create busy periods from existing events
        busy_periods = []
        for event in events:
            if event.get('start', {}).get('dateTime'):
                start_time_str = event['start']['dateTime']
                end_time_str = event['end']['dateTime']
                
                # Parse times and convert to Amsterdam timezone
                start_dt = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
                end_dt = datetime.fromisoformat(end_time_str.replace('Z', '+00:00'))
                
                # Convert to Amsterdam time
                if start_dt.tzinfo is None:
                    start_dt = start_dt.replace(tzinfo=timezone.utc)
                if end_dt.tzinfo is None:
                    end_dt = end_dt.replace(tzinfo=timezone.utc)
                
                start_amsterdam = start_dt.astimezone(AMSTERDAM_TZ)
                end_amsterdam = end_dt.astimezone(AMSTERDAM_TZ)
                
                # Only include events that are on the target date
                if start_amsterdam.date() == target_date.date():
                    busy_periods.append((start_amsterdam, end_amsterdam))
        
        # Sort busy periods by start time
        busy_periods.sort(key=lambda x: x[0])
        
        # Generate available slots (every 30 minutes from 9 AM to end time)
        available_slots = []
        current_time = target_date.replace(hour=9, minute=0, second=0, microsecond=0)
        end_time = target_date.replace(hour=end_hour, minute=0, second=0, microsecond=0)
        
        while current_time < end_time:
            slot_end = current_time + timedelta(minutes=30)
            
            # Check if this slot conflicts with any busy period
            is_available = True
            for busy_start, busy_end in busy_periods:
                if (current_time < busy_end and slot_end > busy_start):
                    is_available = False
                    break
            
            if is_available:
                slot_time = current_time.strftime("%H:%M")
                available_slots.append(slot_time)
            
            # Move to next slot
            current_time += timedelta(minutes=30)
        
        if available_slots:
            result = f"Available slots on {date} for {appointment_type} (Amsterdam time):\n"
            result += "\n".join([f"- {slot}" for slot in available_slots[:10]])
            if len(available_slots) > 10:
                result += f"\n... and {len(available_slots) - 10} more slots"
        else:
            result = f"No available slots on {date} for {appointment_type}"
        
        return result
        
    except ValueError as e:
        return f"Invalid date format: {e}"
    except Exception as e:
        return f"Error checking availability: {e}"

async def book_appointment(patient_name: str, patient_email: str, date: str, start_time: str, appointment_type: str = "checkup", notes: str = None) -> str:
    """Book a new dental appointment."""
    try:
        # Parse date and time
        appointment_datetime = datetime.strptime(f"{date} {start_time}", "%Y-%m-%d %H:%M")
        
        # Convert to Amsterdam timezone
        appointment_datetime = appointment_datetime.replace(tzinfo=AMSTERDAM_TZ)
        
        # Check if slot is available first
        availability_result = await check_availability(date, start_time, None, appointment_type)
        if "No available slots" in availability_result or start_time not in availability_result:
            return f"Sorry, the slot {date} at {start_time} is not available."
        
        # Create Google Calendar event
        event_data = {
            'summary': f"{appointment_type.title()} - {patient_name}",
            'description': f"Patient: {patient_name}\nEmail: {patient_email}\nType: {appointment_type}\nNotes: {notes or 'None'}",
            'start': {
                'dateTime': appointment_datetime.isoformat(),
                'timeZone': 'Europe/Amsterdam',
            },
            'end': {
                'dateTime': (appointment_datetime + timedelta(minutes=30)).isoformat(),
                'timeZone': 'Europe/Amsterdam',
            },
            'attendees': [
                {'email': patient_email, 'displayName': patient_name}
            ],
            'reminders': {
                'useDefault': False,
                'overrides': [
                    {'method': 'email', 'minutes': 24 * 60},  # 24 hours
                    {'method': 'popup', 'minutes': 60},       # 1 hour
                ],
            },
        }
        
        # Create the event in Google Calendar
        created_event = calendar_service.create_event(event_data)
        
        if created_event:
            appointment_id = created_event.get('id', 'unknown')
            
            result = f"✅ Appointment booked successfully!\n\n"
            result += f"Appointment ID: {appointment_id}\n"
            result += f"Patient: {patient_name}\n"
            result += f"Email: {patient_email}\n"
            result += f"Date: {date}\n"
            result += f"Time: {start_time}\n"
            result += f"Type: {appointment_type}\n"
            if notes:
                result += f"Notes: {notes}\n"
            result += f"\n📅 Event created in Google Calendar"
            
            return result
        else:
            return f"Error: Failed to create appointment in Google Calendar. Please try again."
        
    except Exception as e:
        return f"Error booking appointment: {e}"

async def list_appointments(start_date: str, end_date: str = None) -> str:
    """List upcoming appointments for a date range."""
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d") if end_date else start + timedelta(days=7)
        
        events = calendar_service.get_events(start, end)
        
        if not events:
            return f"No appointments found between {start_date} and {end_date or start_date}"
        
        result = f"Appointments between {start_date} and {end_date or start_date}:\n\n"
        for event in events:
            if event.get('start', {}).get('dateTime'):
                start_time = event['start']['dateTime']
                summary = event.get('summary', 'No title')
                event_id = event.get('id', 'unknown')
                
                # Parse and format time
                start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
                if start_dt.tzinfo is None:
                    start_dt = start_dt.replace(tzinfo=timezone.utc)
                start_amsterdam = start_dt.astimezone(AMSTERDAM_TZ)
                
                result += f"• {event_id}: {summary} - {start_amsterdam.strftime('%Y-%m-%d %H:%M')}\n"
        
        return result
        
    except Exception as e:
        return f"Error listing appointments: {e}"

async def get_appointment(appointment_id: str) -> str:
    """Get details of a specific appointment."""
    try:
        # This would need to be implemented with Google Calendar API
        return f"Appointment details for {appointment_id} - Feature not yet implemented"
    except Exception as e:
        return f"Error retrieving appointment: {e}"

async def reschedule_appointment(appointment_id: str, new_date: str, new_start_time: str) -> str:
    """Reschedule an existing appointment to a new time."""
    try:
        # This would need to be implemented with Google Calendar API
        return f"Reschedule appointment {appointment_id} to {new_date} {new_start_time} - Feature not yet implemented"
    except Exception as e:
        return f"Error rescheduling appointment: {e}"

async def cancel_appointment(appointment_id: str, reason: str = None) -> str:
    """Cancel an existing appointment."""
    try:
        # This would need to be implemented with Google Calendar API
        return f"Cancel appointment {appointment_id} - Feature not yet implemented"
    except Exception as e:
        return f"Error cancelling appointment: {e}"

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    logger.info(f"Starting Dental Calendar MCP Server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
