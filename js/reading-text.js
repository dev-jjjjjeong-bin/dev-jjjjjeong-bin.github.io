// Preserve short reading units without interpreting text as HTML.
export function setReadingText(element, text) {
  element.textContent = "";
  const parts = String(text).split(/(0\d{1,2}-\d{3,4}-\d{4}|\d{1,2}:\d{2}[–~-]\d{1,2}:\d{2}|\d+:\d+|\d{4}[.-]\d{1,2}[.-]\d{1,2}|\d[\d,]*(?:원|분|층|호)|산전\/산후|전·후)/g);
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    const span = document.createElement("span");
    span.textContent = parts[i];
    if (i % 2) span.className = "reading-unit";
    element.append(span);
  }
  return element;
}
