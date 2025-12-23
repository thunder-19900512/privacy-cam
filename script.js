
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

// --- State Management ---
const state = {
    images: [], // { id, file, url, img, faceRegions: [], manualRegions: [] }
    currentImageId: null,
    tool: 'mosaic', // 'mosaic' | 'emoji'
    selectedEmoji: '☺️', // can be 'random'
    mosaicIntensity: 20, // default
    isProcessing: false,
    dragStart: null // {x, y}
};

const RANDOM_EMOJI_POOL = [
    '🐱', '🐶', '🦊', '🦁', '🐵', '🐼', '🐨', '🐯',
    '😊', '🥰', '😍', '🤩', '🥳', '🦄', '🌈', '💖',
    '✨', '🎈', '🎉', '🍎', '🌻', '🍒', '🍓', '🐣'
];

// --- DOM Elements ---
const dom = {
    fileInput: document.getElementById('fileInput'),
    addImagesBtn: document.getElementById('addImagesBtn'),
    heroUploadBtn: document.getElementById('heroUploadBtn'),
    downloadAllBtn: document.getElementById('downloadAllBtn'),
    thumbnailList: document.getElementById('thumbnailList'),
    canvasContainer: document.getElementById('canvasContainer'),
    canvas: document.getElementById('editorCanvas'),
    heroUpload: document.getElementById('heroUpload'),
    downloadBtn: document.getElementById('downloadBtn'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText'),
    toolBtns: document.querySelectorAll('.tool-btn'),
    emojiSubSelector: document.getElementById('emoji-sub-selector'),
    mosaicSubSelector: document.getElementById('mosaic-sub-selector'),
    mosaicIntensity: document.getElementById('mosaicIntensity'),
    filenameInput: document.getElementById('filenameInput'),
    emojiOptions: document.querySelectorAll('.emoji-option'),
    customEmojiInput: document.getElementById('customEmojiInput'),
    themeToggle: document.getElementById('themeToggleBtn')
};

const ctx = dom.canvas.getContext('2d');

// --- Initialization ---
async function init() {
    try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        dom.loadingOverlay.classList.add('hidden');
    } catch (error) {
        console.error('Failed to load models:', error);
        dom.loadingText.textContent = 'モデルの読み込みに失敗しました。';
    }
}
init();

// --- Theme Toggling ---
function initTheme() {
    const savedTheme = localStorage.getItem('privacyCamTheme');
    if (savedTheme === 'retro') {
        document.body.classList.add('theme-retro');
        dom.themeToggle.textContent = '🦄'; // Icon to switch back to modern
    } else {
        dom.themeToggle.textContent = '💾'; // Icon to switch to retro
    }
}
initTheme();

dom.themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('theme-retro');
    const isRetro = document.body.classList.contains('theme-retro');
    localStorage.setItem('privacyCamTheme', isRetro ? 'retro' : 'modern');
    dom.themeToggle.textContent = isRetro ? '🦄' : '💾';
});

// --- Event Listeners ---

// 1. Upload Actions
const triggerUpload = () => dom.fileInput.click();
dom.addImagesBtn.addEventListener('click', triggerUpload);
if (dom.heroUploadBtn) dom.heroUploadBtn.addEventListener('click', triggerUpload);

dom.fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

// Drag & Drop
document.body.addEventListener('dragover', (e) => e.preventDefault());
document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
});

// 2. Toolbar & Bulk Apply Logic
dom.toolBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        dom.toolBtns.forEach(b => b.classList.remove('active'));
        const target = e.currentTarget;
        target.classList.add('active');

        state.tool = target.dataset.tool;

        if (state.tool === 'emoji') {
            dom.emojiSubSelector.classList.remove('hidden');
            dom.mosaicSubSelector.classList.add('hidden');
        } else {
            dom.emojiSubSelector.classList.add('hidden');
            dom.mosaicSubSelector.classList.remove('hidden');
        }

        applyToolToCurrentFaces();
    });
});

dom.mosaicIntensity.addEventListener('input', (e) => {
    state.mosaicIntensity = parseInt(e.target.value, 10);
    render();
});

