#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.status(200).send('ok');
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    port: PORT
  });
});

// MCP Protocol endpoints that ElevenLabs expects
app.get('/mcp/tools', async (req, res) => {
  try {
    const tools = [
      {
        name: 'check_availability',
        description: 'Check available appointment slots for a specific date and time range',
        inputSchema: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'Date to check availability (YYYY-MM-DD format)',
            },
            startTime: {
              type: 'string',
              description: 'Start time in HH:MM format (24-hour)',
            },
            endTime: {
              type: 'string',
              description: 'End time in HH:MM format (24-hour)',
            },
            appointmentType: {
              type: 'string',
              description: 'Type of appointment (cleaning, checkup, consultation, etc.)',
            },
          },
          required: ['date'],
        },
      },
      {
        name: 'book_appointment',
        description: 'Book a new dental appointment',
        inputSchema: {
          type: 'object',
          properties: {
            patientName: {
              type: 'string',
              description: 'Full name of the patient',
            },
            patientEmail: {
              type: 'string',
              description: 'Email address of the patient',
            },
            date: {
              type: 'string',
              description: 'Date of the appointment (YYYY-MM-DD format)',
            },
            startTime: {
              type: 'string',
              description: 'Start time in HH:MM format (24-hour)',
            },
            appointmentType: {
              type: 'string',
              description: 'Type of appointment (cleaning, checkup, consultation, etc.)',
            },
            notes: {
              type: 'string',
              description: 'Additional notes for the appointment',
            },
          },
          required: ['patientName', 'patientEmail', 'date', 'startTime', 'appointmentType'],
        },
      },
      {
        name: 'list_appointments',
        description: 'List upcoming appointments for a date range',
        inputSchema: {
          type: 'object',
          properties: {
            startDate: {
              type: 'string',
              description: 'Start date for the range (YYYY-MM-DD format)',
            },
            endDate: {
              type: 'string',
              description: 'End date for the range (YYYY-MM-DD format)',
            },
          },
          required: ['startDate'],
        },
      },
      {
        name: 'get_appointment',
        description: 'Get details of a specific appointment',
        inputSchema: {
          type: 'object',
          properties: {
            appointmentId: {
              type: 'string',
              description: 'ID of the appointment to retrieve',
            },
          },
          required: ['appointmentId'],
        },
      },
      {
        name: 'reschedule_appointment',
        description: 'Reschedule an existing appointment to a new time',
        inputSchema: {
          type: 'object',
          properties: {
            appointmentId: {
              type: 'string',
              description: 'ID of the appointment to reschedule',
            },
            newDate: {
              type: 'string',
              description: 'New date for the appointment (YYYY-MM-DD format)',
            },
            newStartTime: {
              type: 'string',
              description: 'New start time in HH:MM format (24-hour)',
            },
          },
          required: ['appointmentId', 'newDate', 'newStartTime'],
        },
      },
      {
        name: 'cancel_appointment',
        description: 'Cancel an existing appointment',
        inputSchema: {
          type: 'object',
          properties: {
            appointmentId: {
              type: 'string',
              description: 'ID of the appointment to cancel',
            },
            reason: {
              type: 'string',
              description: 'Reason for cancellation',
            },
          },
          required: ['appointmentId'],
        },
      },
    ];
    
    res.json({ tools });
  } catch (error) {
    console.error('Error listing tools:', error);
    res.status(500).json({ error: error.message });
  }
});

// MCP tool call endpoint
app.post('/mcp/call', async (req, res) => {
  try {
    const { name, arguments: args } = req.body;

    const mockResponse = {
      success: false,
      error: 'Google Calendar service not initialized',
      message: 'OAuth tokens are required. Please set GOOGLE_ACCESS_TOKEN and GOOGLE_REFRESH_TOKEN in your .env file.',
      tool: name,
      receivedArgs: args
    };
    
    res.json(mockResponse);
  } catch (error) {
    console.error('Error calling tool:', error);
    res.status(500).json({ error: error.message });
  }
});

