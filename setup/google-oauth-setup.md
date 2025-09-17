# Google Calendar OAuth Setup Guide

This guide walks you through setting up Google Calendar API access for the Dental Calendar MCP server.

## Prerequisites

- A Google account with access to Google Cloud Console
- Administrative access to the Google Calendar you want to manage

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Create Project" or select an existing project
3. Give your project a name (e.g., "Dental Calendar MCP")
4. Note down the Project ID for later use

## Step 2: Enable Google Calendar API

1. In the Google Cloud Console, navigate to "APIs & Services" > "Library"
2. Search for "Google Calendar API"
3. Click on "Google Calendar API" from the search results
4. Click "Enable"

## Step 3: Create OAuth2 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"

3. **Configure OAuth Consent Screen** (if not already done):
   - Click "Configure Consent Screen"
   - Choose "External" user type (unless you have a Google Workspace account)
   - Fill in required fields:
     - App name: "Dental Calendar MCP"
     - User support email: Your email
     - Developer contact information: Your email
   - Add scopes:
     - `https://www.googleapis.com/auth/calendar`
     - `https://www.googleapis.com/auth/calendar.events`
   - Save and continue

4. **Create OAuth2 Client ID**:
   - Application type: "Web application"
   - Name: "Dental Calendar MCP Client"
   - Authorized redirect URIs: Add the following:
     - `http://localhost:3000/auth/google/callback`
     - `urn:ietf:wg:oauth:2.0:oob` (for device flow)

5. Click "Create"
6. **Save the credentials**:
   - Copy the Client ID
   - Copy the Client Secret
   - You'll need these for your `.env` file

## Step 4: Configure Environment Variables

1. Copy `.env.example` to `.env` in your project root:
   ```bash
   cp .env.example .env
   ```

2. Update the `.env` file with your credentials:
   ```env
   GOOGLE_CLIENT_ID=your_client_id_from_step_3
   GOOGLE_CLIENT_SECRET=your_client_secret_from_step_3
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
   GOOGLE_CALENDAR_ID=primary
   ```

## Step 5: Initial OAuth Flow (Required)

Since this is a server-to-server application, you need to complete the OAuth flow once to get the refresh token.

### Option A: Using OAuth Playground (Recommended)

1. Go to [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in the top right
3. Check "Use your own OAuth credentials"
4. Enter your Client ID and Client Secret from Step 3
5. In the left panel, find "Calendar API v3" and select:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
6. Click "Authorize APIs"
7. Follow the authorization flow
8. After authorization, click "Exchange authorization code for tokens"
9. Copy the `refresh_token` and `access_token`

### Option B: Manual OAuth Flow

Create a temporary script to get tokens:

```javascript
// get-tokens.js
import { google } from 'googleapis';
import http from 'http';
import url from 'url';
import { promises as fs } from 'fs';

const oauth2Client = new google.auth.OAuth2(
  'YOUR_CLIENT_ID',
  'YOUR_CLIENT_SECRET',
  'http://localhost:3000/auth/google/callback'
);

const scopes = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
});

console.log('Visit this URL to authorize the application:');
console.log(authUrl);

// Start a temporary server to capture the callback
const server = http.createServer(async (req, res) => {
  const queryObject = url.parse(req.url, true).query;

  if (queryObject.code) {
    try {
      const { tokens } = await oauth2Client.getToken(queryObject.code);
      console.log('Tokens received:', tokens);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('Authorization successful! You can close this tab.');

      // Save tokens to a file or display them
      await fs.writeFile('tokens.json', JSON.stringify(tokens, null, 2));
      console.log('Tokens saved to tokens.json');

      server.close();
    } catch (error) {
      console.error('Error getting tokens:', error);
      res.writeHead(500);
      res.end('Error getting tokens');
    }
  }
});

server.listen(3000, () => {
  console.log('Temporary server listening on port 3000');
});
```

Run this script:
```bash
node get-tokens.js
```

## Step 6: Add Tokens to Environment

Add the tokens to your `.env` file:

```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
GOOGLE_ACCESS_TOKEN=your_access_token
GOOGLE_REFRESH_TOKEN=your_refresh_token
GOOGLE_CALENDAR_ID=primary
```

## Step 7: Test the Configuration

1. Build and start the MCP server:
   ```bash
   npm run build
   npm start
   ```

2. Test with Claude Desktop or create a simple test script:
   ```javascript
   // test-calendar.js
   import { GoogleCalendarService } from './dist/services/google-calendar.js';

   const service = new GoogleCalendarService();

   // Test getting available slots
   service.getAvailableSlots('2024-03-15', 30)
     .then(slots => console.log('Available slots:', slots))
     .catch(error => console.error('Error:', error));
   ```

## Troubleshooting

### Common Issues

1. **"Invalid client" error**:
   - Verify your Client ID and Client Secret are correct
   - Check that the redirect URI matches exactly

2. **"Insufficient permissions" error**:
   - Ensure you've added the correct scopes during OAuth consent
   - Verify the Calendar API is enabled

3. **"Refresh token not found" error**:
   - You need to complete the OAuth flow with `access_type: 'offline'`
   - Delete existing tokens and redo the OAuth flow

4. **"Calendar not found" error**:
   - Check that `GOOGLE_CALENDAR_ID` is correct
   - Use "primary" for the main calendar or find the specific calendar ID

### Finding Your Calendar ID

1. Go to [Google Calendar](https://calendar.google.com/)
2. In the left sidebar, find your calendar
3. Click the three dots next to your calendar name
4. Select "Settings and sharing"
5. Scroll down to "Calendar ID" - this is what you need

### Testing Permissions

You can test if your setup is working by listing calendars:

```javascript
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  access_token: process.env.GOOGLE_ACCESS_TOKEN,
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

calendar.calendarList.list({})
  .then(response => {
    console.log('Available calendars:');
    response.data.items.forEach(cal => {
      console.log(`- ${cal.summary} (ID: ${cal.id})`);
    });
  })
  .catch(error => console.error('Error:', error));
```

## Security Best Practices

1. **Keep credentials secure**:
   - Never commit your `.env` file to version control
   - Use environment variables in production
   - Regularly rotate your Client Secret

2. **Limit scope access**:
   - Only request the minimum required scopes
   - Regularly review granted permissions

3. **Monitor usage**:
   - Check the Google Cloud Console for API usage
   - Set up alerts for unusual activity

4. **Use service accounts for production**:
   - Consider using service accounts for production deployments
   - Service accounts don't require user interaction for renewal

## Next Steps

Once your Google Calendar integration is working:

1. Configure your dental clinic settings in `config/dental-settings.json`
2. Set up Claude Desktop integration
3. Configure ElevenLabs integration
4. Test all MCP tools with real appointment scenarios

For ElevenLabs integration, see the [ElevenLabs Integration Guide](./elevenlabs-integration.md).