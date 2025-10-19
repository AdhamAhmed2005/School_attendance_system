import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Footer from "./components/Footer";
import Controls from "./components/Controls";
import Navbar from "./components/Navbar";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import { AlertTriangle, Calendar, FileText } from "lucide-react";
import { Toaster } from "./components/ui/sonner";

function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const handleTabChange = (value) => {
    navigate(value);
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <Navbar />
        <div className="container mx-auto px-4 py-6">
          <Controls />
          <Tabs value={pathname} onValueChange={handleTabChange} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 lg:w-[600px] mx-auto">
              <TabsTrigger value="/attendance" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                الحضور والغياب
              </TabsTrigger>
              <TabsTrigger value="/behavior" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                السلوك
              </TabsTrigger>
              <TabsTrigger value="/reports" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                التقارير
              </TabsTrigger>
            </TabsList>
            {/* (attendance - behavior - reports) pages */}
            <Outlet />
          </Tabs>
        </div>
        <Footer />
      </div>
      <Toaster position="top-center" />
    </>
  );
}

export default App;
