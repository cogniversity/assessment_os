import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import CandidateDashboard from "./pages/candidate/Dashboard";
import CandidateProfile from "./pages/candidate/Profile";
import AssessmentPage from "./pages/candidate/AssessmentPage";
import AdminLayout from "./pages/admin/AdminLayout";
import ManagerLayout from "./pages/manager/ManagerLayout";
import VerifyCertificate from "./pages/VerifyCertificate";

function Protected({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (user.role === "capability_manager") return <Navigate to="/manager" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<HomeRedirect />} />
        <Route
          path="/dashboard"
          element={
            <Protected roles={["candidate"]}>
              <CandidateDashboard />
            </Protected>
          }
        />
        <Route
          path="/profile"
          element={
            <Protected>
              <CandidateProfile />
            </Protected>
          }
        />
        <Route
          path="/assessment/:id"
          element={
            <Protected roles={["candidate"]}>
              <AssessmentPage />
            </Protected>
          }
        />
        <Route
          path="/admin/*"
          element={
            <Protected roles={["admin"]}>
              <AdminLayout />
            </Protected>
          }
        />
        <Route
          path="/manager/*"
          element={
            <Protected roles={["admin", "capability_manager"]}>
              <ManagerLayout />
            </Protected>
          }
        />
        <Route
          path="/verify/:certNumber"
          element={
            <Protected>
              <VerifyCertificate />
            </Protected>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
