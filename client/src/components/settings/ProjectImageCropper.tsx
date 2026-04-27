import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import Modal from '../ui/Modal';
import { loadImage, cropToPngBase64 } from '../../utils/cropImage';

const STAGE_SIZE = 320;
const OUTPUT_SIZE = 512;
const MIN_SCALE = 1;
const MAX_SCALE = 4;

interface Props {
  srcDataUrl: string;
  onCancel: () => void;
  onSave: (pngBase64: string) => void;
  saving?: boolean;
}

export default function ProjectImageCropper({ srcDataUrl, onCancel, onSave, saving }: Props) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadImage(srcDataUrl)
      .then(img => {
        if (cancelled) return;
        setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      })
      .catch(() => !cancelled && setError('Could not load image'));
    return () => {
      cancelled = true;
    };
  }, [srcDataUrl]);

  const coverScale = natural ? Math.max(STAGE_SIZE / natural.w, STAGE_SIZE / natural.h) : 1;
  const coverW = natural ? natural.w * coverScale : STAGE_SIZE;
  const coverH = natural ? natural.h * coverScale : STAGE_SIZE;
  const renderedW = coverW * scale;
  const renderedH = coverH * scale;
  const maxPanX = Math.max(0, (renderedW - STAGE_SIZE) / 2);
  const maxPanY = Math.max(0, (renderedH - STAGE_SIZE) / 2);

  function clampOffset(x: number, y: number) {
    return {
      x: Math.min(maxPanX, Math.max(-maxPanX, x)),
      y: Math.min(maxPanY, Math.max(-maxPanY, y)),
    };
  }

  useEffect(() => {
    setOffset(o => {
      const c = {
        x: Math.min(maxPanX, Math.max(-maxPanX, o.x)),
        y: Math.min(maxPanY, Math.max(-maxPanY, o.y)),
      };
      return c.x === o.x && c.y === o.y ? o : c;
    });
  }, [maxPanX, maxPanY]);

  function handlePointerDown(e: React.PointerEvent) {
    if (!natural) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return;
    const { mx, my, ox, oy } = dragStart.current;
    setOffset(clampOffset(ox + (e.clientX - mx), oy + (e.clientY - my)));
  }

  function handlePointerUp(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dragStart.current = null;
  }

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.002;
      setScale(s => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + delta * s)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  async function handleSave() {
    if (!natural) return;
    try {
      const effective = coverScale * scale;
      const srcSize = STAGE_SIZE / effective;
      const srcCenterX = natural.w / 2 - offset.x / effective;
      const srcCenterY = natural.h / 2 - offset.y / effective;
      const sx = srcCenterX - srcSize / 2;
      const sy = srcCenterY - srcSize / 2;
      const outSize = Math.min(OUTPUT_SIZE, Math.round(srcSize));
      const base64 = await cropToPngBase64(
        srcDataUrl,
        { sx, sy, sWidth: srcSize, sHeight: srcSize },
        Math.max(64, outSize),
      );
      onSave(base64);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Crop failed');
    }
  }

  return (
    <Modal onClose={onCancel} title="Crop Project Image" className="project-image-cropper" closeOnOverlayClick={false}>
      <div className="cropper-body">
        <p className="cropper-hint">Drag to position &middot; scroll or use the slider to zoom. Only the square area will be saved.</p>

        <div
          className="cropper-stage"
          ref={stageRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ width: STAGE_SIZE, height: STAGE_SIZE }}
        >
          {natural && (
            <img
              src={srcDataUrl}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: coverW,
                height: coverH,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transformOrigin: 'center center',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            />
          )}
        </div>

        <div className="cropper-zoom">
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setScale(s => Math.max(MIN_SCALE, s - 0.2))}
            aria-label="Zoom out"
            disabled={scale <= MIN_SCALE}
          >
            <ZoomOut size={16} />
          </button>
          <input
            type="range"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={0.01}
            value={scale}
            onChange={e => setScale(Number(e.target.value))}
            aria-label="Zoom"
          />
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => setScale(s => Math.min(MAX_SCALE, s + 0.2))}
            aria-label="Zoom in"
            disabled={scale >= MAX_SCALE}
          >
            <ZoomIn size={16} />
          </button>
        </div>

        {error && <p className="cropper-error">{error}</p>}

        <div className="cropper-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || !natural}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
