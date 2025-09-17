# Dental Calendar MCP Server

A Model Context Protocol (MCP) server for managing dental clinic appointments through Google Calendar, specifically designed for integration with ElevenLabs Conversational AI agents.

## Overview

This MCP server provides ElevenLabs AI agents with the ability to:
- Check available appointment slots
- Book new appointments
- Cancel existing appointments
- Reschedule appointments
- Retrieve appointment details
- List appointments in date ranges
- Find appointments by patient phone number

## Features

- **Google Calendar Integration**: Full integration with Google Calendar API v3
- **Business Hours Validation**: Respects clinic hours and working days
- **Appointment Type Management**: Different appointment types with appropriate durations
- **Conflict Detection**: Prevents double-booking and scheduling conflicts
- **Natural Language Support**: Handles various date/time formats from voice input
- **Comprehensive Error Handling**: Provides helpful error messages for ElevenLabs agents
- **Patient Information Management**: Stores patient details in calendar events
- **Automatic Reminders**: Configures email reminders for appointments

## Quick Start

### 1. Prerequisites

- Node.js 18+ installed
- Google Cloud Console project with Calendar API enabled
- Google OAuth2 credentials

### 2. Installation

```bash
cd google-calendar-mcp
npm install
```

### 3. Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Configure your environment variables in `.env`:
```env
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
GOOGLE_CALENDAR_ID=primary
```

3. Set up Google OAuth (see [Google OAuth Setup Guide](./setup/google-oauth-setup.md))

### 4. Build and Run

```bash
npm run build
npm start
```

## MCP Tools

### `check_available_slots`
Check available appointment time slots for a specific date.

**Parameters:**
- `date` (string): Date to check (YYYY-MM-DD or natural language)
- `duration` (number, optional): Appointment duration in minutes (default: 30)
- `timeRange` (object, optional): Limit search to specific hours

**Example:**
```json
{
  "date": "2024-03-15",
  "duration": 30,
  "timeRange": {
    "start": "09:00",
    "end": "17:00"
  }
}
```

### `book_appointment`
Book a new dental appointment.

**Parameters:**
- `patient_name` (string): Patient's full name
- `phone` (string): Patient's phone number
- `email` (string): Patient's email address
- `datetime` (string): Appointment date/time
- `duration` (number, optional): Duration in minutes (default: 30)
- `appointment_type` (string, optional): Type of appointment (default: "checkup")
- `notes` (string, optional): Additional notes

**Example:**
```json
{
  "patient_name": "John Smith",
  "phone": "555-123-4567",
  "email": "john@example.com",
  "datetime": "2024-03-15T10:00:00",
  "duration": 45,
  "appointment_type": "cleaning",
  "notes": "First time patient"
}
```

### `cancel_appointment`
Cancel an existing appointment.

**Parameters:**
- `appointment_id` (string): Unique appointment ID

### `reschedule_appointment`
Move an appointment to a new date/time.

**Parameters:**
- `appointment_id` (string): Unique appointment ID
- `new_datetime` (string): New appointment date/time

### `get_appointment_details`
Retrieve detailed information about a specific appointment.

**Parameters:**
- `appointment_id` (string): Unique appointment ID

### `find_appointment_by_phone`
Find upcoming appointments for a patient by phone number.

**Parameters:**
- `phone` (string): Patient's phone number

### `list_appointments`
List all appointments within a date range.

**Parameters:**
- `date_range` (object): Start and end dates
  - `start` (string): Start date
  - `end` (string): End date

## Integration with ElevenLabs

This MCP server is designed to work seamlessly with ElevenLabs Conversational AI agents. The tools provide structured responses that ElevenLabs agents can easily interpret and respond to naturally.

### Example ElevenLabs Integration

1. **Configure Claude Desktop** to include this MCP server
2. **Train your ElevenLabs agent** with appointment booking flows
3. **Use the MCP tools** within your conversational flows

See [ElevenLabs Integration Guide](./setup/elevenlabs-integration.md) for detailed setup instructions.

## Configuration

### Dental Clinic Settings

Customize clinic-specific settings in `config/dental-settings.json`:

- **Business Hours**: Define working hours for each day
- **Appointment Types**: Configure types, durations, and buffer times
- **Holidays**: List clinic closure dates
- **Policies**: Set booking rules and restrictions

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_CLIENT_ID` | Google OAuth2 Client ID | Yes |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 Client Secret | Yes |
| `GOOGLE_REDIRECT_URI` | OAuth2 Redirect URI | Yes |
| `GOOGLE_CALENDAR_ID` | Calendar ID to use (default: "primary") | No |
| `CLINIC_NAME` | Name of the dental clinic | No |
| `CLINIC_TIMEZONE` | Clinic timezone (default: "America/New_York") | No |
| `BUSINESS_HOURS_START` | Default start time (default: "09:00") | No |
| `BUSINESS_HOURS_END` | Default end time (default: "17:00") | No |

## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### Testing

```bash
npm test
```

## Claude Desktop Configuration

Add this MCP server to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "dental-calendar": {
      "command": "node",
      "args": ["/path/to/dental-ai-system/google-calendar-mcp/dist/index.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "your_client_id",
        "GOOGLE_CLIENT_SECRET": "your_client_secret",
        "GOOGLE_REDIRECT_URI": "your_redirect_uri"
      }
    }
  }
}
```

## Error Handling

The server provides comprehensive error handling with helpful messages:

- **Validation Errors**: Clear messages about invalid input
- **Scheduling Conflicts**: Suggestions for alternative times
- **API Errors**: Graceful handling of Google Calendar API issues
- **Business Logic Errors**: Helpful guidance for booking policies

## Security

- OAuth2 authentication for Google Calendar access
- Patient information stored securely in calendar events
- Input validation and sanitization
- No storage of sensitive credentials in code

## Support

For issues and questions:

1. Check the [Google OAuth Setup Guide](./setup/google-oauth-setup.md)
2. Review the [ElevenLabs Integration Guide](./setup/elevenlabs-integration.md)
3. Verify your configuration matches the examples

## License

MIT License - see LICENSE file for details.