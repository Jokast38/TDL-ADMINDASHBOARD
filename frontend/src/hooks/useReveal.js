import { useCallback, useRef } from "react";

// Adds "reveal-visible" to any [data-reveal] element inside the container once it enters the viewport.
// Uses a callback ref (not useRef + useEffect) because pages often mount the
// container only after an async load (loading screen -> real content): a plain
// useEffect with an empty deps array would run once against a still-null ref
// and never observe anything.
export function useReveal() {
  const cleanupRef = useRef(null);

  const attach = useCallback((root) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (!root) return;

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-visible");
            intersectionObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    const observe = (nodes) => nodes.forEach((el) => intersectionObserver.observe(el));
    observe(root.querySelectorAll("[data-reveal]"));

    // Content added later (further async loads, route-level state changes) is
    // still picked up.
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches?.("[data-reveal]")) observe([node]);
          observe(node.querySelectorAll?.("[data-reveal]") || []);
        });
      });
    });
    mutationObserver.observe(root, { childList: true, subtree: true });

    cleanupRef.current = () => {
      intersectionObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return attach;
}
