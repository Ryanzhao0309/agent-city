import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { installBrowserZoomGuard } from "./utils/browserZoomGuard";

installBrowserZoomGuard();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
