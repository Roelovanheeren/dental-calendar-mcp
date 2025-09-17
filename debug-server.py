#!/usr/bin/env python3
"""
Debug MCP Server

A simple server that logs all requests to help debug what ElevenLabs is actually sending.
"""

import json
import os
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import uvicorn

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

# Initialize FastAPI app
app = FastAPI(title="Debug MCP Server", version="1.0.0")

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
    """Health check endpoint."""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Debug MCP Server",
        "version": "1.0.0",
        "description": "Debug server to see what ElevenLabs sends",
        "endpoints": {
            "health": "/health",
            "debug": "/debug",
            "sse": "/sse",
            "mcp": "/mcp"
        }
    }

@app.get("/debug")
async def debug_info():
    """Debug information endpoint."""
    return {
        "message": "Debug server is running",
        "timestamp": datetime.now().isoformat(),
        "instructions": "Check the server logs to see what ElevenLabs sends"
    }

@app.get("/sse")
async def sse_debug():
    """SSE endpoint with debug logging."""
    async def event_generator():
        print(f"[DEBUG] SSE connection started at {datetime.now()}")
        yield f"data: {json.dumps({'type': 'connected', 'message': 'Debug SSE connected'})}\n\n"
        
        # Send a simple tools list
        tools_response = {
            "jsonrpc": "2.0",
            "method": "tools/list",
            "result": {
                "tools": [
                    {
                        "name": "test_tool",
                        "description": "A simple test tool",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "message": {"type": "string", "title": "Message"}
                            },
                            "required": ["message"]
                        }
                    }
                ]
            }
        }
        
        print(f"[DEBUG] Sending tools list: {json.dumps(tools_response, indent=2)}")
        yield f"data: {json.dumps(tools_response)}\n\n"
        
        # Keep connection alive
        while True:
            await asyncio.sleep(30)
            ping_data = {'type': 'ping', 'timestamp': datetime.now().isoformat()}
            print(f"[DEBUG] Sending ping: {ping_data}")
            yield f"data: {json.dumps(ping_data)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

@app.get("/mcp")
@app.post("/mcp")
async def mcp_debug(request: Request):
    """MCP endpoint with debug logging."""
    print(f"[DEBUG] {request.method} request to /mcp")
    print(f"[DEBUG] Headers: {dict(request.headers)}")
    
    # Handle GET requests (ElevenLabs initial connection)
    if request.method == "GET":
        print(f"[DEBUG] ElevenLabs GET request - returning MCP server info")
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
                    "name": "DebugMCP",
                    "version": "1.0.0"
                }
            }
        }
    
    # Handle POST requests (MCP protocol)
    try:
        body = await request.json()
        print(f"[DEBUG] MCP POST request received: {json.dumps(body, indent=2)}")
        
        method = body.get("method")
        print(f"[DEBUG] Method: {method}")
        
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
                        "name": "DebugMCP",
                        "version": "1.0.0"
                    }
                }
            }
            print(f"[DEBUG] Sending initialize response: {json.dumps(response, indent=2)}")
            return response
        
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
            print(f"[DEBUG] Sending tools list response: {json.dumps(response, indent=2)}")
            return response
        
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
            print(f"[DEBUG] Sending error response: {json.dumps(response, indent=2)}")
            return response
    
    except Exception as e:
        print(f"[DEBUG] Error processing request: {e}")
        return {
            "jsonrpc": "2.0",
            "id": body.get("id") if 'body' in locals() else None,
            "error": {
                "code": -32603,
                "message": f"Internal error: {str(e)}"
            }
        }

# Catch all other requests
@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def catch_all(request: Request, path: str):
    """Catch all requests for debugging."""
    print(f"[DEBUG] {request.method} request to /{path}")
    print(f"[DEBUG] Headers: {dict(request.headers)}")
    
    try:
        if request.method in ["POST", "PUT"]:
            body = await request.json()
            print(f"[DEBUG] Body: {json.dumps(body, indent=2)}")
    except:
        print(f"[DEBUG] Could not parse body as JSON")
    
    return {
        "message": f"Debug: {request.method} request to /{path}",
        "timestamp": datetime.now().isoformat(),
        "headers": dict(request.headers)
    }

async def handle_tool_call(body):
    """Handle tool call requests."""
    params = body.get("params", {})
    tool_name = params.get("name")
    arguments = params.get("arguments", {})
    
    print(f"[DEBUG] Tool call: {tool_name} with args: {json.dumps(arguments, indent=2)}")
    
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
        print(f"[DEBUG] Tool response: {json.dumps(response, indent=2)}")
        return response
    
    except Exception as e:
        print(f"[DEBUG] Tool execution error: {e}")
        return {
            "jsonrpc": "2.0",
            "id": body.get("id"),
            "error": {
                "code": -32603,
                "message": f"Tool execution error: {str(e)}"
            }
        }

# Dental appointment functions
appointments = {}

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
        
        # Generate available slots (every 30 minutes from 9 AM to end time)
        available_slots = []
        for hour in range(9, end_hour + 1):
            for minute in [0, 30]:
                if hour == end_hour and minute > 0:
                    break  # Don't go past end time
                slot_time = f"{hour:02d}:{minute:02d}"
                slot_key = f"{date} {slot_time}"
                if slot_key not in appointments:
                    available_slots.append(slot_time)
        
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
        slot_key = f"{date} {start_time}"
        
        if slot_key in appointments:
            return f"Sorry, the slot {date} at {start_time} is already booked."
        
        appointment_id = f"APT_{len(appointments) + 1:04d}"
        appointments[slot_key] = {
            "id": appointment_id,
            "patient_name": patient_name,
            "patient_email": patient_email,
            "date": date,
            "start_time": start_time,
            "appointment_type": appointment_type,
            "notes": notes or "",
            "status": "confirmed"
        }
        
        result = f"✅ Appointment booked successfully!\n\n"
        result += f"Appointment ID: {appointment_id}\n"
        result += f"Patient: {patient_name}\n"
        result += f"Email: {patient_email}\n"
        result += f"Date: {date}\n"
        result += f"Time: {start_time}\n"
        result += f"Type: {appointment_type}\n"
        if notes:
            result += f"Notes: {notes}\n"
        
        return result
        
    except Exception as e:
        return f"Error booking appointment: {e}"

async def list_appointments(start_date: str, end_date: str = None) -> str:
    """List upcoming appointments for a date range."""
    try:
        from datetime import datetime, timedelta
        
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
        
    except Exception as e:
        return f"Error rescheduling appointment: {e}"

async def cancel_appointment(appointment_id: str, reason: str = None) -> str:
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
    import asyncio
    port = int(os.getenv("PORT", 8000))
    print(f"[DEBUG] Starting debug server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
