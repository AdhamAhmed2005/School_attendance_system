import { createBrowserRouter } from "react-router-dom";
import App from "@/App";
import Attendance from "@/pages/attendance/Attendance";
import Behavior from "@/pages/behavior/Behavior";
import Reports from "@/pages/reports/Reports";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        index: true,
        element: <Attendance />,
      },
      {
        path: "attendance",
        element: <Attendance />,
      },
      {
        path: "behavior",
        element: <Behavior />,
      },
      {
        path: "reports",
        element: <Reports />,
      },
    ],
  },
]);

export default router;
