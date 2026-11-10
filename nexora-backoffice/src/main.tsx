import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./infrastructure/query-cache";
import React from "react";
import { BrowserRouter } from "react-router-dom";
import { createRoot } from "react-dom/client";
import { App } from "./presentation/App";
import "bootstrap/dist/css/bootstrap-grid.min.css";
import "./presentation/styles.scss";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