dom.emojiOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
        dom.emojiOptions.forEach(o => o.classList.remove('selected'));
        dom.customEmojiInput.classList.remove('selected-input'); // Clear input style
        e.target.classList.add('selected');

        const char = e.target.dataset.char;

        if (char === 'random') {
            state.selectedEmoji = 'random';
            applyRandomEmojis();
        } else {
            state.selectedEmoji = char;
            if (state.tool === 'emoji') applyToolToCurrentFaces();
        }
    });
});

// Custom Emoji Input
dom.customEmojiInput.addEventListener('input', (e) => {
    const val = e.target.value;
    if (val) {
        dom.emojiOptions.forEach(o => o.classList.remove('selected'));
        dom.customEmojiInput.classList.add('selected-input');
        state.selectedEmoji = val;
        if (state.tool === 'emoji') applyToolToCurrentFaces();
    }
});
dom.customEmojiInput.addEventListener('focus', () => {
    // Select this if focused
    if (dom.customEmojiInput.value) {
        state.selectedEmoji = dom.customEmojiInput.value;
        dom.emojiOptions.forEach(o => o.classList.remove('selected'));
        dom.customEmojiInput.classList.add('selected-input');
    }
});


// 3. Canvas Interaction
dom.canvas.addEventListener('mousedown', handleCanvasDown);
dom.canvas.addEventListener('mousemove', handleCanvasMove);
dom.canvas.addEventListener('mouseup', handleCanvasUp);

// 4. Download
dom.downloadBtn.addEventListener('click', downloadCurrentImage);
dom.downloadAllBtn.addEventListener('click', downloadAllImages);

// --- Core Logic ---

function applyToolToCurrentFaces() {
    const data = getCurrentData();
    if (!data) return;

    data.faceRegions.forEach(face => {
        face.effect = state.tool;
        if (state.tool === 'emoji') {
            if (state.selectedEmoji === 'random') {
                face.emoji = RANDOM_EMOJI_POOL[Math.floor(Math.random() * RANDOM_EMOJI_POOL.length)];
            } else {
                face.emoji = state.selectedEmoji;
            }
        }
    });
    render();
}

function applyRandomEmojis() {
    const data = getCurrentData();
    if (!data) return;

    // Switch tool if needed
    if (state.tool !== 'emoji') {
        state.tool = 'emoji';
        document.querySelector('[data-tool="emoji"]').click();
        // The click handler calls applyToolToCurrentFaces, which handles random if state.selectedEmoji is 'random'
        return;
    }

    // Force re-roll even if already emoji
    data.faceRegions.forEach(face => {
        face.effect = 'emoji';
        face.emoji = RANDOM_EMOJI_POOL[Math.floor(Math.random() * RANDOM_EMOJI_POOL.length)];
    });
    render();
}

async function handleFiles(files) {
    if (!files.length) return;

    dom.loadingText.textContent = '画像を読み込み・解析中...';
    dom.loadingOverlay.classList.remove('hidden');

    for (const file of Array.from(files)) {
        const id = Date.now() + Math.random().toString(36).substr(2, 9);
        const url = URL.createObjectURL(file);
        const img = await loadImage(url);

        // Detect Faces
        const detections = await faceapi.detectAllFaces(img, new faceapi.SsdMobilenetv1Options());

        const faceRegions = detections.map(d => ({
            type: 'face',
            box: d.box,
            effect: state.tool,
            emoji: state.selectedEmoji
        }));

        const imageObj = {
            id, file, url, img,
            faceRegions,
            manualRegions: [],
            originalDims: { w: img.width, h: img.height }
        };

        state.images.push(imageObj);
        addThumbnail(imageObj);

        // Select last added
        selectImage(id);
    }

    dom.loadingOverlay.classList.add('hidden');
}

function loadImage(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = src;
    });
}

function addThumbnail(imageObj) {
    const div = document.createElement('div');
    div.className = 'thumb-item';
    div.dataset.id = imageObj.id;
    div.onclick = () => selectImage(imageObj.id);

    div.innerHTML = `
        <img src="${imageObj.url}">
        <div class="thumb-overlay">
            <span>${imageObj.faceRegions.length} faces</span>
        </div>
    `;

    // Drag & Drop for reordering
    div.draggable = true;
    div.addEventListener('dragstart', handleThumbDragStart);
    div.addEventListener('dragover', handleThumbDragOver);
    div.addEventListener('drop', handleThumbDrop);
    div.addEventListener('dragend', handleThumbDragEnd);

    dom.thumbnailList.appendChild(div);
}

