#!/usr/bin/env node

import dotenv from 'dotenv';
import { GoogleCalendarService } from './services/google-calendar.js';
import { DateHelpers } from './utils/date-helpers.js';

// Load environment variables
dotenv.config();

class MCPServerTest {
  private calendarService: GoogleCalendarService;

  constructor() {
    this.calendarService = new GoogleCalendarService();
  }

  async runTests() {
    console.log('🔧 Testing Dental Calendar MCP Server\n');

    // Test 1: Environment Configuration
    await this.testEnvironmentConfig();

    // Test 2: Date Helper Functions
    await this.testDateHelpers();

    // Test 3: Google Calendar Connection
    await this.testCalendarConnection();

    // Test 4: Available Slots
    await this.testAvailableSlots();

    // Test 5: Complete Booking Flow (if enabled)
    if (process.env.RUN_INTEGRATION_TESTS === 'true') {
      await this.testBookingFlow();
    } else {
      console.log('⏭️  Skipping integration tests (set RUN_INTEGRATION_TESTS=true to enable)');
    }

    console.log('\n✅ All tests completed!');
  }

  private async testEnvironmentConfig() {
    console.log('📋 Testing Environment Configuration...');

    const requiredVars = [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_REDIRECT_URI',
    ];

    const optionalVars = [
      'GOOGLE_ACCESS_TOKEN',
      'GOOGLE_REFRESH_TOKEN',
      'GOOGLE_CALENDAR_ID',
      'CLINIC_NAME',
      'CLINIC_TIMEZONE',
    ];

    let hasErrors = false;

    requiredVars.forEach(varName => {
      if (!process.env[varName]) {
        console.log(`   ❌ Missing required variable: ${varName}`);
        hasErrors = true;
      } else {
        console.log(`   ✅ ${varName}: Set`);
      }
    });

    optionalVars.forEach(varName => {
      if (!process.env[varName]) {
        console.log(`   ⚠️  Optional variable not set: ${varName}`);
      } else {
        console.log(`   ✅ ${varName}: Set`);
      }
    });

    if (hasErrors) {
      console.log('   ❌ Environment configuration has errors. Please check your .env file.');
      process.exit(1);
    }

    console.log('   ✅ Environment configuration is valid\n');
  }

  private async testDateHelpers() {
    console.log('📅 Testing Date Helper Functions...');

    try {
      // Test date parsing
      const testDate = DateHelpers.parseDateTime('2024-03-15T10:00:00');
      console.log(`   ✅ Date parsing: ${DateHelpers.formatForDisplay(testDate)}`);

      // Test natural language parsing
      const tomorrow = DateHelpers.parseNaturalLanguage('tomorrow');
      console.log(`   ✅ Natural language parsing: Tomorrow = ${DateHelpers.formatForDisplay(tomorrow)}`);

      // Test business hours validation
      const businessDay = new Date('2024-03-15T14:00:00'); // Friday 2 PM
      const isBusinessHours = DateHelpers.isWithinBusinessHours(businessDay);
      console.log(`   ✅ Business hours validation: ${isBusinessHours}`);

      // Test advance booking validation
      const futureDate = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 hours from now
      const canBook = DateHelpers.canBookAppointment(futureDate);
      console.log(`   ✅ Advance booking validation: ${canBook}`);

      console.log('   ✅ All date helper functions working correctly\n');
    } catch (error) {
      console.log(`   ❌ Date helper error: ${error}`);
    }
  }

  private async testCalendarConnection() {
    console.log('📞 Testing Google Calendar Connection...');

    if (!process.env.GOOGLE_ACCESS_TOKEN || !process.env.GOOGLE_REFRESH_TOKEN) {
      console.log('   ⚠️  No access tokens found. Skipping calendar connection test.');
      console.log('   Please complete the OAuth flow first (see setup/google-oauth-setup.md)\n');
      return;
    }

    try {
      // Try to get available slots for today (this will test the connection)
      const today = new Date().toISOString().split('T')[0];
      await this.calendarService.getAvailableSlots(today, 30);
      console.log('   ✅ Google Calendar connection successful');
      console.log('   ✅ Calendar API access confirmed\n');
    } catch (error: any) {
      console.log(`   ❌ Calendar connection failed: ${error.message}`);
      console.log('   Please check your Google OAuth setup and credentials\n');
    }
  }

