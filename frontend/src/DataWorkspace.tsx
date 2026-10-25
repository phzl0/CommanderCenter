import { useState } from "react";
import { DataLab } from "./DataLab";
import { Reports } from "./Reports";
export default function DataWorkspace() {
  const [tab, setTab] = useState("files");
  return (
    <div className="data-workspace">
      <div className="segment data-tabs">
        <button
          className={tab === "files" ? "active" : ""}
          onClick={() => setTab("files")}
        >
          Arquivos e análises
        </button>
        <button
          className={tab === "reports" ? "active" : ""}
          onClick={() => setTab("reports")}
        >
          Relatórios
        </button>
      </div>
      {tab === "files" ? <DataLab /> : <Reports />}
    </div>
  );
}
