// ══════════════════════════════════════════════════
//  Stop-and-Wait Protocol — Full Simulation Engine
// ══════════════════════════════════════════════════

const DATA_SAMPLES = [
  "Hello World","Data Packet","Network Msg","Frame Data",
  "Test Payload","ACK Request","Ping Pong","Info Block"
];

// ── State ──────────────────────────────────────────
let events        = [];
let currentIdx    = 0;
let paused        = false;
let running       = false;
let animTimer     = null;
let stats         = { sent: 0, ack: 0, timeout: 0, retransmit: 0 };
let frameRecords  = [];
let speedMs       = 1200;   // ms between events
let totalFrames   = 4;
let errorProb     = 30;

// ── DOM refs ───────────────────────────────────────
const startBtn        = document.getElementById('startBtn');
const pauseBtn        = document.getElementById('pauseBtn');
const resetBtn        = document.getElementById('resetBtn');
const frameCountSlider= document.getElementById('frameCount');
const frameCountVal   = document.getElementById('frameCountVal');
const errorProbSlider = document.getElementById('errorProb');
const errorProbVal    = document.getElementById('errorProbVal');
const speedSlider     = document.getElementById('speedControl');
const speedVal        = document.getElementById('speedVal');
const eventLog        = document.getElementById('eventLog');
const channelInfo     = document.getElementById('channelInfo');
const senderStatus    = document.getElementById('senderStatus');
const receiverStatus  = document.getElementById('receiverStatus');
const frameBuffer     = document.getElementById('frameBuffer');
const receivedBuffer  = document.getElementById('receivedBuffer');
const frameTableBody  = document.getElementById('frameTableBody');
const canvas          = document.getElementById('animCanvas');
const ctx             = canvas.getContext('2d');

// ── Slider listeners ───────────────────────────────
frameCountSlider.addEventListener('input', () => {
  totalFrames = +frameCountSlider.value;
  frameCountVal.textContent = totalFrames;
});
errorProbSlider.addEventListener('input', () => {
  errorProb = +errorProbSlider.value;
  errorProbVal.textContent = errorProb + '%';
});
const speedLabels = ['Very Slow','Slow','Normal','Fast','Very Fast'];
speedSlider.addEventListener('input', () => {
  const v = +speedSlider.value;
  speedVal.textContent = speedLabels[v - 1];
  speedMs = [2400, 1800, 1200, 750, 400][v - 1];
});

// ── Utility ────────────────────────────────────────
function rand100() { return Math.floor(Math.random() * 100); }

function randomLoss(prob) { return rand100() < prob; }

