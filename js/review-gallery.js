(() => {
    const buttons = Array.from(document.querySelectorAll(".review-img-box"));
    const images = buttons.map((button) => button.querySelector("img"));
    const modal = document.getElementById("img-modal");
    const photo = document.getElementById("img-modal-img");
    const viewport = document.getElementById("img-modal-viewport");
    const closeButton = document.getElementById("img-modal-close");
    const prevButton = document.getElementById("img-prev");
    const nextButton = document.getElementById("img-next");
    const zoomButton = document.getElementById("img-zoom");
    const counter = document.getElementById("img-count");
    let currentIndex = 0;
    let opener = null;

    function resetZoom() {
        viewport.classList.remove("is-zoomed");
        photo.style.removeProperty("width");
        zoomButton.textContent = "확대해서 보기";
        zoomButton.setAttribute("aria-pressed", "false");
        viewport.scrollTop = 0;
        viewport.scrollLeft = 0;
    }

    function showImage(index) {
        currentIndex = index;
        resetZoom();
        zoomButton.disabled = true;
        photo.src = images[index].currentSrc || images[index].src;
        photo.alt = images[index].alt;
        counter.textContent = `${index + 1} / ${images.length}`;
        prevButton.disabled = index === 0;
        nextButton.disabled = index === images.length - 1;
    }

    photo.addEventListener("load", () => {
        zoomButton.disabled = false;
    });
    buttons.forEach((button, index) => {
        button.addEventListener("click", () => {
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
        photo.style.width = `${Math.max(photo.naturalWidth, viewport.clientWidth * 2)}px`;
        zoomButton.textContent = "화면 너비에 맞추기";
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