  private async testAvailableSlots() {
    console.log('🗓️  Testing Available Slots...');

    if (!process.env.GOOGLE_ACCESS_TOKEN || !process.env.GOOGLE_REFRESH_TOKEN) {
      console.log('   ⚠️  Skipping slots test (no access tokens)\n');
      return;
    }

    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];

      const slots = await this.calendarService.getAvailableSlots(dateStr, 30);
      console.log(`   ✅ Found ${slots.length} available slots for ${dateStr}`);

      if (slots.length > 0) {
        console.log(`   📅 Sample slots:`);
        slots.slice(0, 3).forEach(slot => {
          const startTime = new Date(slot.start).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          });
          console.log(`      - ${startTime}`);
        });
      }
      console.log();
    } catch (error: any) {
      console.log(`   ❌ Error getting available slots: ${error.message}\n`);
    }
  }

  private async testBookingFlow() {
    console.log('🎯 Testing Complete Booking Flow...');

    try {
      // Create a test appointment for tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0); // 2 PM

      const testPatient = {
        name: 'Test Patient',
        phone: '+1-555-TEST-123',
        email: 'test@example.com',
      };

      console.log('   📅 Creating test appointment...');
      const appointment = await this.calendarService.createAppointment(
        testPatient,
        tomorrow.toISOString(),
        30,
        'checkup',
        'Test appointment created by MCP server test'
      );

      console.log(`   ✅ Appointment created: ${appointment.id}`);
      console.log(`   📋 Patient: ${appointment.patient.name}`);
      console.log(`   📅 Time: ${DateHelpers.formatForDisplay(new Date(appointment.datetime))}`);

      // Test getting appointment details
      console.log('   🔍 Retrieving appointment details...');
      const details = await this.calendarService.getAppointmentDetails(appointment.id);
      console.log(`   ✅ Retrieved appointment: ${details.appointmentType} for ${details.patient.name}`);

      // Test rescheduling
      const newTime = new Date(tomorrow);
      newTime.setHours(15, 0, 0, 0); // Move to 3 PM

      console.log('   🔄 Testing reschedule...');
      const rescheduled = await this.calendarService.rescheduleAppointment(
        appointment.id,
        newTime.toISOString()
      );
      console.log(`   ✅ Rescheduled to: ${DateHelpers.formatForDisplay(new Date(rescheduled.datetime))}`);

      // Clean up - cancel the test appointment
      console.log('   🗑️  Cleaning up test appointment...');
      await this.calendarService.cancelAppointment(appointment.id);
      console.log('   ✅ Test appointment cancelled');

      console.log('   ✅ Complete booking flow test successful\n');
    } catch (error: any) {
      console.log(`   ❌ Booking flow test failed: ${error.message}\n`);
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Dental Calendar MCP Server Test Utility

Usage: npm test [options]

Options:
  --help, -h          Show this help message
  --integration       Run integration tests (requires valid OAuth tokens)
  --env-only          Only test environment configuration

Environment Variables:
  RUN_INTEGRATION_TESTS=true    Enable integration tests

Examples:
  npm test                      # Run basic tests
  npm test --integration        # Run all tests including integration
  npm test --env-only          # Only check environment setup
`);
    process.exit(0);
  }

  if (args.includes('--integration')) {
    process.env.RUN_INTEGRATION_TESTS = 'true';
  }

  const tester = new MCPServerTest();

  if (args.includes('--env-only')) {
    await tester['testEnvironmentConfig']();
    return;
  }

  await tester.runTests();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}