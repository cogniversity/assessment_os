import { Card, Button } from "../../components/Layout";
import { downloadUrl } from "../../api/client";
import { Link } from "react-router-dom";

export default function ManagerHome() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Capability Manager</h1>
      <Card>
        <p className="text-slate-600 mb-4">Assign assessments, manage candidate profiles, and review results.</p>
        <a href={downloadUrl("/question-import/template.xlsx")}>
          <Button variant="secondary">Download question template</Button>
        </a>
        <Link to="/manager/assign" className="ml-2 inline-block">
          <Button>Assign assessment</Button>
        </Link>
      </Card>
    </div>
  );
}
