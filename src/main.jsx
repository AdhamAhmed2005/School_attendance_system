import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { RouterProvider } from "react-router";
import router from "./router/router";
import axios from "axios";
import { AttendanceProvider } from "./contexts/AttendanceContext";
import { BehaviorProvider } from "./contexts/BehaviorContext";
import { ClassProvider } from "./contexts/ClassContext";
import { StudentProvider } from "./contexts/StudentContext";
import { ReportsProvider } from "./contexts/ReportsContext";
import { AuthProvider } from "./contexts/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";

// If VITE_API_BASE_URL is provided, use it. Otherwise in dev use a relative '/api' so
// the Vite dev server proxy can forward requests and avoid CORS. In production
// fall back to the real backend URL.
const rawBase = import.meta.env.VITE_API_BASE_URL ?? "";
let normalizedBase = "";
if (rawBase && rawBase.length > 0) {
  normalizedBase = rawBase.endsWith("/api") ? rawBase.replace(/\/$/, "") : rawBase.replace(/\/$/, "") + "/api";
} else if (import.meta.env.DEV) {
  // development: use relative path so Vite proxy (server.proxy) handles /api
  normalizedBase = "/api";
} else {
  // production fallback
  normalizedBase = "https://school-discipline.runasp.net/api";
}
axios.defaults.baseURL = normalizedBase;

if (import.meta.env.DEV) {
  // Helpful runtime info for developers to confirm proxying is active
  // Open the browser console and look for this message when the app starts
  // so you can confirm requests will go to the Vite dev server at /api
  // instead of directly to the remote host.
  // eslint-disable-next-line no-console
  console.info("axios baseURL:", axios.defaults.baseURL);
}

createRoot(document.getElementById("root")).render(
  <AuthProvider>
    <ReportsProvider>
      <StudentProvider>
        <ClassProvider>
          <BehaviorProvider>
            <AttendanceProvider>
              <ErrorBoundary>
                <RouterProvider router={router}>
                  <App />
                </RouterProvider>
              </ErrorBoundary>
            </AttendanceProvider>
          </BehaviorProvider>
        </ClassProvider>
      </StudentProvider>
    </ReportsProvider>
  </AuthProvider>
);
