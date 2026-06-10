import { Routes, Route, Navigate } from "react-router-dom";
import { SidebarLayout } from "../../components/Layout";
import AdminHome from "./AdminHome";
import ManagerSkillsPage from "./ManagerSkillsPage";
import ManagerQuestionBanksPage from "./ManagerQuestionBanksPage";
import CategoriesPage from "./CategoriesPage";
import SkillsPage from "./SkillsPage";
import TopicsPage from "./TopicsPage";
import QuestionsPage from "./QuestionsPage";
import UsersPage from "./UsersPage";
import AssignmentsPage from "./AssignmentsPage";
import ResultsPage from "./ResultsPage";
import AnalyticsPage from "./AnalyticsPage";
import DataTransferPage from "./DataTransferPage";
import ProfileFieldsPage from "./ProfileFieldsPage";
import BlueprintsPage from "./BlueprintsPage";
import AppIdUsersPage from "./AppIdUsersPage";
import AdminCandidateDetail from "./AdminCandidateDetail";
import ReattemptRequestsPage from "../manager/ReattemptRequestsPage";
import AttemptDetailPage from "../shared/AttemptDetailPage";
import {
  LayoutDashboard,
  Tag,
  FolderOpen,
  BookOpen,
  HelpCircle,
  Upload,
  Users,
  ClipboardList,
  BarChart2,
  LineChart,
  Settings,
  Layers,
  Cloud,
  UserCircle,
  RotateCcw,
  ShieldCheck,
  Library,
} from "lucide-react";

const navGroups = [
  {
    label: "Overview",
    items: [
      { to: "/admin", label: "Dashboard", icon: <LayoutDashboard size={16} /> },
    ],
  },
  {
    label: "Question Bank",
    items: [
      { to: "/admin/skills", label: "Skills", icon: <Tag size={16} /> },
      { to: "/admin/categories", label: "Categories", icon: <FolderOpen size={16} /> },
      { to: "/admin/topics", label: "Topics", icon: <BookOpen size={16} /> },
      { to: "/admin/questions", label: "Questions", icon: <HelpCircle size={16} /> },
      { to: "/admin/export-import", label: "Export / Import", icon: <Upload size={16} /> },
    ],
  },
  {
    label: "Assessments",
    items: [
      { to: "/admin/blueprints", label: "Blueprints", icon: <Layers size={16} /> },
      { to: "/admin/assignments", label: "Assign", icon: <ClipboardList size={16} /> },
      { to: "/admin/reattempts", label: "Reattempts", icon: <RotateCcw size={16} /> },
      { to: "/admin/results", label: "Results", icon: <BarChart2 size={16} /> },
      { to: "/admin/analytics", label: "Analytics", icon: <LineChart size={16} /> },
    ],
  },
  {
    label: "Admin",
    items: [
      { to: "/admin/users", label: "Users", icon: <Users size={16} /> },
      { to: "/admin/appid-users", label: "App ID Users", icon: <Cloud size={16} /> },
      { to: "/admin/manager-skills", label: "Manager Skills", icon: <ShieldCheck size={16} /> },
      { to: "/admin/manager-question-banks", label: "Manager Question Banks", icon: <Library size={16} /> },
      { to: "/profile", label: "My profile", icon: <UserCircle size={16} /> },
      { to: "/admin/profile-fields", label: "Profile Fields", icon: <Settings size={16} /> },
    ],
  },
];

export default function AdminLayout() {
  return (
    <SidebarLayout groups={navGroups}>
      <Routes>
        <Route index element={<AdminHome />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="topics" element={<TopicsPage />} />
        <Route path="questions" element={<QuestionsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="candidates/:userId" element={<AdminCandidateDetail />} />
        <Route path="blueprints" element={<BlueprintsPage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="reattempts" element={<ReattemptRequestsPage />} />
        <Route path="appid-users" element={<AppIdUsersPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="results/:attemptId" element={<AttemptDetailPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="export-import" element={<DataTransferPage />} />
        <Route path="import" element={<DataTransferPage />} />
        <Route path="profile-fields" element={<ProfileFieldsPage />} />
        <Route path="manager-skills" element={<ManagerSkillsPage />} />
        <Route path="manager-question-banks" element={<ManagerQuestionBanksPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </SidebarLayout>
  );
}