// --- Sidebar Drag & Drop Logic ---
let draggedItem = null;

function handleThumbDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleThumbDragOver(e) {
    e.preventDefault();
    if (this === draggedItem) return;
    this.classList.add('drag-over');
    e.dataTransfer.dropEffect = 'move';
}

function handleThumbDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.thumb-item').forEach(item => item.classList.remove('drag-over'));
    draggedItem = null;
}

function handleThumbDrop(e) {
    e.stopPropagation(); // Stop firing on body
    if (draggedItem !== this) {
        // Reorder DOM
        const allItems = [...dom.thumbnailList.querySelectorAll('.thumb-item')];
        const fromIndex = allItems.indexOf(draggedItem);
        const toIndex = allItems.indexOf(this);

        if (fromIndex < toIndex) {
            this.after(draggedItem);
        } else {
            this.before(draggedItem);
        }

        // Reorder State
        const movedImage = state.images.splice(fromIndex, 1)[0];
        state.images.splice(toIndex, 0, movedImage);
    }
    return false;
}

function selectImage(id) {
    state.currentImageId = id;

    document.querySelectorAll('.thumb-item').forEach(el => {
        el.classList.toggle('active', el.dataset.id === id);
    });

    dom.heroUpload.classList.add('hidden');
    render();
}

function getCurrentData() {
    return state.images.find(img => img.id === state.currentImageId);
}

// --- Interaction Logic ---

function getCanvasCoords(e) {
    const rect = dom.canvas.getBoundingClientRect();
    const scaleX = dom.canvas.width / rect.width;
    const scaleY = dom.canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function handleCanvasDown(e) {
    if (!getCurrentData()) return;
    // Account for scroll if necessary, but canvas container is usually fixed relative to viewport
    state.dragStart = getCanvasCoords(e);
}

function handleCanvasMove(e) { /* Optional visual guide */ }

function handleCanvasUp(e) {
    if (!state.dragStart || !getCurrentData()) return;

    const dragEnd = getCanvasCoords(e);
    const dx = dragEnd.x - state.dragStart.x;
    const dy = dragEnd.y - state.dragStart.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 10) {
        handleClick(state.dragStart);
    } else {
        handleDrag(state.dragStart, dragEnd);
    }

    state.dragStart = null;
}

function handleClick(pos) {
    const data = getCurrentData();
    const clickedFace = data.faceRegions.find(r =>
        pos.x >= r.box.x && pos.x <= r.box.x + r.box.width &&
        pos.y >= r.box.y && pos.y <= r.box.y + r.box.height
    );

    if (clickedFace) {
        if (clickedFace.effect === state.tool &&
            (state.tool !== 'emoji' || state.selectedEmoji === 'random' || clickedFace.emoji === state.selectedEmoji)) {
            clickedFace.effect = 'none';
        } else {
            clickedFace.effect = state.tool;
            if (state.tool === 'emoji') {
                clickedFace.emoji = state.selectedEmoji === 'random'
                    ? RANDOM_EMOJI_POOL[Math.floor(Math.random() * RANDOM_EMOJI_POOL.length)]
                    : state.selectedEmoji;
            }
        }
        render();
        return;
    }

    const clickedManualIdx = data.manualRegions.findIndex(r =>
        pos.x >= r.box.x && pos.x <= r.box.x + r.box.width &&
        pos.y >= r.box.y && pos.y <= r.box.y + r.box.height
    );

    if (clickedManualIdx !== -1) {
        data.manualRegions.splice(clickedManualIdx, 1);
        render();
    }
}

function handleDrag(start, end) {
    const data = getCurrentData();
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(start.x - end.x);
    const height = Math.abs(start.y - end.y);

    data.manualRegions.push({
        type: 'manual',
        box: { x, y, width, height },
        effect: state.tool,
        emoji: state.tool === 'emoji' && state.selectedEmoji === 'random'
            ? RANDOM_EMOJI_POOL[Math.floor(Math.random() * RANDOM_EMOJI_POOL.length)]
            : state.selectedEmoji
    });
    render();
}


