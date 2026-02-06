// ED Chest Pain Mini-Game (vanilla JS)
// Works on GitHub Pages. No build tools needed.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const overlay = document.getElementById('overlay');
const dialogueEl = document.getElementById('dialogue');
const questionBlock = document.getElementById('questionBlock');
const dialogueActions = document.getElementById('dialogueActions');
const nextBtn = document.getElementById('nextBtn');
const cancelBtn = document.getElementById('cancelBtn');
const closeBtn = document.getElementById('closeBtn');
const restartBtn = document.getElementById('restartBtn');
const feedback = document.getElementById('feedback');
const choiceButtons = Array.from(document.querySelectorAll('.choice'));
const qText = document.getElementById('qText');
const nextQBtn = document.getElementById('nextQBtn');

// Start/login UI
const startOverlay = document.getElementById('startOverlay');
const studentNameInput = document.getElementById('studentName');
const studentIdInput = document.getElementById('studentId');
const startBtn = document.getElementById('startBtn');

// Certificate UI
const certificateBlock = document.getElementById('certificateBlock');
const certName = document.getElementById('certName');
const certId = document.getElementById('certId');
const certScore = document.getElementById('certScore');
const certDate = document.getElementById('certDate');
const downloadCsvBtn = document.getElementById('downloadCsvBtn');
const printCertBtn = document.getElementById('printCertBtn');
const submitStatus = document.getElementById('submitStatus');


document.body.style.overscrollBehavior = 'none';
document.body.style.touchAction = 'manipulation';

const ASSETS = {
  bg: 'assets/ed_bg.jpg',
  nurse: 'assets/nurse.png',
  patient: 'assets/patient.png',
};

// --- Load images ---
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

let bgImg, nurseImg, patientImg;

const keys = new Set();
// Virtual joystick (mobile)
const joystickEl = document.getElementById('joystick');
const joyThumb = document.getElementById('joyThumb');
const touchInteractBtn = document.getElementById('touchInteract');

const joy = {
  active: false,
  pointerId: null,
  centerX: 0,
  centerY: 0,
  radius: 70,   // movement radius in px
  dx: 0,        // -1..1
  dy: 0         // -1..1
};

function setThumb(px, py){
  // px/py are relative to center, clamped to radius
  joyThumb.style.transform = `translate(${px}px, ${py}px)`;
}

function resetJoy(){
  joy.active = false;
  joy.pointerId = null;
  joy.dx = 0;
  joy.dy = 0;
  setThumb(0, 0);
}

function updateJoyFromPointer(clientX, clientY){
  const rx = clientX - joy.centerX;
  const ry = clientY - joy.centerY;
  const dist = Math.hypot(rx, ry);
  const clamped = dist > joy.radius ? joy.radius / dist : 1;
  const px = rx * clamped;
  const py = ry * clamped;

  // Normalize to -1..1
  joy.dx = px / joy.radius;
  joy.dy = py / joy.radius;

  setThumb(px, py);
}

function computeJoyCenter(){
  if (!joystickEl) return;
  const r = joystickEl.getBoundingClientRect();
  joy.centerX = r.left + r.width/2;
  joy.centerY = r.top + r.height/2;
}

function tryLockLandscape(){
  // Works on some Android browsers; iOS Safari usually ignores
  try{
    if (screen.orientation && screen.orientation.lock){
      screen.orientation.lock('landscape').catch(()=>{});
    }
  }catch(e){}
}

if (joystickEl){
  computeJoyCenter();
  window.addEventListener('resize', computeJoyCenter);

  joystickEl.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    tryLockLandscape();
    joystickEl.setPointerCapture(e.pointerId);
    joy.active = true;
    joy.pointerId = e.pointerId;
    computeJoyCenter();
    updateJoyFromPointer(e.clientX, e.clientY);
  });

  joystickEl.addEventListener('pointermove', (e)=>{
    if (!joy.active || e.pointerId !== joy.pointerId) return;
    e.preventDefault();
    updateJoyFromPointer(e.clientX, e.clientY);
  });

  const end = (e)=>{
    if (!joy.active || e.pointerId !== joy.pointerId) return;
    e.preventDefault();
    resetJoy();
  };
  joystickEl.addEventListener('pointerup', end);
  joystickEl.addEventListener('pointercancel', end);
}

