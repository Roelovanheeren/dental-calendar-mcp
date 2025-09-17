#!/usr/bin/env python3
"""
Test script for the Dental Calendar MCP Server
"""

import json
import subprocess
import sys

def test_mcp_server():
    """Test the MCP server by sending JSON-RPC requests"""
    
    # First initialize the server
    init_request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "test-client",
                "version": "1.0.0"
            }
        }
    }
    
    # Send initialized notification
    initialized_notification = {
        "jsonrpc": "2.0",
        "method": "notifications/initialized",
        "params": {}
    }
    
    # Then test tools/list request
    tools_request = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/list",
        "params": {}
    }
    
    print("Testing Dental Calendar MCP Server...")
    print("Sending initialize request...")
    
    try:
        # Start the MCP server process
        process = subprocess.Popen(
            [sys.executable, "dental-mcp-server.py"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        # Send all requests
        requests = json.dumps(init_request) + "\n" + json.dumps(initialized_notification) + "\n" + json.dumps(tools_request) + "\n"
        stdout, stderr = process.communicate(input=requests, timeout=10)
        
        print("Server output:")
        print(stdout)
        
        if stderr:
            print("Server errors:")
            print(stderr)
        
        # Parse the responses (multiple JSON objects on separate lines)
        if stdout.strip():
            try:
                lines = stdout.strip().split('\n')
                print(f"\nReceived {len(lines)} responses:")
                
                for i, line in enumerate(lines):
                    if line.strip():
                        response = json.loads(line)
                        print(f"\nResponse {i+1}:")
                        print(json.dumps(response, indent=2))
                        
                        if "result" in response and "tools" in response["result"]:
                            print(f"\n✅ Found {len(response['result']['tools'])} tools:")
                            for tool in response["result"]["tools"]:
                                print(f"  - {tool['name']}: {tool['description'][:100]}...")
                        elif "result" in response and "serverInfo" in response["result"]:
                            print(f"✅ Server initialized: {response['result']['serverInfo']['name']} v{response['result']['serverInfo']['version']}")
                    
            except json.JSONDecodeError as e:
                print(f"❌ Failed to parse JSON response: {e}")
        else:
            print("❌ No output from server")
            
    except subprocess.TimeoutExpired:
        print("❌ Server timed out")
        process.kill()
    except Exception as e:
        print(f"❌ Error testing server: {e}")

if __name__ == "__main__":
    test_mcp_server()