// --- Rendering ---
function render(targetData = null, targetCtx = null) {
    const data = targetData || getCurrentData();
    const context = targetCtx || ctx;
    if (!data) return;

    if (!targetCtx && (dom.canvas.width !== data.img.width || dom.canvas.height !== data.img.height)) {
        dom.canvas.width = data.img.width;
        dom.canvas.height = data.img.height;
    }

    context.drawImage(data.img, 0, 0);

    [...data.faceRegions, ...data.manualRegions].forEach(region => {
        if (region.type === 'face' && region.effect === 'none') {
            // Only draw guides on main canvas, not for download
            if (!targetCtx) {
                context.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                context.lineWidth = 2;
                context.setLineDash([5, 5]);
                context.strokeRect(region.box.x, region.box.y, region.box.width, region.box.height);
                context.setLineDash([]);
            }
            return;
        }

        if (region.effect === 'mosaic') {
            applyMosaic(context, region.box);
        } else if (region.effect === 'emoji') {
            applyEmoji(context, region.box, region.emoji);
        }
    });
}

function applyMosaic(ctx, box) {
    const { x, y, width, height } = box;
    // Use state.mosaicIntensity directly
    // Map existing 5-50 range to block size. 
    // If width is small, we need minimum block size.
    // Let's just use the intensity as block size directly for simplicity, or scale it.
    // User wants "Strength". Small block size = weak mosaic? No, small blocks = clearer image = weak mosaic.
    // Large blocks = stronger mosaic.
    // So intensity 5 (weak) -> 5px blocks? Or maybe relative to image size?
    // Let's stick to absolute pixel size for consistency across faces, or maybe relative.
    // Previous calc: Math.max(8, Math.floor(width / 12));
    // Let's use the slider value as the divider? No, User expects slider up = stronger.
    // Stronger = Larger blocks.
    // Let's use slider value as approximate block size in pixels, but scaled a bit?
    // Slider 5 to 50.
    const blockSize = Math.max(4, state.mosaicIntensity);

    for (let by = y; by < y + height; by += blockSize) {
        for (let bx = x; bx < x + width; bx += blockSize) {
            const cx = Math.min(bx + blockSize / 2, ctx.canvas.width - 1);
            const cy = Math.min(by + blockSize / 2, ctx.canvas.height - 1);
            const p = ctx.getImageData(cx, cy, 1, 1).data;
            ctx.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`;
            ctx.fillRect(bx, by, Math.min(blockSize, x + width - bx), Math.min(blockSize, y + height - by));
        }
    }
}

function applyEmoji(ctx, box, char) {
    const { x, y, width, height } = box;
    const size = Math.max(width, height) * 1.2;
    const cx = x + width / 2;
    const cy = y + height / 2;

    ctx.font = `${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char || '☺️', cx, cy);
}

function downloadCurrentImage() {
    const data = getCurrentData();
    if (!data) return;

    const baseName = dom.filenameInput.value.trim() || 'privacy-cam';
    const link = document.createElement('a');
    link.download = `${baseName}-${Date.now()}.png`;
    link.href = dom.canvas.toDataURL('image/png');
    link.click();
}

async function downloadAllImages() {
    if (state.images.length === 0) return;

    dom.loadingText.textContent = 'すべての画像を処理中...';
    dom.loadingOverlay.classList.remove('hidden');

    const offCanvas = document.createElement('canvas');
    const offCtx = offCanvas.getContext('2d');
    const baseName = dom.filenameInput.value.trim() || 'privacy-cam';

    for (let i = 0; i < state.images.length; i++) {
        const imgData = state.images[i];
        offCanvas.width = imgData.img.width;
        offCanvas.height = imgData.img.height;

        render(imgData, offCtx);

        const blob = await new Promise(resolve => offCanvas.toBlob(resolve, 'image/png'));
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        // Format: filename-1, filename-2 ...
        link.download = `${baseName}-${i + 1}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Small delay to prevent browser throttling downloads
        await new Promise(r => setTimeout(r, 500));
    }

    dom.loadingOverlay.classList.add('hidden');
}
