import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

document.addEventListener("contextmenu", (e) => {
  if ((e.target as HTMLElement).tagName === "IMG") {
    e.preventDefault();
  }
});

document.addEventListener("dragstart", (e) => {
  if ((e.target as HTMLElement).tagName === "IMG") {
    e.preventDefault();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
