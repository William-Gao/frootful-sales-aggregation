#!/bin/bash

# Test script for process-intake-event function
# Usage: ./test-process-intake-event.sh [local|remote] [intake_event_id]

ENVIRONMENT=${1:-local}
INTAKE_EVENT_ID=${2}

if [ "$ENVIRONMENT" = "local" ]; then
  BASE_URL="http://localhost:54321"
  # Get anon key from supabase status
  ANON_KEY=$(npx supabase status | grep "anon key" | awk '{print $3}')
else
  BASE_URL="https://zkglvdfppodwlgzhfgqs.supabase.co"
  # You'll need to set this in your environment or replace it
  ANON_KEY=${SUPABASE_ANON_KEY}
fi

if [ -z "$INTAKE_EVENT_ID" ]; then
  echo "Error: Please provide an intake_event_id"
  echo "Usage: ./test-process-intake-event.sh [local|remote] [intake_event_id]"
  exit 1
fi

echo "Testing process-intake-event..."
echo "Environment: $ENVIRONMENT"
echo "Intake Event ID: $INTAKE_EVENT_ID"
echo ""

curl -X POST \
  "$BASE_URL/functions/v1/process-intake-event" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d "{\"intakeEventId\": \"$INTAKE_EVENT_ID\"}" \
  | jq .

echo ""
echo "Done!"