function nowTime() {
  const d = new Date();
  return `${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

// ── Simulation generator ───────────────────────────
function generateSimulation(nFrames, errProb) {
  const evts = [];
  frameRecords = [];

  for (let i = 0; i < nFrames; i++) {
    const data = DATA_SAMPLES[i % DATA_SAMPLES.length];
    let attempts = 0;
    let acked = false;
    const rec = { id: i+1, data, attempts: 0, status: 'pending', result: '—' };
    frameRecords.push(rec);

    while (!acked) {
      attempts++;
      rec.attempts = attempts;

      // --- Frame Sent / Retransmit ---
      evts.push({
        type: attempts === 1 ? 'FRAME_SENT' : 'RETRANSMIT',
        frame_id: i + 1,
        message: attempts === 1
          ? `Frame ${i+1} sent → [${data}]`
          : `Frame ${i+1} retransmitted → [${data}] (Attempt ${attempts})`,
        is_error: 0
      });

      // --- Frame Loss? ---
      if (randomLoss(errProb)) {
        evts.push({
          type: 'FRAME_LOST',
          frame_id: i + 1,
          message: `Frame ${i+1} lost in transit!`,
          is_error: 1
        });
        evts.push({
          type: 'TIMEOUT',
          frame_id: i + 1,
          message: `Timeout! No ACK for Frame ${i+1}. Retransmitting...`,
          is_error: 1
        });
        continue;
      }

      // --- ACK Loss? ---
      if (randomLoss(Math.floor(errProb / 2))) {
        evts.push({
          type: 'ACK_LOST',
          frame_id: i + 1,
          message: `ACK ${i+1} lost in transit!`,
          is_error: 1
        });
        evts.push({
          type: 'TIMEOUT',
          frame_id: i + 1,
          message: `Timeout! ACK not received for Frame ${i+1}. Retransmitting...`,
          is_error: 1
        });
        continue;
      }

      // --- ACK received ---
      evts.push({
        type: 'ACK_RECEIVED',
        frame_id: i + 1,
        message: `ACK ${i+1} received ✓ — Frame ${i+1} acknowledged`,
        is_error: 0
      });
      evts.push({
        type: 'SUCCESS',
        frame_id: i + 1,
        message: `Frame ${i+1} delivered successfully after ${attempts} attempt(s)`,
        is_error: 0
      });

      rec.status  = 'success';
      rec.result  = `✓ (${attempts} attempt${attempts > 1 ? 's' : ''})`;
      acked = true;
    }
  }
  return evts;
}

// ── Canvas animation ───────────────────────────────
const CW = () => canvas.offsetWidth || 400;
const CH = 120;

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, CH);
}

function drawChannel() {
  clearCanvas();
  const w = canvas.width;
  // Dashed guide line
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, CH / 2);
  ctx.lineTo(w - 20, CH / 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function animatePacket(type, onDone) {
  // type: 'frame' | 'ack' | 'lost_frame' | 'lost_ack' | 'timeout'
  const w = canvas.width;
  const y = CH / 2;
  let progress = 0;
  const isReverse   = type === 'ack' || type === 'lost_ack';
  const isLoss      = type === 'lost_frame' || type === 'lost_ack';
  const isTimeout   = type === 'timeout';
  const totalFrames_ = 40;

  const colors = {
    frame:      '#1f6feb',
    ack:        '#3fb950',
    lost_frame: '#f85149',
    lost_ack:   '#f85149',
    timeout:    '#d29922'
  };
  const labels = {
    frame:      'Frame →',
    ack:        '← ACK',
    lost_frame: '✗ Frame Lost',
    lost_ack:   '✗ ACK Lost',
    timeout:    '⏱ Timeout'
  };

  const color = colors[type] || '#8b949e';
  const label = labels[type] || '';

  function step() {
    drawChannel();
    progress++;
    const t = progress / totalFrames_;

    if (isTimeout) {
      // Pulsing timeout indicator in center
      const alpha = Math.sin(t * Math.PI);
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = `rgba(210,153,34,${alpha})`;
      ctx.textAlign = 'center';
      ctx.fillText('⏱ TIMEOUT', w / 2, y + 5);

      if (progress >= totalFrames_) { drawChannel(); onDone(); return; }
      requestAnimationFrame(step);
      return;
    }

    const startX = isReverse ? w - 30 : 30;
    const endX   = isReverse ? 30 : w - 30;
    const curX   = startX + (endX - startX) * t;

    // Trail
    const grad = ctx.createLinearGradient(startX, 0, endX, 0);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(1, color + '44');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(curX, y);
    ctx.stroke();

    // Packet dot
    ctx.beginPath();
    ctx.arc(curX, y, isLoss && t > 0.5 ? 5 * (1 - (t - 0.5) * 2) + 2 : 7, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label
    ctx.font = '11px monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(label, curX, y - 14);

    if (isLoss && t >= 0.55) {
      // Draw × at loss point
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = '#f85149';
      ctx.fillText('✗', curX, y + 6);
    }

    if (progress >= totalFrames_) {
      drawChannel();
      onDone();
      return;
    }
    requestAnimationFrame(step);
  }

  drawChannel();
  requestAnimationFrame(step);
}

// ── Event log ──────────────────────────────────────
const iconMap = {
  FRAME_SENT:   '📤',
  ACK_RECEIVED: '✅',
  FRAME_LOST:   '❌',
  ACK_LOST:     '❌',
  TIMEOUT:      '⏱️',
  RETRANSMIT:   '🔄',
  SUCCESS:      '🎉'
};

function appendLog(evt) {
  // Remove placeholder if present
  const placeholder = eventLog.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();

  const div = document.createElement('div');
  div.className = `log-entry ${evt.type}`;
  div.innerHTML = `
    <span class="log-icon">${iconMap[evt.type] || '•'}</span>
    <span class="log-text">${evt.message}</span>
    <span class="log-time">${nowTime()}</span>
  `;
  eventLog.appendChild(div);
  eventLog.scrollTop = eventLog.scrollHeight;
}

// ── Stats update ───────────────────────────────────
function updateStats() {
  document.getElementById('statSent').textContent       = stats.sent;
  document.getElementById('statAck').textContent        = stats.ack;
  document.getElementById('statTimeout').textContent    = stats.timeout;
  document.getElementById('statRetransmit').textContent = stats.retransmit;

  if (stats.sent > 0) {
    const eff = Math.round((stats.ack / stats.sent) * 100);
    document.getElementById('statEfficiency').textContent = eff + '%';
  }
}

// ── Frame table ────────────────────────────────────
function initFrameTable() {
  frameTableBody.innerHTML = '';
  frameRecords.forEach(r => {
    const tr = document.createElement('tr');
    tr.id = `row-${r.id}`;
    tr.innerHTML = `
      <td><strong>Frame ${r.id}</strong></td>
      <td>${r.data}</td>
      <td><span class="badge badge-pending" id="badge-${r.id}">Pending</span></td>
      <td id="attempts-${r.id}">0</td>
      <td id="result-${r.id}">—</td>
    `;
    frameTableBody.appendChild(tr);
  });
}

function updateFrameRow(frameId, status, attempts, result) {
  const badgeEl = document.getElementById(`badge-${frameId}`);
  const attEl   = document.getElementById(`attempts-${frameId}`);
  const resEl   = document.getElementById(`result-${frameId}`);
  if (!badgeEl) return;

  const badgeMap = {
    sending: ['badge-sending', 'Sending'],
    waiting: ['badge-waiting', 'Waiting ACK'],
    success: ['badge-success', 'Success'],
    error:   ['badge-error', 'Error']
  };
  const [cls, label] = badgeMap[status] || ['badge-pending', 'Pending'];
  badgeEl.className = `badge ${cls}`;
  badgeEl.textContent = label;
  if (attEl) attEl.textContent = attempts;
  if (resEl && result) resEl.textContent = result;
}

// ── Node status helpers ────────────────────────────
function setSenderStatus(txt, cls = '') {
  senderStatus.textContent = txt;
  senderStatus.className = `node-status ${cls}`;
}
function setReceiverStatus(txt, cls = '') {
  receiverStatus.textContent = txt;
  receiverStatus.className = `node-status ${cls}`;
}
function setChannelInfo(txt, cls = '') {
  channelInfo.textContent = txt;
  channelInfo.className = `channel-info ${cls}`;
}

// ── Sender buffer pills ────────────────────────────
function renderSenderBuffer() {
  frameBuffer.innerHTML = '';
  frameRecords.forEach(r => {
    const div = document.createElement('div');
    div.className = `frame-pill ${r.status === 'success' ? 'sent' : r.status === 'sending' ? 'waiting' : ''}`;
    div.textContent = `F${r.id}: ${r.data}`;
    frameBuffer.appendChild(div);
  });
}

// ── Receiver buffer ────────────────────────────────
let receivedCount = 0;
function addReceivedPill(frameId, data) {
  const div = document.createElement('div');
  div.className = 'frame-pill received';
  div.textContent = `✓ F${frameId}: ${data}`;
  receivedBuffer.appendChild(div);
}

// ── Process a single event ─────────────────────────
function processEvent(evt, callback) {
  appendLog(evt);

  const fid  = evt.frame_id;
  const frec = frameRecords[fid - 1];

  switch (evt.type) {
    case 'FRAME_SENT':
      stats.sent++;
      setSenderStatus('Transmitting...', 'active');
      setReceiverStatus('Waiting...', '');
      setChannelInfo('Frame in transit →', 'sending');
      if (frec) { frec.status = 'sending'; renderSenderBuffer(); }
      updateFrameRow(fid, 'sending', frec ? frec.attempts : 1, null);
      updateStats();
      animatePacket('frame', callback);
      break;

    case 'RETRANSMIT':
      stats.retransmit++;
      setSenderStatus('Retransmitting...', 'active');
      setChannelInfo('Retransmitting Frame →', 'sending');
      updateFrameRow(fid, 'sending', frec ? frec.attempts : '?', null);
      updateStats();
      animatePacket('frame', callback);
      break;

    case 'FRAME_LOST':
      setSenderStatus('Frame lost!', 'error');
      setReceiverStatus('No frame received', 'error');
      setChannelInfo('✗ Frame lost!', 'error');
      animatePacket('lost_frame', callback);
      break;

    case 'ACK_RECEIVED':
      stats.ack++;
      setSenderStatus('ACK received ✓', 'success');
      setReceiverStatus('ACK sent ✓', 'success');
      setChannelInfo('← ACK returning', 'acking');
      updateStats();
      animatePacket('ack', callback);
      break;

    case 'ACK_LOST':
      setSenderStatus('ACK lost!', 'error');
      setChannelInfo('✗ ACK lost!', 'error');
      animatePacket('lost_ack', callback);
      break;

    case 'TIMEOUT':
      stats.timeout++;
      setSenderStatus('Timeout!', 'error');
      setChannelInfo('⏱ Timeout — retransmitting', 'timeout');
      updateFrameRow(fid, 'error', frec ? frec.attempts : '?', null);
      updateStats();
      animatePacket('timeout', callback);
      break;

    case 'SUCCESS':
      if (frec) {
        frec.status = 'success';
        renderSenderBuffer();
        addReceivedPill(fid, frec.data);
      }
      setSenderStatus('Frame delivered ✓', 'success');
      setReceiverStatus('Frame received ✓', 'success');
      setChannelInfo('Frame delivered successfully', 'acking');
      updateFrameRow(fid, 'success', frec ? frec.attempts : '?', frec ? frec.result : '✓');
      setTimeout(callback, speedMs * 0.3);
      break;

    default:
      callback();
  }
}

// ── Main playback loop ─────────────────────────────
function playNext() {
  if (!running || paused) return;
  if (currentIdx >= events.length) {
    onSimulationEnd();
    return;
  }
  const evt = events[currentIdx++];
  processEvent(evt, () => {
    if (!running || paused) return;
    animTimer = setTimeout(playNext, speedMs * 0.3);
  });
}

function onSimulationEnd() {
  running = false;
  startBtn.disabled  = false;
  pauseBtn.disabled  = true;
  setSenderStatus('Complete ✓', 'success');
  setReceiverStatus('All frames received', 'success');
  setChannelInfo('✓ Simulation complete!', 'acking');
  drawChannel();

  // Final efficiency
  const eff = stats.sent > 0 ? Math.round((stats.ack / stats.sent) * 100) : 0;
  document.getElementById('statEfficiency').textContent = eff + '%';
}

// ── Controls ───────────────────────────────────────
startBtn.addEventListener('click', () => {
  if (running) return;
  resetState(false);

  totalFrames = +frameCountSlider.value;
  errorProb   = +errorProbSlider.value;
  events      = generateSimulation(totalFrames, errorProb);
  currentIdx  = 0;
  running     = true;
  paused      = false;

  initFrameTable();
  renderSenderBuffer();

  startBtn.disabled = true;
  pauseBtn.disabled = false;

  playNext();
});

pauseBtn.addEventListener('click', () => {
  if (!running) return;
  paused = !paused;
  pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause';
  if (!paused) playNext();
});

resetBtn.addEventListener('click', () => resetState(true));

function resetState(clearLog) {
  running    = false;
  paused     = false;
  currentIdx = 0;
  events     = [];
  stats      = { sent: 0, ack: 0, timeout: 0, retransmit: 0 };
  receivedCount = 0;

  clearTimeout(animTimer);

  startBtn.disabled = false;
  pauseBtn.disabled = true;
  pauseBtn.textContent = '⏸ Pause';

  if (clearLog) {
    eventLog.innerHTML = '<div class="log-placeholder">Events will appear here after simulation starts...</div>';
    frameTableBody.innerHTML = '';
  }

  frameBuffer.innerHTML   = '';
  receivedBuffer.innerHTML= '';
  setSenderStatus('Idle', '');
  setReceiverStatus('Waiting', '');
  setChannelInfo('Ready', '');
  updateStats();
  document.getElementById('statEfficiency').textContent = '—';
  drawChannel();
}

// ── Init ───────────────────────────────────────────
function resizeCanvas() {
  canvas.width = canvas.offsetWidth;
  drawChannel();
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('load', () => {
  resizeCanvas();
  drawChannel();
});