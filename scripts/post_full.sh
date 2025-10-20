#!/usr/bin/env bash
# POST a full attendance payload to the live API
# Usage: ./post_full.sh /path/to/payload.json
PAYLOAD=${1:-/tmp/attendance_payload.json}
curl -i -X POST "https://school-discipline.runasp.net/api/Attendance" \
  -H "Content-Type: application/json" \
  -d @"${PAYLOAD}"
