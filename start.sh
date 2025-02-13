#!/bin/bash
# Init script for Docker container

# Run migrations
npm run db:migrate

# Run daemon
dotenvx run -- node dist/index.js