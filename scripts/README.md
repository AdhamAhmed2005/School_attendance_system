POST scripts

Usage

- post_single.sh /path/to/payload.json
- post_full.sh /path/to/payload.json

These scripts POST the provided JSON file to the live Attendance endpoint. They are useful for reproducing server errors outside the browser (Postman or curl).

Example:

```bash
chmod +x scripts/*.sh
./scripts/post_single.sh /tmp/single_attendance.json
```
