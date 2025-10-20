Local dev CORS verification and fixes

This file documents how to verify and fix CORS issues when developing locally.

1) Goal
- Ensure the frontend at http://localhost:3000 can call the remote API (https://school-discipline.runasp.net) without browser CORS errors during development.

2) What I changed in the repo
- `vite.config.js`: added a `server.proxy` entry to forward `/api` to `https://school-discipline.runasp.net`.
- `src/main.jsx`: in development (`import.meta.env.DEV`) axios.defaults.baseURL is set to `/api` (relative path).
- Added a small console.info to print `axios baseURL` in dev so you can confirm the runtime base URL.

3) How to run locally (recommended)

Install dependencies and start dev server:

```bash
npm install
npm run dev
```

Open http://localhost:3000 in the browser. Open DevTools → Console and verify you see:

```
axios baseURL: /api
```

4) Confirm proxying and no CORS errors
- In DevTools → Network, filter for `/api`.
- Click "حفظ الحضور" to submit attendance. You should see a POST request to `http://localhost:3000/api/Attendance` and no CORS error in the console.
- Vite will proxy the request to the remote API. If the remote endpoint returns an error, you'll see the proxied response, but there will be no browser CORS block.

5) If you still see CORS errors
- Make sure `npm run dev` is running and you opened the app at `http://localhost:3000`.
- Ensure axios baseURL is `/api` in the console. If it is set to `https://...` the proxy won't be used; check that you don't have `VITE_API_BASE_URL` set in your env.
- If you want the real backend to accept cross-origin browser requests, ask the backend team to enable CORS (example snippet for ASP.NET Core is below).

ASP.NET Core CORS snippet to include in Program.cs

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowLocalDev",
        policy =>
        {
            policy.WithOrigins("http://localhost:3000")
                  .AllowAnyMethod()
                  .AllowAnyHeader()
                  .AllowCredentials();
        });
});

var app = builder.Build();
app.UseCors("AllowLocalDev");
app.MapControllers();
app.Run();
```

Notes
- Do not use `Access-Control-Allow-Origin: *` if you use credentials (cookies/auth headers).
- Always ensure preflight (OPTIONS) returns appropriate headers.

6) Reproducing and capturing server errors (500)

- In your app's browser console you should see a log like:

    axios baseURL: /api
    Posting attendance payload (preview): [ { studentId: 13, ... }, ... ]

- Copy the logged payload and use curl to POST directly to the live API to see the full server response (not subject to browser CORS):

```bash
curl -i -X POST "https://school-discipline.runasp.net/api/Attendance" \
    -H "Content-Type: application/json" \
    -d @/path/to/attendance_payload.json
```

- If the server responds with 500 and a (possibly empty) body, collect these:
    - HTTP status and response body
    - response headers
    - request payload that you sent

- If the server returns different behavior when proxied via Vite vs direct curl, note both responses and include the proxied request/response from the browser's Network tab.

