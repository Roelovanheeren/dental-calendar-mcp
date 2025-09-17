#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
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
    const mcpProcess = spawn('node', [join(__dirname, 'elevenlabs-mcp-server.js')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
      cwd: __dirname
    });

    let stdout = '';
    let stderr = '';

    mcpProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    mcpProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    mcpProcess.on('close', (code) => {
      if (code === 0) {
        try {
          // MCP responses are JSON-RPC format
          const lines = stdout.trim().split('\n');
          const lastLine = lines[lines.length - 1];
          resolve(JSON.parse(lastLine));
        } catch (e) {
          reject(new Error(`Failed to parse MCP server response: ${e.message}. Raw: ${stdout}`));
        }
      } else {
        reject(new Error(`MCP server exited with code ${code}. Stderr: ${stderr}`));
      }
    });

    // Send JSON-RPC request
    mcpProcess.stdin.write(JSON.stringify(request) + '\n');
    mcpProcess.stdin.end();
  });
}

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

// MCP tools endpoint - ElevenLabs compatible
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

// MCP tool call endpoint - ElevenLabs compatible
app.post('/tools/call', validateSecret, async (req, res) => {
  try {
    const { name, arguments: args } = req.body;

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: name,
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

// ElevenLabs specific endpoints
app.get('/mcp/tools', validateSecret, async (req, res) => {
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
    console.error('Error listing MCP tools:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/mcp/call', validateSecret, async (req, res) => {
  try {
    const { name, arguments: args } = req.body;

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: name,
        arguments: args
      }
    };
    const response = await callMCPServer(request);
    res.json(response);
  } catch (error) {
    console.error('Error calling MCP tool:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
console.log('Starting ElevenLabs MCP HTTP Server on port:', PORT);
console.log('Environment check - MCP_SECRET_TOKEN exists:', !!process.env.MCP_SECRET_TOKEN);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ ElevenLabs MCP HTTP Server running on port ${PORT}`);
  console.log(`✅ Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`✅ Tools endpoint: http://0.0.0.0:${PORT}/tools`);
  console.log(`✅ Tool call endpoint: http://0.0.0.0:${PORT}/tools/call`);
  console.log(`✅ MCP tools endpoint: http://0.0.0.0:${PORT}/mcp/tools`);
  console.log(`✅ MCP call endpoint: http://0.0.0.0:${PORT}/mcp/call`);
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
  console.log('\nShutting down ElevenLabs MCP HTTP Server...');
  process.exit(0);
});
