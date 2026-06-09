import { useParams } from "react-router-dom";
import ManageCandidateProfile from "../shared/ManageCandidateProfile";

export default function AdminCandidateDetail() {
  const { userId } = useParams();
  if (!userId) return null;
  return (
    <ManageCandidateProfile
      userId={userId}
      backTo="/admin/users"
      backLabel="Users"
    />
  );
}