// ElevenLabs might also expect these endpoints
app.get('/tools', async (req, res) => {
  try {
    const tools = [
      {
        name: 'check_availability',
        description: 'Check available appointment slots for a specific date and time range',
        inputSchema: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'Date to check availability (YYYY-MM-DD format)',
            },
            startTime: {
              type: 'string',
              description: 'Start time in HH:MM format (24-hour)',
            },
            endTime: {
              type: 'string',
              description: 'End time in HH:MM format (24-hour)',
            },
            appointmentType: {
              type: 'string',
              description: 'Type of appointment (cleaning, checkup, consultation, etc.)',
            },
          },
          required: ['date'],
        },
      },
      {
        name: 'book_appointment',
        description: 'Book a new dental appointment',
        inputSchema: {
          type: 'object',
          properties: {
            patientName: {
              type: 'string',
              description: 'Full name of the patient',
            },
            patientEmail: {
              type: 'string',
              description: 'Email address of the patient',
            },
            date: {
              type: 'string',
              description: 'Date of the appointment (YYYY-MM-DD format)',
            },
            startTime: {
              type: 'string',
              description: 'Start time in HH:MM format (24-hour)',
            },
            appointmentType: {
              type: 'string',
              description: 'Type of appointment (cleaning, checkup, consultation, etc.)',
            },
            notes: {
              type: 'string',
              description: 'Additional notes for the appointment',
            },
          },
          required: ['patientName', 'patientEmail', 'date', 'startTime', 'appointmentType'],
        },
      },
      {
        name: 'list_appointments',
        description: 'List upcoming appointments for a date range',
        inputSchema: {
          type: 'object',
          properties: {
            startDate: {
              type: 'string',
              description: 'Start date for the range (YYYY-MM-DD format)',
            },
            endDate: {
              type: 'string',
              description: 'End date for the range (YYYY-MM-DD format)',
            },
          },
          required: ['startDate'],
        },
      },
      {
        name: 'get_appointment',
        description: 'Get details of a specific appointment',
        inputSchema: {
          type: 'object',
          properties: {
            appointmentId: {
              type: 'string',
              description: 'ID of the appointment to retrieve',
            },
          },
          required: ['appointmentId'],
        },
      },
      {
        name: 'reschedule_appointment',
        description: 'Reschedule an existing appointment to a new time',
        inputSchema: {
          type: 'object',
          properties: {
            appointmentId: {
              type: 'string',
              description: 'ID of the appointment to reschedule',
            },
            newDate: {
              type: 'string',
              description: 'New date for the appointment (YYYY-MM-DD format)',
            },
            newStartTime: {
              type: 'string',
              description: 'New start time in HH:MM format (24-hour)',
            },
          },
          required: ['appointmentId', 'newDate', 'newStartTime'],
        },
      },
      {
        name: 'cancel_appointment',
        description: 'Cancel an existing appointment',
        inputSchema: {
          type: 'object',
          properties: {
            appointmentId: {
              type: 'string',
              description: 'ID of the appointment to cancel',
            },
            reason: {
              type: 'string',
              description: 'Reason for cancellation',
            },
          },
          required: ['appointmentId'],
        },
      },
    ];
    
    res.json({ tools });
  } catch (error) {
    console.error('Error listing tools:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/tools/call', async (req, res) => {
  try {
    const { name, arguments: args } = req.body;

    const mockResponse = {
      success: false,
      error: 'Google Calendar service not initialized',
      message: 'OAuth tokens are required. Please set GOOGLE_ACCESS_TOKEN and GOOGLE_REFRESH_TOKEN in your .env file.',
      tool: name,
      receivedArgs: args
    };
    
    res.json(mockResponse);
  } catch (error) {
    console.error('Error calling tool:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
console.log('Starting ElevenLabs MCP Server on port:', PORT);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ ElevenLabs MCP Server running on port ${PORT}`);
  console.log(`✅ Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`✅ MCP tools: http://0.0.0.0:${PORT}/mcp/tools`);
  console.log(`✅ MCP call: http://0.0.0.0:${PORT}/mcp/call`);
  console.log(`✅ Tools: http://0.0.0.0:${PORT}/tools`);
  console.log(`✅ Tool call: http://0.0.0.0:${PORT}/tools/call`);
  console.log(`✅ Server is ready and listening on all interfaces`);
});

// Add error handling
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

// Handle process errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down ElevenLabs MCP Server...');
  process.exit(0);
});