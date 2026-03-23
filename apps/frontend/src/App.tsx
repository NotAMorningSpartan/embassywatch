import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import USWDSLayout from "./components/USWDSLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import EmbassiesPage from "./pages/EmbassiesPage";
import EmbassyDetailPage from "./pages/EmbassyDetailPage";
import AdminPage from "./pages/AdminPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<USWDSLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/embassies" element={<EmbassiesPage />} />
            <Route path="/embassies/:id" element={<EmbassyDetailPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
