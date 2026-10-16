(() => {
    const buttons = Array.from(document.querySelectorAll(".review-img-box"));
    // A grouped card opens its main photo, followed by its companion photo.
    const images = [];
    const firstImageIndex = new Map();
    buttons.forEach((button) => {
        const image = button.querySelector("img");
        firstImageIndex.set(button, images.length);
        images.push({ src: image.currentSrc || image.src, alt: image.alt });
        if (button.dataset.reviewExtraSrc) {
            images.push({ src: button.dataset.reviewExtraSrc, alt: button.dataset.reviewExtraAlt || image.alt });
        }
    });
    const modal = document.getElementById("img-modal");
    const photo = document.getElementById("img-modal-img");
    const viewport = document.getElementById("img-modal-viewport");
    const closeButton = document.getElementById("img-modal-close");
    const prevButton = document.getElementById("img-prev");
    const nextButton = document.getElementById("img-next");
    const zoomButton = document.getElementById("img-zoom");
    const counter = document.getElementById("img-count");
    const status = document.getElementById("img-modal-status");
    let currentIndex = 0;
    let opener = null;

    function resetZoom() {
        viewport.classList.remove("is-zoomed");
        viewport.style.removeProperty("--review-zoom-width");
        zoomButton.textContent = "확대해서 보기";
        zoomButton.setAttribute("aria-pressed", "false");
        viewport.scrollTop = 0;
        viewport.scrollLeft = 0;
    }

    function showImage(index) {
        currentIndex = index;
        resetZoom();
        zoomButton.disabled = true;
        viewport.classList.remove("has-error");
        viewport.classList.add("is-loading");
        status.hidden = false;
        status.textContent = "사진을 불러오는 중입니다.";
        photo.src = images[index].src;
        photo.alt = images[index].alt;
        counter.textContent = `${index + 1} / ${images.length}`;
        prevButton.disabled = index === 0;
        nextButton.disabled = index === images.length - 1;
    }

    photo.addEventListener("load", () => {
        viewport.classList.remove("is-loading", "has-error");
        status.hidden = true;
        zoomButton.disabled = false;
    });
    photo.addEventListener("error", () => {
        if (!modal.open) return;
        viewport.classList.remove("is-loading");
        viewport.classList.add("has-error");
        zoomButton.disabled = true;
        status.hidden = false;
        status.textContent = "사진을 불러오지 못했습니다. 다른 사진을 선택하거나 다시 열어주세요.";
    });

    function updateZoomSize() {
        if (!photo.naturalWidth || !photo.naturalHeight) return;
        const fittedWidth = Math.min(viewport.clientWidth,
            viewport.clientHeight * photo.naturalWidth / photo.naturalHeight);
        // Long reviews expand to at least the viewport width for readable text.
        const width = Math.max(viewport.clientWidth, fittedWidth * 2);
        viewport.style.setProperty("--review-zoom-width", `${Math.ceil(width)}px`);
    }
    if (typeof ResizeObserver !== "undefined") {
        new ResizeObserver(() => {
            if (modal.open && viewport.classList.contains("is-zoomed")) updateZoomSize();
        }).observe(viewport);
    } else {
        window.addEventListener("resize", () => {
            if (modal.open && viewport.classList.contains("is-zoomed")) updateZoomSize();
        });
    }
    buttons.forEach((button) => {
        button.addEventListener("click", () => {
        const index = firstImageIndex.get(button);
        // 오래된 브라우저에서도 원본 이미지로 이동해 후기를 읽을 수 있습니다.
        if (typeof modal.showModal !== "function") {
            window.location.assign(images[index].src);
            return;
        }
        opener = button;
        showImage(index);
        modal.showModal();
        document.documentElement.classList.add("review-modal-open");
        closeButton.focus();
        });
    });
    closeButton.addEventListener("click", () => modal.close());
    modal.addEventListener("close", () => {
        document.documentElement.classList.remove("review-modal-open");
        resetZoom();
        photo.removeAttribute("src");
        status.hidden = true;
        viewport.classList.remove("is-loading", "has-error");
        if (opener) opener.focus({ preventScroll: true });
    });
    modal.addEventListener("click", (event) => {
        if (event.target === modal) modal.close();
    });
    prevButton.addEventListener("click", () => {
        if (currentIndex > 0) showImage(currentIndex - 1);
    });
    nextButton.addEventListener("click", () => {
        if (currentIndex < images.length - 1) showImage(currentIndex + 1);
    });
    zoomButton.addEventListener("click", () => {
        if (viewport.classList.contains("is-zoomed")) {
        resetZoom();
        } else {
        viewport.classList.add("is-zoomed");
        updateZoomSize();
        viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
        viewport.scrollTop = 0;
        zoomButton.textContent = "사진 전체 보기";
        zoomButton.setAttribute("aria-pressed", "true");
        viewport.focus();
        }
    });
    modal.addEventListener("keydown", (event) => {
        // 원본 확대 중에는 방향키로 이미지 안을 스크롤
        if (viewport.classList.contains("is-zoomed")) return;
        if (event.key === "ArrowLeft" && currentIndex > 0) {
        event.preventDefault();
        showImage(currentIndex - 1);
        } else if (event.key === "ArrowRight" && currentIndex < images.length - 1) {
        event.preventDefault();
        showImage(currentIndex + 1);
        }
    });
})();
