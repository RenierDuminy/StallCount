import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./theme.css";
import App from "./App.jsx";
import { registerAutoUpdate } from "./services/appUpdater";

void registerAutoUpdate();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <div className="sc-app">
      <App />
    </div>
  </StrictMode>,
);
