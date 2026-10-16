(() => {
    const buttons = [...document.querySelectorAll('.review-img-box')];
    const images = [];
    const firstImageIndex = new Map();
    buttons.forEach(button => {
        const image = button.querySelector('img');
        firstImageIndex.set(button, images.length);
        images.push({ src: image.currentSrc || image.src, alt: image.alt });
        if (button.dataset.reviewExtraSrc) {
            images.push({ src: button.dataset.reviewExtraSrc, alt: button.dataset.reviewExtraAlt || image.alt });
        }
    });
    const modal = document.getElementById('img-modal');
    const photo = document.getElementById('img-modal-img');
    const viewport = document.getElementById('img-modal-viewport');
    const closeButton = document.getElementById('img-modal-close');
    const prevButton = document.getElementById('img-prev');
    const nextButton = document.getElementById('img-next');
    const zoomButton = document.getElementById('img-zoom');
    const counter = document.getElementById('img-count');
    const status = document.getElementById('img-modal-status');
    let currentIndex = 0;
    let opener = null;
    let scale = 1;
    let gesture = null;
    let safariGesture = null;
    let wheelGesture = newWheelGesture();
    function newWheelGesture() {
        return { distance: 0, lastTime: -Infinity, consumed: false,
            peak: 0, previous: 0, direction: 0, falling: 0, decayed: false, changedAt: -Infinity };
    }

    function fittedSize() {
        const ratio = Math.min(viewport.clientWidth / photo.naturalWidth,
            viewport.clientHeight / photo.naturalHeight);
        return { width: photo.naturalWidth * ratio, height: photo.naturalHeight * ratio };
    }
    function ready() {
        return modal.open && !zoomButton.disabled && photo.naturalWidth > 0;
    }
    function localPoint(clientX, clientY) {
        const rect = viewport.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
    }
    function centerPoint() {
        return { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
    }
    function imagePoint(point) {
        const size = fittedSize();
        const width = size.width * scale, height = size.height * scale;
        return {
            x: Math.max(0, Math.min(1, (viewport.scrollLeft + point.x - Math.max(0, (viewport.clientWidth - width) / 2)) / width)),
            y: Math.max(0, Math.min(1, (viewport.scrollTop + point.y - Math.max(0, (viewport.clientHeight - height) / 2)) / height))
        };
    }
    function renderZoom() {
        viewport.classList.toggle('is-zoomed', scale > 1);
        if (scale > 1) viewport.style.setProperty('--review-zoom-width', `${fittedSize().width * scale}px`);
        else viewport.style.removeProperty('--review-zoom-width');
        zoomButton.textContent = scale > 1 ? '사진 전체 보기' : '확대해서 보기';
        zoomButton.setAttribute('aria-pressed', String(scale > 1));
    }
    function setZoom(nextScale, point = centerPoint(), anchor = imagePoint(point)) {
        if (!ready()) return;
        scale = Math.max(1, Math.min(8, nextScale));
        if (scale < 1.02) scale = 1;
        renderZoom();
        const size = fittedSize();
        const width = size.width * scale, height = size.height * scale;
        viewport.scrollLeft = Math.max(0, (viewport.clientWidth - width) / 2) + anchor.x * width - point.x;
        viewport.scrollTop = Math.max(0, (viewport.clientHeight - height) / 2) + anchor.y * height - point.y;
    }
    function resetGestures() {
        gesture = null;
        safariGesture = null;
        wheelGesture = newWheelGesture();
    }
    function resetZoom() {
        scale = 1;
        renderZoom();
        viewport.scrollTop = 0;
        viewport.scrollLeft = 0;
    }
    function showImage(index) {
        currentIndex = index;
        gesture = null;
        resetZoom();
        zoomButton.disabled = true;
        viewport.classList.remove('has-error');
        viewport.classList.add('is-loading');
        status.hidden = false;
        status.textContent = '사진을 불러오는 중입니다.';
        photo.src = images[index].src;
        photo.alt = images[index].alt;
        counter.textContent = `${index + 1} / ${images.length}`;
        prevButton.disabled = index === 0;
        nextButton.disabled = index === images.length - 1;
    }
    function changeImage(direction) {
        const next = currentIndex + direction;
        if (next >= 0 && next < images.length) showImage(next);
    }
    photo.addEventListener('load', () => {
        viewport.classList.remove('is-loading', 'has-error');
        status.hidden = true;
        zoomButton.disabled = false;
    });
    photo.addEventListener('error', () => {
        if (!modal.open) return;
        viewport.classList.remove('is-loading');
        viewport.classList.add('has-error');
        zoomButton.disabled = true;
        status.hidden = false;
        status.textContent = '사진을 불러오지 못했습니다. 다른 사진을 선택하거나 다시 열어주세요.';
    });
    const resize = () => {
        if (!modal.open) return;
        gesture = null;
        if (ready() && scale > 1) {
            renderZoom();
            viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
        }
    };
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(viewport);
    else window.addEventListener('resize', resize);

    buttons.forEach(button => button.addEventListener('click', () => {
        const index = firstImageIndex.get(button);
        if (typeof modal.showModal !== 'function') {
            window.location.assign(images[index].src);
            return;
        }
        opener = button;
        resetGestures();
        showImage(index);
        modal.showModal();
        document.documentElement.classList.add('review-modal-open');
        closeButton.focus();
    }));
    closeButton.addEventListener('click', () => modal.close());
    modal.addEventListener('close', () => {
        document.documentElement.classList.remove('review-modal-open');
        resetGestures();
        resetZoom();
        photo.removeAttribute('src');
        status.hidden = true;
        viewport.classList.remove('is-loading', 'has-error');
        if (opener) opener.focus({ preventScroll: true });
    });
    modal.addEventListener('click', event => { if (event.target === modal) modal.close(); });
    prevButton.addEventListener('click', () => changeImage(-1));
    nextButton.addEventListener('click', () => changeImage(1));
    zoomButton.addEventListener('click', () => {
        resetGestures();
        if (scale > 1) resetZoom();
        else {
            setZoom(Math.max(2, viewport.clientWidth / fittedSize().width));
            viewport.scrollTop = 0;
            viewport.focus();
        }
    });

    function pinchData(touches) {
        const [a, b] = touches;
        return {
            distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
            point: localPoint((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2)
        };
    }
    function beginTouch(event, afterPinch = false) {
        if (!ready()) { gesture = null; return; }
        if (event.touches.length === 2) {
            const pinch = pinchData(event.touches);
            gesture = { type: 'pinch', distance: Math.max(1, pinch.distance), scale, anchor: imagePoint(pinch.point) };
        } else if (event.touches.length === 1) {
            const touch = event.touches[0];
            gesture = { type: scale > 1 ? 'pan' : afterPinch ? 'ignore' : 'swipe',
                x: touch.clientX, y: touch.clientY, id: touch.identifier, time: Date.now(),
                left: viewport.scrollLeft, top: viewport.scrollTop, index: currentIndex };
        } else gesture = null;
    }
    // Confine touch zoom to the photo surface; never scale the dialog or its controls.
    viewport.addEventListener('touchstart', event => {
        if (event.touches.length > 1 && event.cancelable) event.preventDefault();
        beginTouch(event);
    }, { passive: false });
    viewport.addEventListener('touchmove', event => {
        if (event.cancelable) event.preventDefault();
        if (!gesture || !ready()) return;
        if (gesture.type === 'pinch' && event.touches.length === 2) {
            const pinch = pinchData(event.touches);
            setZoom(gesture.scale * pinch.distance / gesture.distance, pinch.point, gesture.anchor);
        } else if (event.touches.length === 1) {
            const touch = event.touches[0];
            const dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
            if (gesture.type === 'pan') {
                viewport.scrollLeft = gesture.left - dx;
                viewport.scrollTop = gesture.top - dy;
            } else if (gesture.type === 'swipe' && Math.abs(dy) > 16 && Math.abs(dy) > Math.abs(dx)) {
                gesture.type = 'ignore';
            }
        }
    }, { passive: false });
    viewport.addEventListener('touchend', event => {
        const start = gesture;
        if (event.touches.length) { beginTouch(event, true); return; }
        gesture = null;
        if (!start || start.type !== 'swipe' || !ready() || scale > 1 || start.index !== currentIndex) return;
        const touch = [...event.changedTouches].find(item => item.identifier === start.id);
        if (!touch) return;
        const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
        const threshold = Math.max(40, Math.min(80, viewport.clientWidth * .12));
        if (Date.now() - start.time <= 900 && Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.5) changeImage(dx < 0 ? 1 : -1);
    }, { passive: true });
    viewport.addEventListener('touchcancel', () => { gesture = null; }, { passive: true });

    // Chromium/Firefox trackpad pinch is delivered as Ctrl+wheel.
    viewport.addEventListener('wheel', event => {
        if (!modal.open) return;
        if (event.ctrlKey) {
            event.preventDefault();
            if (ready()) {
                const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
                setZoom(scale * Math.exp(-Math.max(-100, Math.min(100, event.deltaY * unit)) * .01), localPoint(event.clientX, event.clientY));
            }
            wheelGesture = newWheelGesture();
            wheelGesture.consumed = true;
            wheelGesture.lastTime = wheelGesture.changedAt = Date.now();
            return;
        }
        if (scale > 1 || event.metaKey) return;
        const now = Date.now();
        if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.5) return;
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientWidth : 1;
        const distance = event.deltaX * unit;
        const magnitude = Math.abs(distance);
        const direction = Math.sign(distance);
        const idle = now - wheelGesture.lastTime > 160;
        // Wheel events do not expose finger lift-off. A quiet gap, deliberate
        // reversal or a strong new burst after decaying momentum starts a gesture.
        const canRestart = wheelGesture.consumed && now - wheelGesture.changedAt >= 120;
        const reversed = canRestart && magnitude >= 12 && direction !== wheelGesture.direction;
        const renewed = canRestart && wheelGesture.decayed &&
            magnitude >= Math.max(14, wheelGesture.previous * 2.5);
        if (idle || reversed || renewed) wheelGesture = newWheelGesture();
        wheelGesture.lastTime = now;
        if (magnitude < 2) return;
        if (magnitude < wheelGesture.previous) wheelGesture.falling++;
        else if (magnitude > wheelGesture.previous * 1.1) wheelGesture.falling = 0;
        wheelGesture.peak = Math.max(wheelGesture.peak, magnitude);
        if (wheelGesture.falling >= 3 && magnitude < wheelGesture.peak * .55) wheelGesture.decayed = true;
        wheelGesture.previous = magnitude;
        if (wheelGesture.consumed) return;
        if (direction !== wheelGesture.direction) wheelGesture.distance = 0;
        wheelGesture.direction = direction;
        wheelGesture.distance += distance;
        if (Math.abs(wheelGesture.distance) >= 80) {
            wheelGesture.consumed = true;
            wheelGesture.changedAt = now;
            changeImage(direction);
        }
    }, { passive: false });
    // Safari trackpad gestures; touch pinches are already handled above.
    viewport.addEventListener('gesturestart', event => {
        event.preventDefault();
        if (!ready() || gesture) return;
        const point = centerPoint();
        safariGesture = { scale, point, anchor: imagePoint(point) };
    }, { passive: false });
    viewport.addEventListener('gesturechange', event => {
        event.preventDefault();
        if (safariGesture && !gesture) setZoom(safariGesture.scale * event.scale, safariGesture.point, safariGesture.anchor);
    }, { passive: false });
    viewport.addEventListener('gestureend', event => {
        event.preventDefault();
        safariGesture = null;
    }, { passive: false });

    // Discourage casual saving without blocking keyboard navigation or page-wide menus.
    [viewport, ...buttons].forEach(element => {
        element.addEventListener('contextmenu', event => event.preventDefault());
        element.addEventListener('dragstart', event => event.preventDefault());
    });
    [photo, ...buttons.map(button => button.querySelector('img'))].forEach(image => { image.draggable = false; });
    modal.addEventListener('keydown', event => {
        if (scale > 1) return;
        if (event.key === 'ArrowLeft') { event.preventDefault(); changeImage(-1); }
        else if (event.key === 'ArrowRight') { event.preventDefault(); changeImage(1); }
    });
})();
