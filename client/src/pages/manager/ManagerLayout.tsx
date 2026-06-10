import { Routes, Route, Navigate } from "react-router-dom";
import { SidebarLayout } from "../../components/Layout";
import ManagerHome from "./ManagerHome";
import CandidatesPage from "./CandidatesPage";
import ManagerAssignments from "./ManagerAssignments";
import ManagerResults from "./ManagerResults";
import ManagerAnalytics from "./ManagerAnalytics";
import CandidateDetail from "./CandidateDetail";
import QuestionsPage from "../admin/QuestionsPage";
import BlueprintsPage from "../admin/BlueprintsPage";
import { LayoutDashboard, Users, ClipboardList, BarChart2, LineChart, RotateCcw, HelpCircle, Layers } from "lucide-react";
import ReattemptRequestsPage from "./ReattemptRequestsPage";
import AttemptDetailPage from "../shared/AttemptDetailPage";

const navGroups = [
  {
    label: "Overview",
    items: [
      { to: "/manager", label: "Dashboard", icon: <LayoutDashboard size={16} /> },
    ],
  },
  {
    label: "Candidates",
    items: [
      { to: "/manager/candidates", label: "Candidates", icon: <Users size={16} /> },
    ],
  },
  {
    label: "Content",
    items: [
      { to: "/manager/questions", label: "Question Bank", icon: <HelpCircle size={16} /> },
      { to: "/manager/blueprints", label: "Blueprints", icon: <Layers size={16} /> },
    ],
  },
  {
    label: "Assessments",
    items: [
      { to: "/manager/assign", label: "Assign", icon: <ClipboardList size={16} /> },
      { to: "/manager/reattempts", label: "Reattempts", icon: <RotateCcw size={16} /> },
      { to: "/manager/results", label: "Results", icon: <BarChart2 size={16} /> },
      { to: "/manager/analytics", label: "Analytics", icon: <LineChart size={16} /> },
    ],
  },
];

export default function ManagerLayout() {
  return (
    <SidebarLayout groups={navGroups}>
      <Routes>
        <Route index element={<ManagerHome />} />
        <Route path="candidates" element={<CandidatesPage />} />
        <Route path="candidates/:userId" element={<CandidateDetail />} />
        <Route path="questions" element={<QuestionsPage />} />
        <Route path="blueprints" element={<BlueprintsPage />} />
        <Route path="assign" element={<ManagerAssignments />} />
        <Route path="reattempts" element={<ReattemptRequestsPage />} />
        <Route path="results" element={<ManagerResults />} />
        <Route path="results/:attemptId" element={<AttemptDetailPage />} />
        <Route path="analytics" element={<ManagerAnalytics />} />
        <Route path="*" element={<Navigate to="/manager" replace />} />
      </Routes>
    </SidebarLayout>
  );
}
