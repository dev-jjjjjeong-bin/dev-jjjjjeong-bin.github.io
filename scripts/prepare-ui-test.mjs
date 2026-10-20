import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const html = (await readFile(new URL("reservation.html", root), "utf8"))
  .replace("<head>", '<head><base href="../">')
  .replace('src="js/reservation.js"', 'src="tests/preview-fixture.js"')
  .replace('<main class="booking-main">', '<main class="booking-main"><p class="service-notice">로컬 테스트 화면입니다. 실제 예약은 접수되지 않습니다.</p>');
await writeFile(new URL("tests/ui-reservation.html", root), html);
console.log("Open /tests/ui-reservation.html on your local static preview server. Not included in dist.");
