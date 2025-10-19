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

axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL;

createRoot(document.getElementById("root")).render(
  <ReportsProvider>
    <StudentProvider>
      <ClassProvider>
        <BehaviorProvider>
          <AttendanceProvider>
            <RouterProvider router={router}>
              <App />
            </RouterProvider>
          </AttendanceProvider>
        </BehaviorProvider>
      </ClassProvider>
    </StudentProvider>
  </ReportsProvider>
);