if (touchInteractBtn){
  touchInteractBtn.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    tryLockLandscape();
    if (started && canInteract() && !overlayOpen()) startDialogue();
  });
}




window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','e'].includes(k)) {
    e.preventDefault();
  }
  keys.add(k);

  // Interact
  if (k === 'e' && started && canInteract() && !overlayOpen()) {
    startDialogue();
  }
});

window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

// --- World setup ---
const world = { w: canvas.width, h: canvas.height };

const nurse = { x: 140, y: 390, w: 46, h: 76, speed: 2.3 };

const patient = {
  // Positioned on left bed area
  x: 250,
  y: 290,
  w: 66,
  h: 82,
};

const interactZone = {
  x: 210,
  y: 250,
  w: 220,
  h: 170,
};

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function rectsOverlap(a, b) {
  return (a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.y < b.y + b.h &&
          a.y + a.h > b.y);
}

function canInteract() {
  return rectsOverlap(nurse, interactZone);
}

function overlayOpen() {
  return !overlay.classList.contains('hidden');
}

// --- Dialogue / Quiz flow ---
const dialogueLines = [
  "Nurse: Hello, I’m here to help. What seems to be the problem?",
  "Patient: Nurse… I’m having chest pain.",
  "Nurse: Okay. I’m going to assess you and act quickly.",
];

let dialogueIndex = 0;

