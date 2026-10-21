export function scrollToApplication(heading, navbar, view = window) {
  const fixedHeader = navbar && ["sticky", "fixed"].includes(view.getComputedStyle(navbar).position);
  const offset = fixedHeader ? navbar.getBoundingClientRect().height : 0;
  heading.style.scrollMarginTop = `${Math.ceil(offset) + 16}px`;
  // Focus the heading without opening the mobile keyboard or hiding the section title.
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({
    behavior: view.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    block: "start",
  });
}
