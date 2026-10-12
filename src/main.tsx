import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./App";
import { Overlay } from "./views/Overlay";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

// The transparent overlay window renders only the status pill;
// the main window renders the dashboard.
const label = getCurrentWindow().label;
root.render(
  <React.StrictMode>
    {label === "overlay" ? <Overlay /> : <App />}
  </React.StrictMode>,
);
