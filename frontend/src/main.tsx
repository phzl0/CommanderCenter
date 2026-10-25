import { createRoot } from "react-dom/client";
import App from "./App";
import { NotificationHub } from "./Notifications";
import "./styles.css";
import "./dark.css";
import "./reading.css";
import "./contrast.css";
createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <NotificationHub />
  </>,
);
