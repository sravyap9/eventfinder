// Scroll reveal: adds the class "in" to elements with class "reveal" as they enter the viewport (see ui/components.css).
// One shared IntersectionObserver for the whole page. Elements are released after they reveal, so it never re-fires.

let observer = null;
const show = (el) => el.classList.add("in");

function get() {
  if (observer) return observer;
  observer = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { show(en.target); observer.unobserve(en.target); }
  }, { threshold: 0.06, rootMargin: "0px 0px -6% 0px" });
  return observer;
}

// Watch one element (React: call from an effect on mount).
export function watch(el) {
  if (!el || el.classList.contains("in")) return;
  if (typeof IntersectionObserver === "undefined") return show(el);   // old browser: just show it
  get().observe(el);
  setTimeout(() => show(el), 1500);                                   // safety net: content is never left hidden
}

// Watch every .reveal under root (classic page: call after rendering the list).
export function revealAll(root = document) { root.querySelectorAll(".reveal:not(.in)").forEach(watch); }
