import React from "react";
import { createRoot } from "react-dom/client";
import SYN from "../../synonyms.json";
import { setGroups } from "./ml.js";
import App from "./App.jsx";
import "./styles.css";

setGroups(SYN);
createRoot(document.getElementById("root")).render(<App />);
