import express from 'express';
import cors from 'cors';
import { GoogleCalendarService } from './services/google-calendar.js';
import { executeCheckAvailability } from './tools/check-availability.js';
import { executeBookAppointment } from './tools/book-appointment.js';
import { executeCancelAppointment } from './tools/cancel-appointment.js';
import { executeListAppointments } from './tools/list-appointments.js';
import { executeGetAppointment } from './tools/get-appointment.js';
import { executeRescheduleAppointment } from './tools/reschedule-appointment.js';
// import { executeFindByPhone } from './tools/find-by-phone.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Google Calendar service
const calendarService = new GoogleCalendarService();

// Health check endpoint - Railway needs this to pass health checks
app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Dental Calendar MCP Server',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// MCP tools list endpoint - ElevenLabs can query available tools
app.get('/tools', (req, res) => {
  res.json({
    jsonrpc: '2.0',
    id: Date.now(),
    result: {
      tools: [
        {
          name: 'check_available_slots',
          description: 'Check available appointment time slots for a specific date',
          inputSchema: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'Date to check availability for (YYYY-MM-DD format or natural language)'
              },
              duration: {
                type: 'number',
                description: 'Appointment duration in minutes',
                default: 30
              },
              timeRange: {
                type: 'object',
                description: 'Time range to search within',
                properties: {
                  start: { type: 'string', description: 'Start time (HH:MM format)' },
                  end: { type: 'string', description: 'End time (HH:MM format)' }
                }
              }
            },
            required: ['date']
          }
        },
        {
          name: 'book_appointment',
          description: 'Book a new dental appointment',
          inputSchema: {
            type: 'object',
            properties: {
              patient: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Patient full name' },
                  phone: { type: 'string', description: 'Patient phone number' },
                  email: { type: 'string', description: 'Patient email address' }
                },
                required: ['name', 'phone', 'email']
              },
              datetime: {
                type: 'string',
                description: 'Appointment date and time (ISO format or natural language)'
              },
              duration: {
                type: 'number',
                description: 'Appointment duration in minutes',
                default: 30
              },
              appointmentType: {
                type: 'string',
                description: 'Type of appointment',
                enum: ['checkup', 'cleaning', 'consultation', 'treatment', 'emergency'],
                default: 'checkup'
              },
              notes: {
                type: 'string',
                description: 'Additional notes or special requests'
              }
            },
            required: ['patient', 'datetime']
          }
        },
        {
          name: 'cancel_appointment',
          description: 'Cancel an existing appointment',
          inputSchema: {
            type: 'object',
            properties: {
              appointmentId: {
                type: 'string',
                description: 'ID of the appointment to cancel'
              },
              reason: {
                type: 'string',
                description: 'Reason for cancellation'
              }
            },
            required: ['appointmentId']
          }
        },
        {
          name: 'list_appointments',
          description: 'List appointments in a date range',
          inputSchema: {
            type: 'object',
            properties: {
              startDate: {
                type: 'string',
                description: 'Start date (YYYY-MM-DD format)'
              },
              endDate: {
                type: 'string',
                description: 'End date (YYYY-MM-DD format)'
              }
            },
            required: ['startDate']
          }
        },
        {
          name: 'get_appointment_details',
          description: 'Get details of a specific appointment',
          inputSchema: {
            type: 'object',
            properties: {
              appointmentId: {
                type: 'string',
                description: 'ID of the appointment'
              }
            },
            required: ['appointmentId']
          }
        },
        {
          name: 'reschedule_appointment',
          description: 'Reschedule an existing appointment',
          inputSchema: {
            type: 'object',
            properties: {
              appointmentId: {
                type: 'string',
                description: 'ID of the appointment to reschedule'
              },
              newDatetime: {
                type: 'string',
                description: 'New date and time (ISO format)'
              }
            },
            required: ['appointmentId', 'newDatetime']
          }
        },
        {
          name: 'find_appointment_by_phone',
          description: 'Find appointment by patient phone number',
          inputSchema: {
            type: 'object',
            properties: {
              phone: {
                type: 'string',
                description: 'Patient phone number'
              }
            },
            required: ['phone']
          }
        }
      ]
    }
  });
});

// MCP tool call endpoint - This is where ElevenLabs will call tools
app.post('/tools/call', async (req, res) => {
  try {
    const { name, arguments: args } = req.body;
    
    console.log(`Tool call: ${name}`, args);
    
    let result;
    
    // Route to the appropriate tool function
    switch (name) {
      case 'check_available_slots':
        result = await executeCheckAvailability(args, calendarService);
        break;
        
      case 'book_appointment':
        result = await executeBookAppointment(args, calendarService);
        break;
        
      case 'cancel_appointment':
        result = await executeCancelAppointment(args, calendarService);
        break;
        
      case 'list_appointments':
        result = await executeListAppointments(args, calendarService);
        break;
        
      case 'get_appointment_details':
        result = await executeGetAppointment(args, calendarService);
        break;
        
      case 'reschedule_appointment':
        result = await executeRescheduleAppointment(args, calendarService);
        break;
        
      // case 'find_appointment_by_phone':
      //   result = await executeFindByPhone(args, calendarService);
      //   break;
        
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    
    // Return MCP-formatted response
    res.json({
      jsonrpc: '2.0',
      id: req.body.id || Date.now(),
      result: {
        content: [
          {
            type: 'text',
            text: result
          }
        ]
      }
    });
    
  } catch (error) {
    console.error('Tool execution error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body.id || Date.now(),
      error: {
        code: -32000,
        message: errorMessage,
        data: errorStack
      }
    });
  }
});

// Start server - Railway provides PORT environment variable
const port = parseInt(process.env.PORT || '3000', 10);

app.listen(port, '0.0.0.0', () => {
  console.log(`Dental Calendar HTTP Server running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`Tools list: http://localhost:${port}/tools`);
  console.log(`Tool calls: http://localhost:${port}/tools/call`);
});
