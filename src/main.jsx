import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./theme.css";
import App from "./App.jsx";
import { registerAutoUpdate } from "./services/appUpdater";
import { publishBuildInfo } from "./services/buildInfo";
import { installGlobalErrorCapture } from "./components/ErrorBoundary";

// Installed before anything else renders so early boot failures are captured too.
installGlobalErrorCapture();
publishBuildInfo();
void registerAutoUpdate();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <div className="sc-app">
      <App />
    </div>
  </StrictMode>,
);
