#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { GoogleCalendarService } from './dist/services/google-calendar.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class ElevenLabsMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'dental-calendar-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    try {
      this.calendarService = new GoogleCalendarService();
    } catch (error) {
      console.error('Warning: Failed to initialize Google Calendar service:', error);
      console.error('The server will start but calendar operations may not work without proper OAuth tokens.');
      this.calendarService = null;
    }
    
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
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
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (!this.calendarService) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'Google Calendar service not initialized',
                  message: 'OAuth tokens are required. Please set GOOGLE_ACCESS_TOKEN and GOOGLE_REFRESH_TOKEN in your .env file.',
                  tool: name,
                }, null, 2),
              },
            ],
            isError: true,
          };
        }

        let result;
        switch (name) {
          case 'check_availability':
            result = await this.calendarService.checkAvailability(args);
            break;
          case 'book_appointment':
            result = await this.calendarService.bookAppointment(args);
            break;
          case 'list_appointments':
            result = await this.calendarService.listAppointments(args);
            break;
          case 'get_appointment':
            result = await this.calendarService.getAppointment(args);
            break;
          case 'reschedule_appointment':
            result = await this.calendarService.rescheduleAppointment(args);
            break;
          case 'cancel_appointment':
            result = await this.calendarService.cancelAppointment(args);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error(`Error executing tool ${name}:`, error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error.message,
                tool: name,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('MCP Server error:', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    try {
      console.error('Starting ElevenLabs MCP server...');
      const transport = new StdioServerTransport();
      console.error('Transport created, connecting...');
      await this.server.connect(transport);
      console.error('ElevenLabs MCP server running on stdio');
    } catch (error) {
      console.error('Failed to start ElevenLabs MCP server:', error);
      throw error;
    }
  }
}

// Start the server
const server = new ElevenLabsMCPServer();
server.run().catch((error) => {
  console.error('Server startup failed:', error);
  process.exit(1);
});