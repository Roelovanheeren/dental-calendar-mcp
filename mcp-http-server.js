#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.MCP_HTTP_PORT || 3001;
const SECRET_TOKEN = process.env.MCP_SECRET_TOKEN || 'dental-mcp-secret-2025';

// Middleware
app.use(cors());
app.use(express.json());

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
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
app.listen(PORT, () => {
  console.log(`MCP HTTP Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Tools endpoint: http://localhost:${PORT}/tools`);
  console.log(`Tool call endpoint: http://localhost:${PORT}/tools/call`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down MCP HTTP Server...');
  process.exit(0);
});
