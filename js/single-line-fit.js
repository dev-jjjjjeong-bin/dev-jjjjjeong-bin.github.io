(() => {
    const rows = Array.from(document.querySelectorAll("[data-fit-line]"));
    let frame;

    function fitLines() {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
        const scopes = new Set(
            rows
            .filter((row) => row.clientWidth > 0)
            .map((row) => row.closest("[data-fit-size-scope]"))
            .filter(Boolean),
        );
        scopes.forEach((scope) => scope.style.removeProperty("--fit-font-size"));
        rows.forEach((row) => {
            const text = row.querySelector(".single-line-text");
            text.style.removeProperty("font-size");
            const style = getComputedStyle(row);
            const available = row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            if (available <= 0) return; // 숨겨진 경력 패널은 다시 표시될 때 계산

            let size = parseFloat(getComputedStyle(text).fontSize);
            // 폰트와 아이콘의 실제 너비를 재측정해 넘치거나 잘리지 않게 맞춤
            for (let pass = 0; pass < 4; pass++) {
            const width = text.getBoundingClientRect().width;
            if (width <= available || width === 0) break;
            size *= (available / width) * 0.99;
            text.style.fontSize = `${size}px`;
            }
        });
        // 연락처 세 줄은 모두 들어가는 공통 글자 크기를 사용
        const groups = new Map();
        rows.forEach((row) => {
            const group = row.closest("[data-fit-group]");
            if (!group || row.clientWidth === 0) return;
            const text = row.querySelector(".single-line-text");
            const size = parseFloat(getComputedStyle(text).fontSize);
            if (!groups.has(group)) groups.set(group, { size, texts: [] });
            const entry = groups.get(group);
            entry.size = Math.min(entry.size, size);
            entry.texts.push(text);
        });
        groups.forEach(({ size, texts }) => {
            texts.forEach((text) => {
            text.style.fontSize = `${size}px`;
            });
        });
        // 한 줄로 맞춘 경력과 나머지 자격·경력 항목이 같은 크기를 상속
        const scopeSizes = new Map();
        rows.forEach((row) => {
            const scope = row.closest("[data-fit-size-scope]");
            if (!scope || row.clientWidth === 0) return;
            const text = row.querySelector(".single-line-text");
            const size = parseFloat(getComputedStyle(text).fontSize);
            scopeSizes.set(scope, Math.min(scopeSizes.get(scope) ?? Infinity, size));
        });
        scopeSizes.forEach((size, scope) => scope.style.setProperty("--fit-font-size", `${size}px`));
        rows.forEach((row) => {
            if (scopeSizes.has(row.closest("[data-fit-size-scope]"))) {
            row.querySelector(".single-line-text").style.removeProperty("font-size");
            }
        });
        });
    }

    fitLines();
    window.addEventListener("resize", fitLines);
    if (typeof ResizeObserver !== "undefined") {
        const widths = new WeakMap();
        const observer = new ResizeObserver((entries) => {
        let changed = false;
        entries.forEach((entry) => {
            if (widths.get(entry.target) !== entry.contentRect.width) {
            widths.set(entry.target, entry.contentRect.width);
            changed = true;
            }
        });
        if (changed) fitLines();
        });
        rows.forEach((row) => observer.observe(row));
    }
    if (document.fonts) {
        document.fonts.ready.then(fitLines);
        document.fonts.addEventListener("loadingdone", fitLines);
    }
})();