// Question bank (edit anytime)
const questions = [
  {
    q: "As a nurse, what is the first thing you will do?",
    options: [
      { key: "oxygen", label: "Give oxygen" },
      { key: "ecg", label: "Do ECG" },
      { key: "rest", label: "Encourage patient to rest" },
      { key: "ivd", label: "Give IVD" },
    ],
    correct: "ecg",
    feedback: {
      correct: "✅ Correct: Do ECG early for chest pain (follow local protocol).",
      oxygen: "⚠️ Oxygen is for hypoxia/low SpO₂ or respiratory distress, not automatically for everyone.",
      rest: "⚠️ Rest helps, but urgent assessment is needed first (ECG/monitoring).",
      ivd: "⚠️ IV access is important, but early ECG/assessment comes first.",
    }
  },
  {
    q: "During ABCDE assessment, what do you assess first?",
    options: [
      { key: "a", label: "Airway" },
      { key: "b", label: "Breathing" },
      { key: "c", label: "Circulation" },
      { key: "d", label: "Disability (neurology)" },
    ],
    correct: "a",
    feedback: {
      correct: "✅ Correct: Start with Airway (A), then Breathing, Circulation, Disability, Exposure.",
      b: "⚠️ Breathing comes after ensuring the airway is patent.",
      c: "⚠️ Circulation is critical, but ABCDE begins with Airway.",
      d: "⚠️ Disability comes after Circulation in ABCDE."
    }
  },
  {
    q: "Which vital signs should be checked immediately for a chest pain patient?",
    options: [
      { key: "bp", label: "Blood pressure only" },
      { key: "hr", label: "Heart rate only" },
      { key: "spo2", label: "SpO₂ only" },
      { key: "all", label: "BP, HR, RR, SpO₂, temperature" },
    ],
    correct: "all",
    feedback: {
      correct: "✅ Correct: Check the full set of vital signs (and repeat as needed).",
      bp: "⚠️ BP is important, but you need the full set of vitals.",
      hr: "⚠️ HR alone is not enough—get full vitals.",
      spo2: "⚠️ SpO₂ is important, but you still need BP/HR/RR/temp."
    }
  },
  {
    q: "Which is the quickest tool to document chest pain severity at triage?",
    options: [
      { key: "nrs", label: "Numeric Rating Scale (0–10)" },
      { key: "gcs", label: "Glasgow Coma Scale" },
      { key: "braden", label: "Braden Scale" },
      { key: "apgar", label: "APGAR score" },
    ],
    correct: "nrs",
    feedback: {
      correct: "✅ Correct: Use NRS (0–10) to document pain quickly.",
      gcs: "⚠️ GCS is for consciousness level, not pain severity.",
      braden: "⚠️ Braden is for pressure injury risk, not pain scoring.",
      apgar: "⚠️ APGAR is for newborn assessment."
    }
  },
  {
    q: "Suspected MI pathway: which medication is commonly given early if no contraindication (per protocol)?",
    options: [
      { key: "aspirin", label: "Aspirin" },
      { key: "paracetamol", label: "Paracetamol" },
      { key: "amoxicillin", label: "Amoxicillin" },
      { key: "furosemide", label: "Furosemide" },
    ],
    correct: "aspirin",
    feedback: {
      correct: "✅ Correct: Aspirin is commonly given early for suspected ACS/MI if not contraindicated (follow local orders/protocol).",
      paracetamol: "⚠️ Paracetamol does not address coronary thrombosis in ACS.",
      amoxicillin: "⚠️ Antibiotics are not a first-line ACS/MI treatment.",
      furosemide: "⚠️ Furosemide may be used for fluid overload, not first-line MI treatment."
    }
  },
  {
    q: "ECG shows ST elevation with ongoing chest pain. What is the priority next step?",
    options: [
      { key: "activate", label: "Activate STEMI/MI pathway and notify the medical team immediately" },
      { key: "wait", label: "Wait 2 hours and repeat ECG later" },
      { key: "discharge", label: "Discharge the patient if pain improves" },
      { key: "antacid", label: "Give antacid and observe only" },
    ],
    correct: "activate",
    feedback: {
      correct: "✅ Correct: Escalate immediately—activate the STEMI/MI pathway and inform the team.",
      wait: "⚠️ Delay is dangerous in STEMI—urgent escalation is needed.",
      discharge: "⚠️ Do not discharge—ST elevation needs urgent management.",
      antacid: "⚠️ Antacid may be used if indicated, but ST elevation needs urgent escalation."
    }
  },
  {
    q: "When should oxygen be given to a chest pain patient?",
    options: [
      { key: "hypoxia", label: "When SpO₂ is low or there are signs of hypoxia/respiratory distress" },
      { key: "always", label: "Always give oxygen to all chest pain patients" },
      { key: "afterecg", label: "Only after ECG is done, no matter what" },
      { key: "never", label: "Never give oxygen for chest pain" },
    ],
    correct: "hypoxia",
    feedback: {
      correct: "✅ Correct: Give oxygen if SpO₂ is low or hypoxia is suspected (follow local targets/protocol).",
      always: "⚠️ Not routinely for everyone—use SpO₂/clinical signs to guide.",
      afterecg: "⚠️ If the patient is hypoxic, oxygen should not be delayed.",
      never: "⚠️ Oxygen is appropriate when hypoxia is present."
    }
  },
];

let qIndex = 0;
let score = 0;
let answered = false;

let studentName = '';
let studentId = '';
let started = false;
// Optional: send results to a Google Sheets web app (Apps Script). Leave blank to disable.
const RESULTS_WEB_APP_URL = ''; // <-- paste your Apps Script Web App URL here
const RESULTS_SHARED_SECRET = 'AISYAgame';



function openOverlay() {
  overlay.classList.remove('hidden');
}


function showStartOverlay(){
  if (startOverlay){
    startOverlay.classList.remove('hidden');
    // Focus first input for convenience
    setTimeout(()=>studentNameInput && studentNameInput.focus(), 50);
  }
}

function hideStartOverlay(){
  if (startOverlay){
    startOverlay.classList.add('hidden');
  }
}

function safeFilename(s){
  return (s || 'student').toString().trim().replace(/[^a-z0-9_-]+/gi,'_').slice(0,60);
}

