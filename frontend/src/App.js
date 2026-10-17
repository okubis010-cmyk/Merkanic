import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import PortalLayout from "@/components/PortalLayout";
import LoginPage from "@/pages/LoginPage";
import LandingPage from "@/pages/LandingPage";
import WorkordersPage from "@/pages/WorkordersPage";
import VehiclesPage from "@/pages/VehiclesPage";
import VehicleFolderPage from "@/pages/VehicleFolderPage";
import NewWorkorderPage from "@/pages/NewWorkorderPage";
import WorkorderDetailPage from "@/pages/WorkorderDetailPage";
import UsersPage from "@/pages/UsersPage";
import AppointmentsPage from "@/pages/AppointmentsPage";

const Protected = ({ children, staff, admin }) => {
  const { user, isStaff } = useAuth();
  if (user === null) return <div className="p-10 text-slate-500">Laden…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (staff && !isStaff) return <Navigate to="/portaal" replace />;
  if (admin && user.role !== "beheerder") return <Navigate to="/portaal" replace />;
  return children;
};

const Home = () => {
  const { isStaff } = useAuth();
  return isStaff ? <WorkordersPage /> : <VehiclesPage />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/portaal" element={<Protected><PortalLayout /></Protected>}>
            <Route index element={<Home />} />
            <Route path="voertuigen" element={<Protected staff><VehiclesPage /></Protected>} />
            <Route path="voertuigen/:kenteken" element={<VehicleFolderPage />} />
            <Route path="werkorders/nieuw" element={<Protected staff><NewWorkorderPage /></Protected>} />
            <Route path="werkorders/:id" element={<WorkorderDetailPage />} />
            <Route path="afspraken" element={<AppointmentsPage />} />
            <Route path="gebruikers" element={<Protected admin><UsersPage /></Protected>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;
