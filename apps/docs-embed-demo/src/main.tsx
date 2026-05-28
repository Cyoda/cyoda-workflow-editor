import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import "./app.css";

const root = document.getElementById("root");
if (!root) throw new Error("no root element");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