function downloadCSVRow(rowObj){
  // Create a one-row CSV with headers that opens in Excel
  const headers = Object.keys(rowObj);
  const values = headers.map(h => {
    const v = (rowObj[h] ?? '').toString();
    // CSV escape
    const escaped = v.replace(/"/g,'""');
    return `"${escaped}"`;
  });
  const csv = headers.join(',') + "\n" + values.join(',') + "\n";
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ED_ChestPain_Score_${safeFilename(studentId)}_${safeFilename(studentName)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function submitResult(rowObj){
  if (!RESULTS_WEB_APP_URL){
    if (submitStatus) submitStatus.textContent = "Teacher submission is OFF (no web app URL set). Use Download Score (CSV).";
    return { ok:false, reason:'no_url' };
  }
  try{
    if (submitStatus) submitStatus.textContent = "Submitting score…";

    // IMPORTANT for GitHub Pages → Google Apps Script:
    // Use mode:'no-cors' to avoid CORS/preflight blocks.
    // Response will be opaque; we treat a resolved fetch as success.
    await fetch(RESULTS_WEB_APP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({}, rowObj, { secret: RESULTS_SHARED_SECRET })),
    });

    if (submitStatus) submitStatus.textContent = "✅ Score submitted (auto-collection).";
    return { ok:true };
  }catch(err){
    console.error(err);
    if (submitStatus) submitStatus.textContent = "⚠️ Submission error. Use Download Score (CSV).";
    return { ok:false, err };
  }
}

function resetQuestionUI() {
  feedback.textContent = '';
  answered = false;
  nextQBtn.classList.add('hidden');
  choiceButtons.forEach((b, i) => {
    b.disabled = false;
    b.style.opacity = '1';
  });
}

function closeOverlay() {
  overlay.classList.add('hidden');
  dialogueIndex = 0;
  dialogueActions.classList.remove('hidden');
  questionBlock.classList.add('hidden');
  resetQuestionUI();
  if (certificateBlock) certificateBlock.classList.add('hidden');
  if (submitStatus) submitStatus.textContent = '';

  if (certificateBlock) certificateBlock.classList.add('hidden');
  if (submitStatus) submitStatus.textContent = '';

}

function startDialogue() {
  openOverlay();
  dialogueActions.classList.remove('hidden');
  questionBlock.classList.add('hidden');
  dialogueIndex = 0;
  dialogueEl.textContent = dialogueLines[dialogueIndex];
  nextBtn.textContent = 'Next';
}

function showQuestion() {
  dialogueActions.classList.add('hidden');
  questionBlock.classList.remove('hidden');
  qIndex = 0;
  score = 0;
  renderQuestion();
}

function renderQuestion() {
  resetQuestionUI();
  if (certificateBlock) certificateBlock.classList.add('hidden');
  if (submitStatus) submitStatus.textContent = '';


  const item = questions[qIndex];
  qText.textContent = item.q;

  // Update the 4 buttons
  choiceButtons.forEach((btn, i) => {
    const opt = item.options[i];
    btn.dataset.choice = opt.key;
    btn.textContent = opt.label;
  });

  dialogueEl.textContent = `Question ${qIndex + 1} of ${questions.length} • Score: ${score}`;
}

nextBtn.addEventListener('click', () => {
  dialogueIndex += 1;
  if (dialogueIndex < dialogueLines.length) {
    dialogueEl.textContent = dialogueLines[dialogueIndex];
    if (dialogueIndex === dialogueLines.length - 1) nextBtn.textContent = 'Start Questions';
  } else {
    showQuestion();
  }
});

cancelBtn.addEventListener('click', closeOverlay);
closeBtn.addEventListener('click', closeOverlay);

restartBtn.addEventListener('click', () => {
  nurse.x = 140;
  nurse.y = 390;
  closeOverlay();
});

nextQBtn.addEventListener('click', () => {
  qIndex += 1;
  if (qIndex >= questions.length) {
    qText.textContent = "✅ Quiz complete!";
    dialogueEl.textContent = `Final Score: ${score} / ${questions.length}`;
    feedback.textContent = "Well done! You can restart or close.";
    choiceButtons.forEach(b => b.disabled = true);
    nextQBtn.classList.add('hidden');
    return;
  }
  renderQuestion();
});

// Handle answering
choiceButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (answered) return;
    answered = true;

    const chosen = btn.dataset.choice;
    const item = questions[qIndex];

    choiceButtons.forEach(b => b.disabled = true);

    if (chosen === item.correct) {
      score += 1;
      feedback.textContent = item.feedback.correct || "✅ Correct!";
    } else {
      feedback.textContent = item.feedback[chosen] || "❌ Not quite. Review the pathway and try again.";
    }

    dialogueEl.textContent = `Question ${qIndex + 1} of ${questions.length} • Score: ${score}`;
    nextQBtn.classList.remove('hidden');
  });
});

