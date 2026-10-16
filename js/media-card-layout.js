(() => {
  const lists = [...document.querySelectorAll('.media-list')];
  const sections = ['top', 'title', 'desc'];
  let frame;

  function alignCards() {
    for (const list of lists) {
      // Reset before measuring so heights can shrink after a resize.
      sections.forEach(section => list.style.removeProperty(`--media-${section}-height`));
      if (!window.matchMedia('(min-width: 768px)').matches) continue;
      const heights = sections.map(section => Math.ceil(Math.max(0,
        ...[...list.querySelectorAll(`.media-card-${section}`)]
          .map(element => element.getBoundingClientRect().height))));
      sections.forEach((section, index) =>
        list.style.setProperty(`--media-${section}-height`, `${heights[index]}px`));
    }
  }

  function scheduleAlignment() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(alignCards);
  }
  window.addEventListener('resize', scheduleAlignment);
  if (document.fonts) {
    document.fonts.ready.then(scheduleAlignment);
    document.fonts.addEventListener('loadingdone', scheduleAlignment);
  }
  if (typeof ResizeObserver !== 'undefined') {
    const widths = new WeakMap();
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (widths.get(entry.target) !== width) {
          widths.set(entry.target, width);
          scheduleAlignment();
        }
      }
    });
    lists.forEach(list => observer.observe(list));
  }
  scheduleAlignment();
})();
