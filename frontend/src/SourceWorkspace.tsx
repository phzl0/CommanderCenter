import { useState } from "react";
import ApplicationSettings from "./ApplicationSettings";
import Sources from "./Sources";
import AccountConnection from "./AccountConnection";
export default function SourceWorkspace({
  initialTab = "sources",
}: {
  initialTab?: string;
}) {
  const [tab, setTab] = useState(initialTab);
  return (
    <>
      <div className="segment data-tabs">
        <button
          className={tab === "sources" ? "active" : ""}
          onClick={() => setTab("sources")}
        >
          Fontes
        </button>
        <button
          className={tab === "connections" ? "active" : ""}
          onClick={() => setTab("connections")}
        >
          Conexões
        </button>
      </div>
      {tab === "sources" ? (
        <Sources />
      ) : (
        <>
          <div className="page-heading">
            <h1>Fontes e conexões</h1>
          </div>
          <ApplicationSettings />
          <div className="connections-grid">
            <AccountConnection provider="github" />
            <AccountConnection provider="microsoft" />
            <AccountConnection provider="google" />
          </div>
        </>
      )}
    </>
  );
}
