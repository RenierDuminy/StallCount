import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./theme.css";
import App from "./App.jsx";

async function initPwa() {
  if ("serviceWorker" in navigator) {
    const registerSW = (await import("virtual:pwa-register")).registerSW;
    registerSW({
      immediate: true,
      onRegistered(registration) {
        if (registration && registration.update) {
          registration.update();
        }
      },
    });
  }
}

void initPwa();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <div className="sc-app">
      <App />
    </div>
  </StrictMode>,
);
