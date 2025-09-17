# ElevenLabs Integration Guide

This guide explains how to integrate the Dental Calendar MCP server with ElevenLabs Conversational AI agents for natural voice-based appointment management.

## Overview

The Dental Calendar MCP server is specifically designed to work with ElevenLabs agents, providing:
- Structured responses that agents can easily interpret
- Error handling with helpful suggestions
- Natural language date/time parsing
- Comprehensive appointment management capabilities

## Architecture

```
Patient Call → ElevenLabs Agent → Claude Desktop → MCP Server → Google Calendar
                    ↓                    ↓              ↓
              Voice Processing    Tool Execution   Calendar API
```

## Prerequisites

- ElevenLabs account with Conversational AI access
- Claude Desktop with MCP server configured
- Google Calendar MCP server running
- Dental clinic Google Calendar set up

## Step 1: Configure Claude Desktop

1. **Add MCP Server Configuration**

   Edit your Claude Desktop configuration file (typically located at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

   ```json
   {
     "mcpServers": {
       "dental-calendar": {
         "command": "node",
         "args": ["/path/to/dental-ai-system/google-calendar-mcp/dist/index.js"],
         "env": {
           "GOOGLE_CLIENT_ID": "your_google_client_id",
           "GOOGLE_CLIENT_SECRET": "your_google_client_secret",
           "GOOGLE_REDIRECT_URI": "http://localhost:3000/auth/google/callback",
           "GOOGLE_ACCESS_TOKEN": "your_access_token",
           "GOOGLE_REFRESH_TOKEN": "your_refresh_token",
           "GOOGLE_CALENDAR_ID": "primary",
           "CLINIC_NAME": "Your Dental Clinic",
           "CLINIC_TIMEZONE": "America/New_York"
         }
       }
     }
   }
   ```

2. **Restart Claude Desktop** to load the new MCP server

3. **Verify MCP Tools** are available in Claude Desktop:
   - Open Claude Desktop
   - Type a message like "What MCP tools are available?"
   - You should see the dental calendar tools listed

## Step 2: Create ElevenLabs Agent

1. **Log into ElevenLabs Console**
2. **Create a New Conversational AI Agent**
3. **Configure Agent Settings**:
   - **Name**: "Dental Receptionist"
   - **Voice**: Choose an appropriate professional voice
   - **Language**: English (or your preferred language)

## Step 3: Agent Prompt Configuration

Configure your ElevenLabs agent with this comprehensive prompt:

```
You are a helpful dental receptionist for [CLINIC_NAME]. You assist patients with booking, canceling, and managing their dental appointments through natural conversation.

CAPABILITIES:
You can help patients:
- Check available appointment times
- Book new appointments
- Cancel existing appointments
- Reschedule appointments
- Find appointment details
- Answer questions about appointment types

APPOINTMENT TYPES AVAILABLE:
- Cleaning (45 minutes) - Regular dental cleaning
- Checkup (30 minutes) - Routine examination
- Consultation (45 minutes) - New patient consultation
- Filling (60 minutes) - Dental filling procedure
- Root Canal (120 minutes) - Root canal treatment
- Crown (90 minutes) - Crown procedure
- Extraction (45 minutes) - Tooth extraction
- Emergency (30 minutes) - Urgent dental care

BUSINESS HOURS:
Monday-Thursday: 9 AM - 5 PM
Friday: 9 AM - 4 PM
Saturday: 9 AM - 2 PM
Sunday: Closed
Lunch break: 12 PM - 1 PM daily

CONVERSATION GUIDELINES:
1. Always be friendly and professional
2. Ask for patient information when booking (name, phone, email)
3. Confirm all appointment details before booking
4. Offer alternative times if requested slot is unavailable
5. Explain appointment types when asked
6. Handle emergencies with priority

WHEN BOOKING APPOINTMENTS:
1. Ask what type of appointment they need
2. Ask for preferred date and time
3. Check availability using the tools
4. If available, collect patient information:
   - Full name
   - Phone number
   - Email address
5. Confirm all details before booking
6. Provide appointment confirmation

WHEN PATIENT WANTS TO CANCEL/RESCHEDULE:
1. Ask for their name or phone number
2. Find their appointment
3. Confirm the appointment details
4. Process the cancellation or ask for new preferred time
5. Provide confirmation

EMERGENCY HANDLING:
If a patient mentions dental pain, emergency, or urgent need:
1. Express empathy and urgency
2. Try to find the earliest available emergency slot
3. If no immediate slots, offer to put them on a waiting list
4. Provide basic first aid advice if appropriate

USE THESE TOOLS:
- check_available_slots: Check open appointment times
- book_appointment: Create new appointments
- cancel_appointment: Cancel existing appointments
- reschedule_appointment: Move appointments to new times
- get_appointment_details: Get info about specific appointments
- find_appointment_by_phone: Find appointments by patient phone
- list_appointments: View appointments in date ranges

Always use the tools to interact with the calendar system. Never guess or make up appointment information.
```

## Step 4: Tool Usage Examples

### Checking Availability

**Patient**: "Do you have any openings tomorrow afternoon?"

**Agent Response Process**:
1. Parse "tomorrow afternoon"
2. Use `check_available_slots` with:
   ```json
   {
     "date": "tomorrow",
     "timeRange": {
       "start": "12:00",
       "end": "17:00"
     }
   }
   ```
3. Present available times naturally

### Booking an Appointment

**Patient**: "I'd like to book a cleaning for next Monday at 2 PM"

**Agent Response Process**:
1. Check availability: `check_available_slots`
2. If available, collect patient info
3. Book with `book_appointment`:
   ```json
   {
     "patient_name": "John Smith",
     "phone": "555-123-4567",
     "email": "john@example.com",
     "datetime": "next Monday at 2 PM",
     "appointment_type": "cleaning",
     "duration": 45
   }
   ```
4. Confirm booking details

### Finding Existing Appointments

**Patient**: "I need to check my appointment"

**Agent Response Process**:
1. Ask for phone number or name
2. Use `find_appointment_by_phone`:
   ```json
   {
     "phone": "555-123-4567"
   }
   ```
3. Present appointment details

## Step 5: Error Handling Configuration

Configure your agent to handle these common scenarios:

### No Available Slots
```
"I'm sorry, that time slot isn't available. Let me check other available times for you..."
[Use check_available_slots to find alternatives]
"I have these times available: [list options]"
```

### Outside Business Hours
```
"I'd be happy to help you schedule an appointment. However, that time is outside our business hours. We're open Monday through Friday from 9 AM to 5 PM, and Saturday from 9 AM to 2 PM. What other time works for you?"
```

### Missing Information
```
"I'll need a few details to book your appointment. Can you please provide your full name, phone number, and email address?"
```

### Appointment Not Found
```
"I couldn't find an appointment with that information. Let me help you search differently. Can you try providing your phone number or the approximate date of your appointment?"
```

## Step 6: Testing Your Integration

### Test Scenarios

1. **Basic Booking Flow**:
   - "I need a cleaning appointment next week"
   - Verify: availability check → info collection → booking confirmation

2. **Cancellation Flow**:
   - "I need to cancel my appointment"
   - Verify: appointment lookup → confirmation → cancellation

3. **Rescheduling Flow**:
   - "Can I move my appointment to a different time?"
   - Verify: appointment lookup → availability check → rescheduling

4. **Emergency Handling**:
   - "I have severe tooth pain and need to see someone today"
   - Verify: priority handling → emergency slot search

5. **Error Handling**:
   - Request unavailable times
   - Provide invalid information
   - Search for non-existent appointments

### Testing Script

Use this conversation flow to test your setup:

```
Agent: "Hello! Welcome to [Clinic Name]. How can I help you today?"

Test 1: Available Slots
You: "Do you have any appointments available this Friday?"

Test 2: Booking
You: "I'd like to book a checkup for Friday at 10 AM"
[Provide: Name, Phone, Email when asked]

Test 3: Finding Appointment
You: "Can you find my appointment? My phone is [your test phone]"

Test 4: Rescheduling
You: "I need to reschedule my appointment to next week"

Test 5: Cancellation
You: "I need to cancel my appointment"
```

## Step 7: Advanced Configuration

### Custom Responses

Customize responses in the dental settings:

```json
{
  "elevenlabsIntegration": {
    "voiceSettings": {
      "confirmationPhrase": "Perfect! Your appointment is confirmed",
      "cancellationPhrase": "Your appointment has been cancelled",
      "reschedulePhrase": "Your appointment has been rescheduled",
      "unavailablePhrase": "That time isn't available, but I have other options"
    }
  }
}
```

### Response Formatting

The MCP server provides structured responses optimized for voice agents:

- **Compact Format**: For confirmations and simple responses
- **Detailed Format**: For availability listings and complex information
- **Error Format**: Clear, actionable error messages

## Troubleshooting

### Common Issues

1. **MCP Tools Not Available**:
   - Check Claude Desktop configuration
   - Restart Claude Desktop
   - Verify MCP server is running

2. **Calendar Access Errors**:
   - Verify Google OAuth setup
   - Check token validity
   - Confirm calendar permissions

3. **Date Parsing Issues**:
   - Test various date formats
   - Use specific formats if natural language fails
   - Check timezone settings

4. **Appointment Conflicts**:
   - Verify business hours configuration
   - Check holiday settings
   - Confirm buffer time settings

### Debug Mode

Enable debug logging in your `.env` file:
```env
DEBUG=true
```

This will provide detailed logs of tool executions and API calls.

## Production Deployment

### Security Considerations

1. **Secure Environment Variables**:
   - Use proper secret management
   - Rotate credentials regularly
   - Monitor access logs

2. **Rate Limiting**:
   - Implement appropriate rate limits
   - Monitor API usage
   - Set up alerts for unusual activity

3. **Data Privacy**:
   - Handle patient information securely
   - Comply with HIPAA requirements
   - Implement audit logging

### Monitoring

Set up monitoring for:
- MCP server health
- Google Calendar API usage
- ElevenLabs agent performance
- Appointment booking success rates

## Next Steps

1. **Train Your Agent**: Test various conversation scenarios
2. **Monitor Performance**: Track booking success rates and user satisfaction
3. **Iterate and Improve**: Refine prompts based on real usage
4. **Scale Up**: Consider multiple agents for different clinic locations

For additional support, refer to:
- [Google OAuth Setup Guide](./google-oauth-setup.md)
- [MCP Server Documentation](../README.md)
- ElevenLabs Conversational AI documentation