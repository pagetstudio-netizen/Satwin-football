/**
 * Global clipboard copy helper.
 * Calls the AlertModal via toast() on every copy action.
 */
import { toast } from "@/hooks/use-toast";

export async function copyToClipboard(text: string, label = "Copié !") {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: label, description: text.length > 60 ? text.slice(0, 60) + "…" : text });
  } catch {
    // fallback for older browsers / HTTP
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    toast({ title: label, description: text.length > 60 ? text.slice(0, 60) + "…" : text });
  }
}