// --- Render helpers ---
function drawImageCover(img, x, y, w, h) {
  const ir = img.width / img.height;
  const dr = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;

  if (ir > dr) {
    sh = img.height;
    sw = sh * dr;
    sx = (img.width - sw) / 2;
  } else {
    sw = img.width;
    sh = sw / dr;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawImageCover(bgImg, 0, 0, canvas.width, canvas.height);

  // Patient
  ctx.drawImage(patientImg, patient.x, patient.y, patient.w, patient.h);

  // Nurse shadow
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(nurse.x + nurse.w/2, nurse.y + nurse.h - 6, nurse.w*0.45, 8, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.drawImage(nurseImg, nurse.x - 8, nurse.y - 18, nurse.w + 16, nurse.h + 22);

  if (canInteract() && !overlayOpen()) {
    drawHint("Press E to talk", nurse.x + nurse.w/2, nurse.y - 10);
  }
}

function drawHint(text, cx, cy) {
  ctx.save();
  ctx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  const padX = 10, padY = 7;
  const m = ctx.measureText(text);
  const w = m.width + padX*2;
  const h = 24 + padY;
  const x = clamp(cx - w/2, 8, canvas.width - w - 8);
  const y = clamp(cy - h, 8, canvas.height - h - 8);

  ctx.globalAlpha = 0.9;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.stroke();

  ctx.fillStyle = '#e5e7eb';
  ctx.fillText(text, x + padX, y + 18);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- Update loop ---
function update() {
  if (started && !overlayOpen()) {
    let dx = 0, dy = 0;
    // Keyboard
    if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
    if (keys.has('arrowright') || keys.has('d')) dx += 1;
    if (keys.has('arrowup') || keys.has('w')) dy -= 1;
    if (keys.has('arrowdown') || keys.has('s')) dy += 1;
    // Virtual joystick
    dx += joy.dx;
    dy += joy.dy;

    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.sqrt(2);
      dx *= inv; dy *= inv;
    }

    nurse.x += dx * nurse.speed;
    nurse.y += dy * nurse.speed;

    nurse.x = clamp(nurse.x, 30, canvas.width - nurse.w - 30);
    nurse.y = clamp(nurse.y, 210, canvas.height - nurse.h - 20);
  }

  draw();
  requestAnimationFrame(update);
}

function resizeCanvasToContainer(){
  // Keep internal resolution fixed for pixel look, but fit CSS size to container
  const parent = canvas.parentElement;
  if (!parent) return;
  // CSS handles width:100%, so we only ensure crisp rendering
  ctx.imageSmoothingEnabled = false;
}

window.addEventListener('resize', resizeCanvasToContainer);

async function main() {
  resizeCanvasToContainer();

  [bgImg, nurseImg, patientImg] = await Promise.all([
    loadImage(ASSETS.bg),
    loadImage(ASSETS.nurse),
    loadImage(ASSETS.patient),
  ]);

  update();
}

showStartOverlay();

main().catch(err => {
  console.error(err);
  alert('Failed to load game assets. Make sure assets/ paths are correct.');
});
