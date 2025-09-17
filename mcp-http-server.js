#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || process.env.MCP_HTTP_PORT || 3001;
const SECRET_TOKEN = process.env.MCP_SECRET_TOKEN;

// Validate required environment variables
if (!SECRET_TOKEN) {
  console.error('Error: MCP_SECRET_TOKEN environment variable is required');
  process.exit(1);
}

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Secret token validation middleware
const validateSecret = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : null;

  if (!token || token !== SECRET_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: Invalid secret token' });
  }
  
  next();
};

// MCP Server communication
async function callMCPServer(request) {
  return new Promise((resolve, reject) => {
    const mcpProcess = spawn('node', ['-r', 'dotenv/config', join(__dirname, 'dist', 'index.js')], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    mcpProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    mcpProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    mcpProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`MCP server exited with code ${code}: ${errorOutput}`));
        return;
      }

      try {
        // Parse the last complete JSON response
        const lines = output.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const response = JSON.parse(lastLine);
        resolve(response);
      } catch (error) {
        reject(new Error(`Failed to parse MCP response: ${error.message}`));
      }
    });

    mcpProcess.on('error', (error) => {
      reject(error);
    });

    // Send the request to MCP server
    mcpProcess.stdin.write(JSON.stringify(request) + '\n');
    mcpProcess.stdin.end();
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// MCP tools endpoint
app.get('/tools', validateSecret, async (req, res) => {
  try {
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/list',
      params: {}
    };

    const response = await callMCPServer(request);
    res.json(response);
  } catch (error) {
    console.error('Error listing tools:', error);
    res.status(500).json({ error: error.message });
  }
});

// MCP tool call endpoint
app.post('/tools/call', validateSecret, async (req, res) => {
  try {
    const { name, arguments: args } = req.body;

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    };

    const response = await callMCPServer(request);
    res.json(response);
  } catch (error) {
    console.error('Error calling tool:', error);
    res.status(500).json({ error: error.message });
  }
});

// MCP server info endpoint
app.get('/info', (req, res) => {
  res.json({
    name: 'dental-calendar-mcp',
    version: '1.0.0',
    description: 'Dental Calendar MCP Server for appointment management',
    capabilities: ['tools'],
    tools: [
      'check_available_slots',
      'book_appointment',
      'cancel_appointment',
      'reschedule_appointment',
      'get_appointment_details',
      'find_appointment_by_phone',
      'list_appointments'
    ]
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP HTTP Server running on port ${PORT}`);
  console.log(`Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`Tools endpoint: http://0.0.0.0:${PORT}/tools`);
  console.log(`Tool call endpoint: http://0.0.0.0:${PORT}/tools/call`);
  console.log(`Server is ready and listening on all interfaces`);
});

// Add error handling
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Test health endpoint immediately
setTimeout(() => {
  console.log('Testing health endpoint...');
  fetch(`http://localhost:${PORT}/health`)
    .then(res => res.json())
    .then(data => console.log('Health check test result:', data))
    .catch(err => console.error('Health check test failed:', err));
}, 1000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down MCP HTTP Server...');
  process.exit(0);
});
