#!/bin/sh
set -e

# Ensure the data directory is writable by the nextjs user
chown nextjs:nodejs /app/data

exec su-exec nextjs node server.js
