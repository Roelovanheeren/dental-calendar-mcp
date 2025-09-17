#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Change to the project directory
cd "$SCRIPT_DIR"

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Run the server
exec node -r dotenv/config dist/index.js
