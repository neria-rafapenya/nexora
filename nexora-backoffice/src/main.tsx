import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./presentation/App";
import "bootstrap/dist/css/bootstrap-grid.min.css";
import "./presentation/styles.scss";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
