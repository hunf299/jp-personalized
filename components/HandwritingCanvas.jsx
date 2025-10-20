// components/HandwritingCanvas.jsx
import React from 'react';
import { Stack, Button } from '@mui/material';

/**
 * HandwritingCanvas
 * - width, height: kích thước hiển thị (CSS pixel)
 * - lineWidth: độ dày nét
 * - color: màu nét
 * - showControls: hiện nút Clear / Undo
 * - onChange(strokes): callback mỗi lần vẽ/clear/undo
 */
export default function HandwritingCanvas({
                                            width = 320,
                                            height = 220,
                                            lineWidth = 4,
                                            color = '#111',
                                            showControls = true,
                                            onChange,
                                          }) {
  const canvasRef = React.useRef(null);
  const ctxRef = React.useRef(null);
  const drawingRef = React.useRef(false);
  const lastPtRef = React.useRef({ x: 0, y: 0 });
  const dprRef = React.useRef(1);
  const strokeStackRef = React.useRef([]); // để undo (lưu ImageData)

  // Scale canvas đúng theo DPR, nhưng KHÔNG thay đổi kích thước hiển thị CSS
  const setupCanvas = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    dprRef.current = dpr;

    // set CSS size ổn định
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // set pixel buffer theo DPR
    const needResize = canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr);
    if (needResize) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    const ctx = canvas.getContext('2d');
    // reset transform trước khi scale để tránh scale chồng làm "thu nhỏ" dần
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // style nét
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    ctxRef.current = ctx;
  }, [width, height, color, lineWidth]);

  React.useEffect(() => {
    setupCanvas();
    // Lưu ảnh trống đầu tiên để Undo hoạt động sau clear đầu
    pushSnapshot();
    // Re-scale khi window resize (DPR có thể đổi)
    const handleResize = () => setupCanvas();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setupCanvas]);

  // Nếu props lineWidth/color thay đổi → cập nhật context
  React.useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
  }, [color, lineWidth]);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    // pointer/touch/mouse đều dùng clientX/Y
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    return { x, y };
  }

  function pushSnapshot() {
    const c = canvasRef.current;
    const ctx = ctxRef.current;
    if (!c || !ctx) return;
    // Lưu snapshot pixel buffer (kích thước buffer: width*dpr x height*dpr)
    try {
      const img = ctx.getImageData(0, 0, c.width, c.height);
      // Giới hạn stack để tránh dùng quá nhiều RAM
      const stack = strokeStackRef.current;
      if (stack.length > 30) stack.shift();
      stack.push(img);
    } catch {
      // ignore
    }
  }

  const handlePointerDown = (e) => {
    e.preventDefault();
    const ctx = ctxRef.current;
    if (!ctx) return;
    canvasRef.current.setPointerCapture?.(e.pointerId);

    const { x, y } = getPos(e);
    drawingRef.current = true;
    lastPtRef.current = { x, y };

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current) return;
    const ctx = ctxRef.current;
    if (!ctx) return;

    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastPtRef.current = { x, y };
  };

  const handlePointerUp = (e) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;

    // lưu snapshot sau mỗi stroke để Undo
    pushSnapshot();
    onChange?.(true);
  };

  const handlePointerLeave = (e) => {
    if (!drawingRef.current) return;
    // kết thúc stroke nếu rời khỏi canvas
    drawingRef.current = false;
    pushSnapshot();
    onChange?.(true);
  };

  const clearCanvas = () => {
    const c = canvasRef.current;
    const ctx = ctxRef.current;
    if (!c || !ctx) return;
    // CHỈ clearRect, KHÔNG reset width/height (tránh thu hẹp)
    ctx.clearRect(0, 0, c.width, c.height);
    pushSnapshot();
    onChange?.(false);
  };

  const undo = () => {
    const c = canvasRef.current;
    const ctx = ctxRef.current;
    const stack = strokeStackRef.current;
    if (!c || !ctx || stack.length < 2) return; // còn ít nhất 2 snapshot: hiện tại + trước đó

    // bỏ snapshot hiện tại
    stack.pop();
    const last = stack[stack.length - 1];
    if (!last) return;

    // vẽ lại snapshot trước đó
    ctx.putImageData(last, 0, 0);
    onChange?.(true);
  };

  return (
      <Stack spacing={1} sx={{ maxWidth: width }}>
        <canvas
            ref={canvasRef}
            width={Math.floor(width * (typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1))}
            height={Math.floor(height * (typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1))}
            style={{
              width: `${width}px`,
              height: `${height}px`,
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: 8,
              display: 'block',
              touchAction: 'none', // để vẽ mượt trên mobile
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerLeave}
        />
        {showControls && (
            <Stack className="responsive-stack" direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={undo} fullWidth>Undo</Button>
              <Button size="small" variant="contained" onClick={clearCanvas} fullWidth>Clear</Button>
            </Stack>
        )}
      </Stack>
  );
}
