
PAYLOAD=${1:-/tmp/single_attendance.json}
curl -i -X POST "https://school-discipline.runasp.net/api/Attendance" \
  -H "Content-Type: application/json" \
  -d @"${PAYLOAD}"
