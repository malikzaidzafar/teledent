"use client";
import { useEffect } from "react";

export default function StripeToolbarKiller() {
  useEffect(() => {
    function forceHide(el: Element) {
      const h = el as HTMLElement;
      h.style.setProperty("display", "none", "important");
      h.style.setProperty("visibility", "hidden", "important");
      h.style.setProperty("pointer-events", "none", "important");
    }

    function kill() {
      // Hide the button and walk up to its body-level container
      document.querySelectorAll('[aria-label="Open Stripe Developer Tools"]').forEach(btn => {
        forceHide(btn);
        let node: Element = btn;
        while (node.parentElement && node.parentElement !== document.body) {
          node = node.parentElement;
        }
        forceHide(node);
      });
      // Also catch any div whose class attribute contains __Easel
      document.querySelectorAll("div[class*='__Easel']").forEach(el => {
        forceHide(el);
        if (el.parentElement) forceHide(el.parentElement);
      });
    }

    kill();
    const obs = new MutationObserver(kill);
    obs.observe(document.body, { childList: true, subtree: true });
    // Poll every 200 ms for the first 60 s
    const t = setInterval(kill, 200);
    setTimeout(() => clearInterval(t), 60_000);

    return () => { obs.disconnect(); clearInterval(t); };
  }, []);

  return null;
}
