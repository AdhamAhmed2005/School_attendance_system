import { createBrowserRouter } from "react-router-dom";
import App from "@/App";
import Attendance from "@/pages/attendance/Attendance";
import Behavior from "@/pages/behavior/Behavior";
import Reports from "@/pages/reports/Reports";
// Keep Login and ProtectedRoute files in the repo, but don't expose the login route or enforce protection
import Login from "@/pages/Login";
import ProtectedRoute from "@/router/ProtectedRoute";

const router = createBrowserRouter([
  // login route intentionally removed from public routes — Login page remains in the codebase
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Attendance /> },
      { path: "attendance", element: <Attendance /> },
      { path: "behavior", element: <Behavior /> },
      { path: "reports", element: <Reports /> },
    ],
  },
]);

export default router;
