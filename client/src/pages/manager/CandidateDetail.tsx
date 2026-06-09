import { useParams } from "react-router-dom";
import ManageCandidateProfile from "../shared/ManageCandidateProfile";

export default function CandidateDetail() {
  const { userId } = useParams();
  if (!userId) return null;
  return (
    <ManageCandidateProfile
      userId={userId}
      backTo="/manager/candidates"
      backLabel="Candidates"
    />
  );
}
