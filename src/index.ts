#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

// Import services
import { GoogleCalendarService } from './services/google-calendar.js';

// Import tools
import { checkAvailabilityTool, executeCheckAvailability } from './tools/check-availability.js';
import { bookAppointmentTool, executeBookAppointment } from './tools/book-appointment.js';
import { cancelAppointmentTool, executeCancelAppointment } from './tools/cancel-appointment.js';
import { rescheduleAppointmentTool, executeRescheduleAppointment } from './tools/reschedule-appointment.js';
import { getAppointmentTool, executeGetAppointment, findByPhoneTool, executeFindByPhone } from './tools/get-appointment.js';
import { listAppointmentsTool, executeListAppointments } from './tools/list-appointments.js';

// Load environment variables
dotenv.config();

class DentalCalendarMCPServer {
  private server: Server;
  private calendarService: GoogleCalendarService;

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
      // Create a mock service for now
      this.calendarService = null as any;
    }
    
    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          checkAvailabilityTool,
          bookAppointmentTool,
          cancelAppointmentTool,
          rescheduleAppointmentTool,
          getAppointmentTool,
          findByPhoneTool,
          listAppointmentsTool,
        ],
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Check if calendar service is available
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

        let result: string;

        switch (name) {
          case 'check_available_slots':
            result = await executeCheckAvailability(args, this.calendarService);
            break;

          case 'book_appointment':
            result = await executeBookAppointment(args, this.calendarService);
            break;

          case 'cancel_appointment':
            result = await executeCancelAppointment(args, this.calendarService);
            break;

          case 'reschedule_appointment':
            result = await executeRescheduleAppointment(args, this.calendarService);
            break;

          case 'get_appointment_details':
            result = await executeGetAppointment(args, this.calendarService);
            break;

          case 'find_appointment_by_phone':
            result = await executeFindByPhone(args, this.calendarService);
            break;

          case 'list_appointments':
            result = await executeListAppointments(args, this.calendarService);
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error(`Error executing tool ${name}:`, error);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Tool execution failed',
                message: errorMessage,
                tool: name,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      console.log('Shutting down dental calendar MCP server...');
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    try {
      console.error('Starting MCP server...');
      const transport = new StdioServerTransport();
      console.error('Transport created, connecting...');
      await this.server.connect(transport);
      console.error('Dental Calendar MCP server running on stdio');
    } catch (error) {
      console.error('Failed to start MCP server:', error);
      throw error;
    }
  }
}

// Validate required environment variables
function validateEnvironment() {
  const required = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach(key => console.error(`  - ${key}`));
    console.error('\nPlease check your .env file and ensure all required variables are set.');
    console.error('See .env.example for reference.');
    process.exit(1);
  }
}

// Main execution
async function main() {
  try {
    validateEnvironment();

    const server = new DentalCalendarMCPServer();
    await server.run();
  } catch (error) {
    console.error('Failed to start dental calendar MCP server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}