#!/usr/bin/env python3
"""
Debug MCP Server

A simple server that logs all requests to help debug what ElevenLabs is actually sending.
"""

import json
import os
from datetime import datetime
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import uvicorn

# Initialize FastAPI app
app = FastAPI(title="Debug MCP Server", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Debug MCP Server",
        "version": "1.0.0",
        "description": "Debug server to see what ElevenLabs sends",
        "endpoints": {
            "health": "/health",
            "debug": "/debug",
            "sse": "/sse",
            "mcp": "/mcp"
        }
    }

@app.get("/debug")
async def debug_info():
    """Debug information endpoint."""
    return {
        "message": "Debug server is running",
        "timestamp": datetime.now().isoformat(),
        "instructions": "Check the server logs to see what ElevenLabs sends"
    }

@app.get("/sse")
async def sse_debug():
    """SSE endpoint with debug logging."""
    async def event_generator():
        print(f"[DEBUG] SSE connection started at {datetime.now()}")
        yield f"data: {json.dumps({'type': 'connected', 'message': 'Debug SSE connected'})}\n\n"
        
        # Send a simple tools list
        tools_response = {
            "jsonrpc": "2.0",
            "method": "tools/list",
            "result": {
                "tools": [
                    {
                        "name": "test_tool",
                        "description": "A simple test tool",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "message": {"type": "string", "title": "Message"}
                            },
                            "required": ["message"]
                        }
                    }
                ]
            }
        }
        
        print(f"[DEBUG] Sending tools list: {json.dumps(tools_response, indent=2)}")
        yield f"data: {json.dumps(tools_response)}\n\n"
        
        # Keep connection alive
        while True:
            await asyncio.sleep(30)
            ping_data = {'type': 'ping', 'timestamp': datetime.now().isoformat()}
            print(f"[DEBUG] Sending ping: {ping_data}")
            yield f"data: {json.dumps(ping_data)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

@app.post("/mcp")
async def mcp_debug(request: Request):
    """MCP endpoint with debug logging."""
    try:
        body = await request.json()
        print(f"[DEBUG] MCP request received: {json.dumps(body, indent=2)}")
        
        method = body.get("method")
        print(f"[DEBUG] Method: {method}")
        
        if method == "initialize":
            response = {
                "jsonrpc": "2.0",
                "id": body.get("id"),
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "experimental": {},
                        "prompts": {"listChanged": False},
                        "resources": {"subscribe": False, "listChanged": False},
                        "tools": {"listChanged": False}
                    },
                    "serverInfo": {
                        "name": "DebugMCP",
                        "version": "1.0.0"
                    }
                }
            }
            print(f"[DEBUG] Sending initialize response: {json.dumps(response, indent=2)}")
            return response
        
        elif method == "tools/list":
            response = {
                "jsonrpc": "2.0",
                "id": body.get("id"),
                "result": {
                    "tools": [
                        {
                            "name": "test_tool",
                            "description": "A simple test tool",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "message": {"type": "string", "title": "Message"}
                                },
                                "required": ["message"]
                            }
                        }
                    ]
                }
            }
            print(f"[DEBUG] Sending tools list response: {json.dumps(response, indent=2)}")
            return response
        
        else:
            response = {
                "jsonrpc": "2.0",
                "id": body.get("id"),
                "error": {
                    "code": -32601,
                    "message": f"Method not found: {method}"
                }
            }
            print(f"[DEBUG] Sending error response: {json.dumps(response, indent=2)}")
            return response
    
    except Exception as e:
        print(f"[DEBUG] Error processing request: {e}")
        return {
            "jsonrpc": "2.0",
            "id": body.get("id") if 'body' in locals() else None,
            "error": {
                "code": -32603,
                "message": f"Internal error: {str(e)}"
            }
        }

# Catch all other requests
@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def catch_all(request: Request, path: str):
    """Catch all requests for debugging."""
    print(f"[DEBUG] {request.method} request to /{path}")
    print(f"[DEBUG] Headers: {dict(request.headers)}")
    
    try:
        if request.method in ["POST", "PUT"]:
            body = await request.json()
            print(f"[DEBUG] Body: {json.dumps(body, indent=2)}")
    except:
        print(f"[DEBUG] Could not parse body as JSON")
    
    return {
        "message": f"Debug: {request.method} request to /{path}",
        "timestamp": datetime.now().isoformat(),
        "headers": dict(request.headers)
    }

if __name__ == "__main__":
    import asyncio
    port = int(os.getenv("PORT", 8000))
    print(f"[DEBUG] Starting debug server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
