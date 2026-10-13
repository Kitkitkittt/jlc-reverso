// model/viewer.js
//
// Interactive viewer for the Q2718110 Reverso Duo reference model (Calibre 854/1).
//
//   * Assembles the scene (camera, RoomEnvironment lighting, floor/shadow, controls).
//   * Drives one elapsed-time state + integer mod-24 reverse offset through
//     model/behavior.js.
//   * Applies case reversal and explosion as presentation layers on top of the
//     assembled transforms owned by model/exterior.js.
//   * Exports GLB (model/export.js), native Three JSON and a captioned PNG.
//   * Exposes window.reverso per the shared contract (see bottom of file).
//
// GEOMETRY CONTRACT (model/exterior.js createWatch)
//   watch.root          THREE.Object3D  root of the assembled watch
//   watch.parameters    plain object     illustrative presentation parameters
//
//   Required nodes (by name, matching data/scene-spec.json IDs):
//     C000 fixed assembly (cradle + bracelet); C100 moving assembly — ALL
//     reversal motion is applied here, so every display, control and the calibre
//     module must be a descendant of C100; C105/D001/D002/D003/D004 recto stack;
//     D101/D102/D103/D104 reverse stack; M000 source-informed calibre groups;
//     C106 reverse crystal; I001 crown; I003 pusher; B000 bracelet.
//
//   * Presentation offsets are local-parent millimetres, never world transforms.
//     Face layers descend from C100; case supports from C101; functional calibre
//     groups descend from M000. Restoring source poses makes composition reversible.
//   * Each such node carries userData.assembledPosition / assembledQuaternion /
//     assembledScale so model/export.js can reset a clone to the assembled pose.
//   * Recto hands are authored FLAT in the recto frame; reverse hands are
//     authored in their own visible frame (-Z of the recto frame). The viewer
//     derives the clockwise sign per face from each hand's local +Z direction,
//     so both faces run clockwise.
//   * The viewer never writes assembled positions back onto the source nodes; it
//     writes `assembled + presentationOffset` each frame, which makes the
//     assembled state the exact inverse of any presentation state.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  reversalPose,
  explosionOffsets,
  dialAngles,
  handRotations,
  handRotationSign,
  pressPusher,
  formatClockSeconds,
  dayPhase,
  parseClock,
  clamp01,
  EXPLOSION_IDS,
  EVIDENCE_LABELS,
  GEOMETRY_CAUTION,
} from './behavior.js';
import { createWatch } from './exterior.js';
import { ASSEMBLY_SECONDS, ASSEMBLY_STAGES, MOVEMENT_GROUPS, movementExplosionOffsets, assemblyOffsets, assemblyStage } from './assembly.js';
import { motionArms, motionAngle, motionPhaseFor, advanceMotionPhase, initialMotionPhase, motionStatus, BEATS_PER_SECOND } from './movement.js';

const DEG2RAD = Math.PI / 180;
const CAMERA_PRESETS = {
  recto: { dir: [0, 0, 1], up: [0, 1, 0] },
  reverse: { dir: [0, 0, -1], up: [0, 1, 0] },
  oblique: { dir: [0.32, 0.15, 1], up: [0, 1, 0] },
  exploded: { dir: [0.78, 0.28, 1], up: [0, 1, 0] },
  calibre: { dir: [0.22, -0.34, 1], up: [0, 1, 0] },
  'calibre-exploded': { dir: [0.32, -0.5, 1], up: [0, 1, 0] },
};
const REVERSAL_PLAY_SECONDS = 3.2;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const $ = id => document.getElementById(id);

function showError(where, error) {
  const box = $('error');
  const body = $('errorBody');
  if (!box || !body) return;
  const detail = error && error.stack ? error.stack : String(error);
  body.textContent += `[${where}]\n${detail}\n\n`;
  box.dataset.open = 'true';
}

window.addEventListener('error', event => showError('window', event.error || event.message));
window.addEventListener('unhandledrejection', event => showError('promise', event.reason));

function status(text) {
  const el = $('status');
  if (el) el.textContent = text || '';
}

// ---------------------------------------------------------------------------
// Viewer
// ---------------------------------------------------------------------------

class ReversoViewer {
  constructor({ watch, sceneSpec, container, labelsLayer }) {
    this.watch = watch;
    this.sceneSpec = sceneSpec;
    this.container = container;
    this.labelsLayer = labelsLayer;

    this.state = {
      seconds: 8 * 3600 + 20 * 60 + 35,
      offsetHours: 0,
      running: true,
      speed: 1,
      // Independent running phase: the train accumulator takes wall-clock time
      // times the selected speed on each running frame, the oscillator
      // accumulator takes plain wall-clock seconds. Speed is therefore applied
      // exactly once, as it elapses, so changing it later cannot re-scale time
      // that has already run; pausing, setting the time or correcting GMT never
      // moves a wheel, and phase 0 is exactly the assembled pose.
      motionPhase: initialMotionPhase(),
      reversal: 0,
      explosion: 0,
      movementExplosion: 0,
      assembly: 1,
      assemblyPlaying: false,
      view: 'recto',
      labels: false,
      legend: false,
      dialZeroAngle: 0,
    };

    // Node bookkeeping: cached assembled transforms + live base poses.
    this.nodes = new Map();       // id -> Object3D
    this.assembled = new Map();   // id -> { position, quaternion, scale }
    this.explodeIds = EXPLOSION_IDS.slice();
    this.hands = null;

    this.reversalPlaying = false;
    this.reversalElapsed = 0;
    this.lastFrame = 0;
    this.assemblyActive = false;
    this.focusVisibility = null;
    this.focusBounds = null;


    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._collectNodes();
    this._resolveHandSigns();
    this._initControls();
    this._buildLegend();
    this._bindUI();
    this.setLabels(this.state.labels);
    this._refreshReadouts();
    this.apply(0);
    this._refreshMotion();
    this._refreshAssembly();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // -- setup ----------------------------------------------------------------

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x14161a, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14161a);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const studio = new THREE.Scene();
    // Dark surround and broad neutral softboxes give steel readable highlight edges.
    studio.background = new THREE.Color(0x303238);
    const panelGeometry = new THREE.PlaneGeometry(1, 1);
    const panelMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    for (const [x, y, z, w, h] of [[-7, 2, 10, 4, 16], [8, 4, 6, 3, 14], [0, 10, -8, 12, 4], [2, -2, -10, 5, 12], [0, 1, 14, 9, 7]]) {
      const panel = new THREE.Mesh(panelGeometry, panelMaterial);
      panel.position.set(x, y, z);
      panel.scale.set(w, h, 1);
      panel.lookAt(0, 0, 0);
      studio.add(panel);
    }
    this.scene.environment = pmrem.fromScene(studio, 0.02).texture;
    this.scene.environmentIntensity = 1.15;
    panelGeometry.dispose();
    panelMaterial.dispose();
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(34, 52, 40);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 240;
    key.shadow.camera.left = -70;
    key.shadow.camera.right = 70;
    key.shadow.camera.top = 70;
    key.shadow.camera.bottom = -70;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.6;
    this.scene.add(key);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0xf0f3ff, 0.85);
    fill.position.set(-46, 18, -34);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.75);
    rim.position.set(0, -30, -50);
    this.scene.add(rim);

    // Floor + contact shadow. Kept subtle so it supports the model, not competes.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.0, roughness: 1.0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.floor = floor;

    // Watch root, owned by model/exterior.js createWatch.
    this.watchRoot = this.watch.root;
    this.scene.add(this.watchRoot);

    this.movingNode = this.watchRoot.getObjectByName('C100') || null;
    if (!this.movingNode) {
      showError('geometry', new Error('watch.root has no C100 moving assembly; reversal cannot be applied'));
    }

    // Sit the floor just below the lowest watch point so the whole bracelet,
    // including the lower links, stays visible. A small illustrative gap keeps
    // the contact shadow readable; this is not a measured ground plane.
    this.watchRoot.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.watchRoot);
    floor.position.y = bounds.min.y - 2;
  }

  _initCamera() {
    const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(30, aspect, 0.5, 2000);
    this.camera.position.set(0, 6, 150);
    this.camera.lookAt(0, 0, 0);
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.7;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 1800;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.minPolarAngle = 0;
    this.controls.target.set(0, 0, 0);
    this.controls.addEventListener('start', () => { this._userMovedCamera = true; });
  }

  _collectNodes() {
    for (const id of [...this.explodeIds, ...Object.keys(MOVEMENT_GROUPS)]) {
      const node = this.watchRoot.getObjectByName(id);
      if (!node) continue;
      this.nodes.set(id, node);
      const ud = node.userData || {};
      this.assembled.set(id, {
        position: new THREE.Vector3().fromArray(ud.assembledPosition || node.position.toArray()),
        quaternion: new THREE.Quaternion().fromArray(ud.assembledQuaternion || node.quaternion.toArray()),
        scale: new THREE.Vector3().fromArray(ud.assembledScale || node.scale.toArray()),
      });
      // Publish the assembled pose so model/export.js can reset a clone exactly.
      if (!ud.assembledPosition) node.userData.assembledPosition = node.position.toArray();
      if (!ud.assembledQuaternion) node.userData.assembledQuaternion = node.quaternion.toArray();
      if (!ud.assembledScale) node.userData.assembledScale = node.scale.toArray();
    }

    const handIds = { recto: ['D002', 'D003', 'D004'], reverse: ['D102', 'D103', 'D104'] };
    const hands = { recto: [], reverse: [] };
    for (const face of ['recto', 'reverse']) {
      for (const id of handIds[face]) {
        const node = this.watchRoot.getObjectByName(id);
        if (!node) continue;
        hands[face].push({ id, node, base: node.quaternion.clone() });
      }
    }
    this.hands = hands;

    this.toggleNodes = {
      M000: this.watchRoot.getObjectByName('M000'),
      C105: this.watchRoot.getObjectByName('C105'),
      C106: this.watchRoot.getObjectByName('C106'),
      B000: this.watchRoot.getObjectByName('B000'),
    };

    // Running calibre arms: each animated mesh spins about its own local +Z.
    // The base quaternion is the assembled pose, so motion is composed on top of
    // it (never baked in) and phase 0 restores the export pose exactly.
    this.motionArms = motionArms(this.watchRoot).map(arm => ({
      ...arm, base: arm.node.quaternion.clone(),
    }));
  }

  /**
   * Determine, for each hand, the sign of the local +Z rotation that reads
   * clockwise to a viewer of that face. Uses the node's local +Z axis expressed
   * in the assembled recto frame, so reverse hands authored in their own visible
   * frame get the opposite sign from flat recto hands (docs/10 line 33).
   */
  _resolveHandSigns() {
    this.handSign = { recto: -1, reverse: -1 };
    this.watchRoot.updateMatrixWorld(true);
    const worldPlusZ = new THREE.Vector3();
    const pickSign = (face) => {
      const entry = this.hands[face][0];
      if (!entry) return face === 'reverse' ? -1 : -1;
      entry.node.updateWorldMatrix(true, false);
      worldPlusZ.set(0, 0, 1).transformDirection(entry.node.matrixWorld);
      return handRotationSign(face, worldPlusZ.z);
    };
    this.handSign.recto = pickSign('recto');
    this.handSign.reverse = pickSign('reverse');
  }

  _buildLegend() {
    const list = $('legendList');
    if (!list) return;
    const used = [
      ['observed_owner', '#7aa2ff'],
      ['observed_supplied_photo', '#8b7ae0'],
      ['verified_primary', '#6fce9a'],
      ['derived', '#e0a94f'],
      ['general_mechanical', '#9aa3b2'],
      ['project_defined', '#7f8896'],
      ['source_informed', '#e0a94f'],
      ['unknown', '#6a7280'],
    ];
    list.textContent = '';
    // The caution applies to the whole model, independent of any evidence badge,
    // so it is always shown at the top of the legend.
    const caution = document.createElement('p');
    caution.className = 'legend-caution';
    caution.textContent = GEOMETRY_CAUTION;
    list.appendChild(caution);
    for (const [key, color] of used) {
      const row = document.createElement('div');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = color;
      const text = document.createElement('span');
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = key;
      const v = document.createElement('span');
      v.className = 'v';
      v.textContent = ' — ' + (EVIDENCE_LABELS[key] || '');
      text.appendChild(k);
      text.appendChild(v);
      row.appendChild(dot);
      row.appendChild(text);
      list.appendChild(row);
    }
  }

  // -- state application ----------------------------------------------------

  /**
   * Recompute every node transform from the single time state plus the reversal
   * and explosion presentation layers. Called on every state change and frame.
   */
  apply(deltaSeconds = 0, realSeconds = deltaSeconds) {
    if (deltaSeconds) {
      this.state.seconds += deltaSeconds;
      // Advance the running phase on wall-clock time. The train's speed factor
      // is baked into its accumulator here, once per elapsed frame, instead of
      // being re-applied at read time: re-applying it would re-scale the whole
      // elapsed history on the next frame and jump the wheels whenever the
      // speed control changed while paused.
      if (this.state.running) this.state.motionPhase = advanceMotionPhase(this.state.motionPhase, realSeconds, this.state.speed);
    }

    const { seconds, offsetHours, reversal, explosion, dialZeroAngle } = this.state;

    // Clock hands: signed local +Z rotations onto each hand's assembled pose.
    if (this.hands) {
      const rotations = handRotations(seconds, offsetHours, dialZeroAngle, this.handSign);
      const axis = new THREE.Vector3(0, 0, 1);
      const q = new THREE.Quaternion();
      for (const face of ['recto', 'reverse']) {
        const map = face === 'recto'
          ? { hour: 'hour', minute: 'minute', seconds: 'seconds' }
          : { hour: 'hour', minute: 'minute', seconds: 'hours24' };
        for (const entry of this.hands[face]) {
          const key = entry.id === 'D002' || entry.id === 'D102' ? 'hour'
            : entry.id === 'D003' || entry.id === 'D103' ? 'minute' : 'seconds';
          const angle = rotations[face][map[key]];
          q.setFromAxisAngle(axis, angle);
          entry.node.quaternion.copy(entry.base).multiply(q);
        }
      }
    }

    // C100 carries BOTH the reversal pose and its own explosion offset. They
    // must be summed in one place: a later per-child explosion write would
    // otherwise reset the reversal pose back to the assembled position.
    const offsets = explosionOffsets(explosion);
    const movingOffset = offsets.C100 || [0, 0, 0];
    if (this.movingNode) {
      const pose = reversalPose(reversal);
      const base = this.assembled.get('C100');
      const basePosition = base ? base.position : new THREE.Vector3();
      this.movingNode.position.set(
        basePosition.x + pose.position[0] + movingOffset[0],
        basePosition.y + pose.position[1] + movingOffset[1],
        basePosition.z + pose.position[2] + movingOffset[2],
      );
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.angle);
      this.movingNode.quaternion.copy(base ? base.quaternion : new THREE.Quaternion()).multiply(q);
    }

    // Explosion: additive local-parent offsets; nested supports move only once.
    // C100 itself is handled above so its reversal pose is not overwritten.
    for (const [id, offset] of Object.entries(offsets)) {
      if (id === 'C100') continue;
      const node = this.nodes.get(id);
      const base = this.assembled.get(id);
      if (!node || !base) continue;
      node.position.set(
        base.position.x + offset[0],
        base.position.y + offset[1],
        base.position.z + offset[2],
      );
    }

    const movementOffsets = this.assemblyActive
      ? assemblyOffsets(this.state.assembly)
      : movementExplosionOffsets(this.state.movementExplosion);
    for (const [id, offset] of Object.entries(movementOffsets)) {
      const node = this.nodes.get(id), base = this.assembled.get(id);
      if (!node || !base || node.parent?.name !== 'M000') continue;
      node.position.set(base.position.x + offset[0], base.position.y + offset[1], base.position.z + offset[2]);
      node.quaternion.copy(base.quaternion);
      node.scale.copy(base.scale);
    }

    // Running calibre: compose each arm's educational angle on its assembled
    // quaternion. Wheel arms read the speed-scaled train accumulator, the
    // balance, escapement and fork read the wall-clock accumulator, so this is a
    // pure function of the running phase and never depends on the display time,
    // the GMT offset or frame timing.
    if (this.motionArms) {
      const axis = new THREE.Vector3(0, 0, 1);
      const q = new THREE.Quaternion();
      const phase = this.state.motionPhase;
      for (const arm of this.motionArms) {
        q.setFromAxisAngle(axis, motionAngle(arm.motion, motionPhaseFor(arm.motion, phase)));
        arm.node.quaternion.copy(arm.base).multiply(q);
      }
    }

    // Traceable display state, inherited by native/GLB assembled snapshots so an
    // exported file records the pose it was saved at.
    this.watchRoot.userData.displayState = {
      seconds: this.state.seconds,
      reverseOffsetHours: this.state.offsetHours,
      reverse24hZeroAngleDegrees: this.state.dialZeroAngle,
      zeroOrientationStatus: 'illustrative',
      movementExplosion: this.state.movementExplosion,
      educationalAssemblyProgress: this.state.assembly,
      educationalAssemblyActive: this.assemblyActive,
      motionPhase: { ...this.state.motionPhase },
      motion: motionStatus({
        phase: this.state.motionPhase,
        running: this.state.running,
        speed: this.state.speed,
      }),
    };
    this.watchRoot.updateMatrixWorld(true);
  }

  // -- UI binding -----------------------------------------------------------

  _bindUI() {
    // View buttons.
    for (const btn of document.querySelectorAll('[data-view]')) {
      btn.addEventListener('click', () => this.setView(btn.dataset.view));
    }

    // Time input + run/pause + speed.
    $('timeInput').addEventListener('change', event => {
      const parsed = parseClock(event.target.value);
      if (parsed == null) {
        event.target.value = formatClockSeconds(this.state.seconds).slice(0, 5);
        return;
      }
      this.setTime(parsed);
    });
    $('runBtn').addEventListener('click', () => this.toggleRun());
    $('resetBtn').addEventListener('click', () => this.reset());
    $('speedSelect').addEventListener('change', event => {
      this.setSpeed(Number(event.target.value) || 1);
    });

    // Pusher.
    $('pusherBtn').addEventListener('click', () => this.pressPusher());

    $('playReversalBtn').addEventListener('click', () => this.toggleReversalPlay());
    $('reversalRange').addEventListener('input', event => {
      const progress = Number(event.target.value);
      this.setReversalPlaying(false);
      this.setReversal(progress);
    });
    // Explosion (mutually exclusive with a reversal demo; setExplosion enforces
    // the exclusivity itself, so the handler just forwards the value).
    const explosionRange = $('explosionRange');
    explosionRange.addEventListener('input', event => {
      this.setExplosion(Number(event.target.value));
    });
    $('movementExplosionRange').addEventListener('input', event => this.setMovementExplosion(Number(event.target.value)));
    $('assemblyRange').addEventListener('input', event => this.setAssembly(Number(event.target.value)));
    $('playAssemblyBtn').addEventListener('click', () => this.toggleAssemblyPlay());
    $('motionRunBtn').addEventListener('click', () => this.toggleMotionRun());
    $('previousAssemblyBtn').addEventListener('click', () => this.stepAssembly(-1));
    $('nextAssemblyBtn').addEventListener('click', () => this.stepAssembly(1));

    // Display toggles.
    $('labelsToggle').addEventListener('change', event => this.setLabels(event.target.checked));
    $('legendToggle').addEventListener('change', event => this.setLegend(event.target.checked));
    $('movementToggle').addEventListener('change', event => this.setVisible('M000', event.target.checked));
    $('crystalToggle').addEventListener('change', event => {
      this.setVisible('C105', event.target.checked);
      this.setVisible('C106', event.target.checked);
    });
    $('braceletToggle').addEventListener('change', event => this.setVisible('B000', event.target.checked));

    // Downloads.
    $('glbBtn').addEventListener('click', () => this.downloadGLB());
    $('jsonBtn').addEventListener('click', () => this.downloadJSON());
    $('pngBtn').addEventListener('click', () => this.downloadPNG());

    // Error dismiss + mobile panel toggle.
    $('errorClose').addEventListener('click', () => { $('error').dataset.open = 'false'; });
    const toggle = $('panelToggle');
    toggle.addEventListener('click', () => {
      const panel = $('panel');
      const collapsed = panel.dataset.collapsed === 'true';
      panel.dataset.collapsed = String(!collapsed);
      toggle.setAttribute('aria-expanded', String(collapsed));
      // The uncovered region changed, so re-fit and re-clamp the overlay.
      this._userMovedCamera = false;
      this._frameCamera(this.state.view);
      this._syncOverlayBounds();
    });

    // Keyboard: space toggles run, arrows step time, P presses the pusher.
    window.addEventListener('keydown', event => {
      if (event.target instanceof HTMLElement && event.target.closest('input, select, button, textarea, a, [contenteditable]')) return;
      if (event.code === 'Space') { event.preventDefault(); this.toggleRun(); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); this.setTime(this.state.seconds + (event.shiftKey ? 3600 : 60)); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); this.setTime(this.state.seconds - (event.shiftKey ? 3600 : 60)); }
      else if (event.key === 'p' || event.key === 'P') { this.pressPusher(); }
      else if (event.key === 'r' || event.key === 'R') { this.toggleReversalPlay(); }
      else if (event.key === 'l' || event.key === 'L') { $('labelsToggle').click(); }
    });
  }

  // -- public state API -----------------------------------------------------

  setTime(seconds) {
    this.state.seconds = seconds;
    this.apply(0);
    this._refreshReadouts();
  }

  toggleRun() {
    this.state.running = !this.state.running;
    const btn = $('runBtn');
    btn.textContent = this.state.running ? 'Pause' : 'Run';
    btn.setAttribute('aria-pressed', String(this.state.running));
    this._refreshMotion();
    return this.state.running;
  }

  /** The dedicated running-calibre control is an alias for the same run state. */
  toggleMotionRun() { return this.toggleRun(); }

  setRunning(running) {
    if (this.state.running !== running) this.toggleRun();
  }

  /**
   * Speed only affects frames that have still to run. The train phase already
   * accumulated is left exactly as it is, so changing the control while paused
   * (or while running) never rescales history and never jumps a wheel; a later
   * setTime, GMT press or apply(0) then reproduces the same spoke quaternions.
   */
  setSpeed(speed) {
    this.state.speed = Number(speed) || 1;
    // Re-apply only to refresh the recorded display state; the train phase is
    // left where it is, so spoke quaternions are unchanged.
    this.apply(0);
    return this.state.speed;
  }

  _refreshMotion() {
    const btn = $('motionRunBtn');
    if (!btn) return;
    btn.textContent = this.state.running ? 'Pause movement' : 'Run movement';
    btn.setAttribute('aria-pressed', String(this.state.running));
  }

  pressPusher() {
    this.state.offsetHours = pressPusher(this.state.offsetHours, 1);
    this.apply(0);
    this._refreshReadouts();
    this._flashPusher();
    return this.state.offsetHours;
  }

  /** Convenience for tests and the contract: press n times, return new offset. */
  pressPusherTimes(n = 1) {
    this.state.offsetHours = pressPusher(this.state.offsetHours, n);
    this.apply(0);
    this._refreshReadouts();
    return this.state.offsetHours;
  }

  setReversal(progress) {
    if (progress > 0 && this._isCalibreView()) this.setView('oblique');
    if (progress > 0) this.setAssemblyPlaying(false);
    this.state.reversal = clamp01(progress);
    // Explosion and reversal are mutually exclusive presentation modes; this is
    // enforced in the public method, not only in the UI event handler.
    if (this.state.reversal > 0.001) this.setExplosion(0);
    this.apply(0);
    this._refreshReversal();
  }

  setReversalPlaying(playing) {
    if (playing) {
      this.setAssemblyPlaying(false);
      if (this._isCalibreView()) this.setView('oblique');
      if (this.state.reversal >= 0.999) this.state.reversal = 0;
      this.reversalElapsed = this.state.reversal * REVERSAL_PLAY_SECONDS;
      // Explosion and reversal are mutually exclusive presentation modes.
      this.setExplosion(0);
    }
    this.reversalPlaying = !!playing;
    const btn = $('playReversalBtn');
    btn.setAttribute('aria-pressed', String(this.reversalPlaying));
    btn.textContent = this.reversalPlaying ? 'Pause reversal' : 'Play reversal';
    this._refreshReversal();
  }

  toggleReversalPlay() {
    this.setReversalPlaying(!this.reversalPlaying);
    return this.reversalPlaying;
  }

  setExplosion(amount) {
    if (amount > 0 && this._isCalibreView()) this.setView('exploded');
    if (amount > 0) this.setAssemblyPlaying(false);
    this.state.explosion = clamp01(amount);
    if (this.state.explosion > 0.001) {
      this.setReversalPlaying(false);
      // Leaving a non-zero reversal pose while exploding would show a half-turn
      // plus an explosion; reset the reversal so the modes stay exclusive.
      if (this.state.reversal > 0.001) this.setReversal(0);
    }
    this.apply(0);
    this._refreshExplosion();
    if (!this._userMovedCamera) this._frameCamera(this.state.view);
  }

  setView(view) {
    if (!CAMERA_PRESETS[view]) return;
    this.setAssemblyPlaying(false);
    this.setReversalPlaying(false);
    this.state.view = view;
    this._setCalibreFocus(this._isCalibreView());
    this.state.explosion = view === 'exploded' ? 1 : 0;
    this.state.reversal = 0;
    this.assemblyActive = false;
    this.state.assembly = view === 'calibre-exploded' ? 0 : 1;
    this.state.movementExplosion = view === 'calibre-exploded' ? 1 : 0;
    this.apply(0);
    this._refreshExplosion();
    this._refreshReversal();
    this._refreshAssembly();
    this._userMovedCamera = false;
    for (const btn of document.querySelectorAll('[data-view]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.view === view));
    }
    this._frameCamera(view);
    return view;
  }

  _isCalibreView() { return this.state.view.startsWith('calibre'); }

  _setCalibreFocus(on) {
    if (on && !this.focusVisibility) {
      this.focusLabels = this.state.labels;
      this.focusVisibility = new Map();
      this.watchRoot.traverse(node => this.focusVisibility.set(node, node.visible));
      const cradle = this.watchRoot.getObjectByName('C000');
      if (cradle) cradle.visible = false;
      if (this.movingNode) {
        this.movingNode.visible = true;
        for (const node of this.movingNode.children) node.visible = node.name === 'M000';
      }
      this.floor.visible = false;
    } else if (!on && this.focusVisibility) {
      for (const [node, visible] of this.focusVisibility) node.visible = visible;
      this.focusVisibility = null;
      this.state.labels = this.focusLabels;
      $('labelsToggle').checked = this.state.labels;
      if (this.labelsLayer) this.labelsLayer.style.display = this.state.labels ? '' : 'none';
      this.floor.visible = true;
    }
    for (const id of ['h-time', 'h-pusher', 'h-reversal', 'h-explosion']) {
      $(id).closest('section').hidden = on;
    }
    // The running-calibre control belongs to the movement close views only.
    $('motionSection').hidden = !on;
    const calibreSection = $('h-calibre').closest('section');
    const assemblySection = $('h-assembly').closest('section');
    const motionSection = $('motionSection');
    const panel = $('panel');
    if (on) {
      panel.insertBefore(assemblySection, calibreSection);
      panel.insertBefore(motionSection, calibreSection);
    } else {
      panel.insertBefore(calibreSection, assemblySection);
    }
    panel.scrollTop = 0;
    for (const [id, control] of [['M000', 'movementToggle'], ['C105', 'crystalToggle'], ['B000', 'braceletToggle']]) {
      const input = $(control);
      input.disabled = on;
      input.checked = on ? id === 'M000' : this.toggleNodes[id]?.visible !== false;
    }
    $('explosionRange').disabled = on;
    $('viewCaption').textContent = on
      ? 'Source-informed educational calibre geometry — not exact 854/1 parts. Explanatory order, not workshop instructions.'
      : 'Photograph-informed exterior; proportions provisional. Educational separation, not measured layer gaps.';
  }

  setMovementExplosion(amount) {
    this.setAssemblyPlaying(false);
    this.assemblyActive = false;
    this.state.movementExplosion = clamp01(amount);
    this.state.assembly = 1 - this.state.movementExplosion;
    this.apply(0);
    this._refreshAssembly();
    if (!this._userMovedCamera) this._frameCamera(this.state.view);
  }

  setAssembly(progress) {
    this.setAssemblyPlaying(false);
    if (!this._isCalibreView()) this.setView('calibre-exploded');
    const wasActive = this.assemblyActive;
    this.assemblyActive = true;
    this.state.assembly = clamp01(progress);
    this.state.movementExplosion = 1 - this.state.assembly;
    this.apply(0);
    this._refreshAssembly();
    if (!wasActive && !this._userMovedCamera) this._frameCamera(this.state.view);
  }

  setAssemblyPlaying(playing) {
    if (playing) {
      const wasActive = this.assemblyActive;
      this.setReversalPlaying(false);
      if (!this._isCalibreView()) this.setView('calibre-exploded');
      if (this.state.assembly >= 1) this.state.assembly = 0;
      this.assemblyActive = true;
      this.state.movementExplosion = 1 - this.state.assembly;
      this.apply(0);
      if (!wasActive && !this._userMovedCamera) this._frameCamera(this.state.view);
    }
    this.state.assemblyPlaying = !!playing;
    this._refreshAssembly();
    return this.state.assemblyPlaying;
  }

  toggleAssemblyPlay() { return this.setAssemblyPlaying(!this.state.assemblyPlaying); }

  stepAssembly(direction) {
    const p = this.state.assembly;
    const stages = direction < 0 ? [...ASSEMBLY_STAGES].reverse() : ASSEMBLY_STAGES;
    const stage = stages.find(stage => direction < 0 ? stage.progress < p - 0.00001 : stage.progress > p + 0.00001);
    this.setAssembly(stage?.progress ?? (direction < 0 ? 0 : 1));
  }

  setLabels(on) {
    this.state.labels = !!on;
    $('labelsToggle').checked = this.state.labels;
    if (this.labelsLayer) this.labelsLayer.style.display = this.state.labels ? '' : 'none';
    if (!this._userMovedCamera) this._frameCamera(this.state.view);
  }

  setLegend(on) {
    this.state.legend = !!on;
    const box = $('legendBox');
    if (box) box.hidden = !this.state.legend;
  }

  setVisible(id, visible) {
    const node = this.watchRoot.getObjectByName(id);
    if (!node) return;
    if (this.focusVisibility) this.focusVisibility.set(node, !!visible);
    else node.visible = !!visible;
    if (!this._userMovedCamera) this._frameCamera(this.state.view);
  }

  reset() {
    this.setView('recto');
    this.state.seconds = 8 * 3600 + 20 * 60 + 35;
    this.state.offsetHours = 0;
    this.state.reversal = 0;
    this.state.explosion = 0;
    this.setReversalPlaying(false);
    this.state.motionPhase = initialMotionPhase();
    this.setRunning(true);
    this.setExplosion(0);
    this.setReversal(0);
    this._refreshMotion();
    this.apply(0);
    this._refreshReadouts();
    this._refreshReversal();
    this._refreshExplosion();
    $('timeInput').value = formatClockSeconds(this.state.seconds).slice(0, 5);
  }

  // -- readouts -------------------------------------------------------------

  _refreshReadouts() {
    const { seconds, offsetHours } = this.state;
    const angles = dialAngles(seconds, offsetHours, this.state.dialZeroAngle);
    const readout = $('timeReadout');
    if (readout) {
      const rt = seconds + 3600 * offsetHours;
      readout.innerHTML =
        `recto &nbsp;<b>${formatClockSeconds(seconds)}</b><br>` +
        `reverse <b>${formatClockSeconds(rt)}</b> <span class="day" title="Provisional 24 h half-cycle label; the indicator's true zero orientation is unverified (docs/10 line 31).">${dayPhase(seconds, offsetHours)} · ½-cycle</span><br>` +
        `offset&nbsp; <b>+${offsetHours} h</b> &nbsp;·&nbsp; 24 h ${angles.reverse.hours24.toFixed(1)}°`;
    }
    const input = $('timeInput');
    if (input && document.activeElement !== input) {
      input.value = formatClockSeconds(seconds).slice(0, 5);
    }
    const note = $('pusherNote');
    if (note) {
      note.dataset.offset = String(offsetHours);
    }
  }

  _refreshReversal() {
    const range = $('reversalRange');
    const label = $('reversalVal');
    const pct = Math.round(this.state.reversal * 100);
    if (range && document.activeElement !== range) range.value = String(this.state.reversal);
    if (range) range.setAttribute('aria-valuetext', `${pct}%`);
    if (label) label.textContent = `${pct}%`;
    this._refreshExplosionLock();
  }

  _refreshExplosion() {
    const range = $('explosionRange');
    const label = $('explosionVal');
    const pct = Math.round(this.state.explosion * 100);
    if (range && document.activeElement !== range) range.value = String(this.state.explosion);
    if (range) range.setAttribute('aria-valuetext', `${pct}%`);
    if (label) label.textContent = `${pct}%`;
    this._refreshExplosionLock();
  }

  _refreshAssembly() {
    const p = this.state.assembly;
    const stage = assemblyStage(p);
    const pct = Math.round(p * 100);
    const range = $('assemblyRange');
    if (range) {
      range.value = String(p);
      range.setAttribute('aria-valuetext', `${pct}% — ${stage.name}${stage.next ? `; next: ${stage.next}` : ''}`);
    }
    $('assemblyVal').textContent = `${pct}% · ${stage.name}`;
    $('assemblyExplanation').textContent = `${stage.explanation}${stage.next ? ` Next: ${stage.next}.` : ''}`;
    $('previousAssemblyBtn').disabled = p <= 0;
    $('nextAssemblyBtn').disabled = p >= 1;
    $('playAssemblyBtn').textContent = this.state.assemblyPlaying ? 'Pause assembly' : 'Play assembly';
    $('playAssemblyBtn').setAttribute('aria-pressed', String(this.state.assemblyPlaying));
    $('movementExplosionRange').value = String(this.state.movementExplosion);
    $('movementExplosionRange').setAttribute('aria-valuetext', `${Math.round(this.state.movementExplosion * 100)}%`);
    $('movementExplosionVal').textContent = `${Math.round(this.state.movementExplosion * 100)}%`;
  }

  _refreshExplosionLock() {
    const range = $('explosionRange');
    const lock = $('explosionLock');
    const demoActive = this.reversalPlaying || (this.state.reversal > 0.001 && this.state.reversal < 0.999);
    const disabled = demoActive || this._isCalibreView();
    if (range) range.disabled = disabled;
    if (lock) lock.hidden = !disabled;
  }

  _flashPusher() {
    const node = this.watchRoot.getObjectByName('I003');
    if (!node) return;
    this._pusherT = 0;
    this._pusherNode = node;
  }

  // -- camera ---------------------------------------------------------------

  /**
   * Frame the whole watch for a view direction, centring it in the *uncovered*
   * part of the viewport (the side panel on wide layouts, the bottom sheet on
   * narrow ones). Front and back views share the same fit, so recto and reverse
   * are matched.
   *
   * The fit uses the uncovered pixel box, then camera.setViewOffset() translates
   * the whole frustum so the model lands at that box's centre. setViewOffset is
   * exact (it re-maps the virtual frame onto the canvas) so no iterative
   * projection correction is needed.
   */
  _frameCamera(view) {
    const preset = CAMERA_PRESETS[view] || CAMERA_PRESETS.recto;
    const dir = new THREE.Vector3().fromArray(preset.dir).normalize();
    const up = new THREE.Vector3().fromArray(preset.up).normalize();
    this.watchRoot.updateMatrixWorld(true);
    const box = this._visibleBounds(this._isCalibreView() && (this.assemblyActive || view === 'calibre-exploded'));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 1);
    const W = this.container.clientWidth || 1;
    const H = this.container.clientHeight || 1;
    const uncovered = this._uncoveredRect();
    const narrow = uncovered.width < 560;
    // Reserve the fixed header strip so the top of the watch (and its upper
    // bracelet) never hides under the title. On narrow layouts the callout list
    // occupies the lower 40% of the uncovered region, so the model is fit into
    // what remains between the header and that band.
    const header = document.querySelector('header');
    const headerH = header
      ? Math.min(header.getBoundingClientRect().height + 8, uncovered.height * 0.3)
      : 0;
    const bandH = narrow && this.state.labels ? uncovered.height * 0.6 : uncovered.height;
    const contentTop = uncovered.top + headerH;
    const contentH = Math.max(80, uncovered.top + bandH - contentTop);
    const WU = Math.max(80, uncovered.width - (!narrow && this.state.labels ? Math.min(400, uncovered.width * 0.42) : 0));
    const HU = Math.max(80, contentH);
    const tanHalf = Math.tan((this.camera.fov * DEG2RAD) / 2);
    let distance = Math.max((radius * H) / (HU * tanHalf), (radius * H) / (WU * tanHalf)) * 1.14;
    {
      const right = new THREE.Vector3().crossVectors(up, dir).normalize();
      const cameraUp = new THREE.Vector3().crossVectors(dir, right).normalize();
      const corner = new THREE.Vector3();
      distance = 5;
      this._visibleBounds(this._isCalibreView() && (this.assemblyActive || view === 'calibre-exploded'), bounds => {
        for (const x of [bounds.min.x, bounds.max.x]) {
          for (const y of [bounds.min.y, bounds.max.y]) {
            for (const z of [bounds.min.z, bounds.max.z]) {
              corner.set(x, y, z).sub(sphere.center);
              const depth = corner.dot(dir);
              distance = Math.max(distance, depth + 1.12 * Math.abs(corner.dot(right)) * H / (WU * tanHalf), depth + 1.12 * Math.abs(corner.dot(cameraUp)) * H / (HU * tanHalf));
            }
          }
        }
      });
    }

    this.camera.up.copy(up);
    this.camera.position.copy(sphere.center).addScaledVector(dir, distance);
    this.camera.lookAt(sphere.center);

    // Place the model centre at the centre of the reserved content box.
    const rect = this.container.getBoundingClientRect();
    const cx = uncovered.left - rect.left + uncovered.width / 2;
    const cy = contentTop - rect.top + HU / 2;
    this.camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(sphere.center);
    this.controls.update();
  }

  _effectivelyVisible(node) {
    for (let parent = node; parent; parent = parent.parent) if (!parent.visible) return false;
    return true;
  }

  _visibleBounds(timeline = false, visit = null) {
    this.watchRoot.updateMatrixWorld(true);
    const box = new THREE.Box3();
    this.watchRoot.traverse(node => {
      if (!node.isMesh || !this._effectivelyVisible(node)) return;
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      const bounds = node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld);
      box.union(bounds);
      if (visit) visit(bounds);
      if (!timeline || !this._isCalibreView()) return;
      let group = node;
      while (group && group.parent?.name !== 'M000') group = group.parent;
      const spec = group && MOVEMENT_GROUPS[group.name];
      const base = group && this.assembled.get(group.name);
      if (!spec || !base) return;
      const current = group.position.clone().sub(base.position);
      const origin = group.parent.localToWorld(new THREE.Vector3());
      for (const offset of [[0, 0, 0], spec.offset]) {
        const delta = group.parent.localToWorld(new THREE.Vector3(...offset).sub(current)).sub(origin);
        const endpoint = bounds.clone().translate(delta);
        box.union(endpoint);
        if (visit) visit(endpoint);
      }
    });
    return box.isEmpty() ? new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)) : box;
  }

  /** The part of the viewport not covered by the controls panel. */
  _uncoveredRect() {
    const rect = this.container.getBoundingClientRect();
    const panel = document.getElementById('panel');
    if (!panel || getComputedStyle(panel).display === 'none') {
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }
    const p = panel.getBoundingClientRect();
    const sidePanel = rect.width > 720;
    if (sidePanel) {
      return { left: rect.left, top: rect.top, width: Math.max(120, rect.width - p.width), height: rect.height };
    }
    // Bottom sheet: keep the top portion of the viewport.
    return { left: rect.left, top: rect.top, width: rect.width, height: Math.max(140, rect.height - p.height) };
  }

  /**
   * Horizontal screen extent of the watch, in label-overlay coordinates. Used
   * to flank callouts outside the case so they never cover the dial.
   */
  _watchScreenBounds(rect) {
    const containerRect = this.container.getBoundingClientRect();
    const dx = rect.left - containerRect.left;
    const W = this.container.clientWidth;
    const corner = new THREE.Vector3();
    let left = Infinity;
    let right = -Infinity;
    this._visibleBounds(false, box => {
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            corner.set(x, y, z).project(this.camera);
            const px = (corner.x * 0.5 + 0.5) * W - dx;
            left = Math.min(left, px);
            right = Math.max(right, px);
          }
        }
      }
    });
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      return { left: 0, right: rect.width };
    }
    return { left, right };
  }

  // -- labels ---------------------------------------------------------------

  /**
   * Project the labelled nodes to screen space and place callouts without
   * overlap. Labels that belong to the face currently turned away are hidden so
   * the two dial stacks never fight for the same space. A cheap vertical
   * separation pass pushes colliding callouts apart along Y.
   */
  _updateLabels() {
    const layer = this.labelsLayer;
    if (!layer) return;
    if (!this.state.labels) {
      for (const el of layer.querySelectorAll('.label, .leader')) el.style.display = 'none';
      return;
    }
    const defs = this._isCalibreView()
      ? Object.entries(MOVEMENT_GROUPS).map(([id, group]) => [id, group.name, group.evidence || 'source_informed', 'both'])
      : [
      ['C000', 'Fixed cradle', 'observed_owner', 'both'],
      ['C100', 'Moving case', 'observed_owner', 'both'],
      ['B000', 'Bracelet', 'observed_owner', 'both'],
      ['C105', 'Recto crystal', 'observed_owner', 'recto'],
      ['D001', 'Recto dial', 'observed_owner', 'recto'],
      ['D002', 'Hour hand', 'observed_owner', 'recto'],
      ['D003', 'Minute hand', 'observed_owner', 'recto'],
      ['D004', 'Small seconds', 'observed_owner', 'recto'],
      ['I001', 'Crown', 'observed_owner', 'both'],
      ['I003', 'GMT pusher', 'observed_owner', 'both'],
      ['M000', 'Educational calibre groups', 'source_informed', 'both'],
      ['C106', 'Reverse crystal', 'observed_supplied_photo', 'reverse'],
      ['D101', 'Reverse dial', 'observed_supplied_photo', 'reverse'],
      ['D104', '24-hour indicator', 'observed_supplied_photo', 'reverse'],
    ];

    // Which face is toward the viewer? The recto face points along +Z of the
    // moving case's own frame (docs/10 line 33). Rotate that outward normal by
    // the case's live world quaternion and compare it with the camera-to-case
    // vector; a plain camera-direction test would mislabel a reversed case.
    // Both face sets are shown only during a real explosion, never for a seated
    // reversal, because a reversed-but-assembled watch still shows one face.
    const caseNode = this.movingNode || this.watchRoot;
    const outward = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(caseNode.getWorldQuaternion(new THREE.Quaternion()));
    const casePos = caseNode.getWorldPosition(new THREE.Vector3());
    const toCamera = this.camera.position.clone().sub(casePos);
    const faceToward = outward.dot(toCamera) >= 0 ? 'recto' : 'reverse';
    const exploding = this.state.explosion > 0.06;

    // Coordinates are relative to the label overlay, which resize() clamps to the
    // uncovered viewport region.
    const rect = layer.getBoundingClientRect();
    const usableW = rect.width;
    const narrow = usableW < 560;
    const headerBottom = document.querySelector('header')?.getBoundingClientRect().bottom ?? rect.top;
    const safeLabelTop = Math.max(12, headerBottom - rect.top + 12);
    const v = new THREE.Vector3();
    const placed = [];
    const seen = new Set();

    // Narrow layouts reserve the lower part of the uncovered region for a
    // wrapped list of callouts (see _frameCamera); wide layouts flank the watch
    // with two columns.
    let flowX = 8;
    let flowY = Math.max(safeLabelTop, Math.round(rect.height * 0.6) + 6);
    let flowRowH = 0;

    const visibleDefs = defs.filter(([, , , face]) =>
      face === 'both' || exploding || face === faceToward);

    let index = -1;
    for (const [id, text, evidence] of visibleDefs) {
      const node = this.watchRoot.getObjectByName(id);
      if (!node || !this._effectivelyVisible(node)) continue;
      index++;
      let el = layer.querySelector(`[data-id="${id}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'label';
        el.dataset.id = id;
        const name = document.createElement('span');
        name.textContent = `${id} ${text}`;
        const ev = document.createElement('span');
        ev.className = 'ev';
        ev.textContent = evidence;
        el.appendChild(name);
        el.appendChild(ev);
        layer.appendChild(el);
      }
      el.classList.toggle('calibre-label', this._isCalibreView());
      el.dataset.evidence = evidence;
      el.children[0].textContent = this._isCalibreView() ? `${id} ${text.replace(' (schematic)', '')}` : `${id} ${text}`;
      el.children[1].textContent = this._isCalibreView()
        ? evidence === 'source_informed' ? 'Source-informed' : 'Schematic'
        : evidence;
      el.title = EVIDENCE_LABELS[evidence] || evidence;
      const color = { observed_owner: '#7aa2ff', observed_supplied_photo: '#8b7ae0', verified_primary: '#6fce9a', source_informed: '#e0a94f' }[evidence];
      el.style.setProperty('--dot', color || '#9aa3b2');
      new THREE.Box3().setFromObject(node).getCenter(v);
      if (this._isCalibreView()) {
        const candidates = [v.clone()];
        node.traverse(child => {
          if (!child.isMesh || !this._effectivelyVisible(child)) return;
          candidates.push(new THREE.Box3().setFromObject(child).getCenter(new THREE.Vector3()));
          const vertices = child.geometry.attributes.position;
          if (!vertices) return;
          const stride = Math.max(1, Math.floor(vertices.count / 12));
          for (let i = 0; i < vertices.count; i += stride) {
            candidates.push(new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(child.matrixWorld));
          }
        });
        const ray = new THREE.Raycaster();
        let anchor = null;
        for (const point of candidates) {
          ray.set(this.camera.position, point.clone().sub(this.camera.position).normalize());
          const hit = ray.intersectObject(this.toggleNodes.M000, true).find(hit => this._effectivelyVisible(hit.object));
          if (!hit) continue;
          let target = hit.object;
          while (target && target !== node && target.parent?.name !== 'M000') target = target.parent;
          if (target === node) { anchor = hit.point; break; }
        }
        if (!anchor) continue;
        v.copy(anchor);
      }
      v.project(this.camera);
      let x = (v.x * 0.5 + 0.5) * this.container.clientWidth;
      let y = (-v.y * 0.5 + 0.5) * this.container.clientHeight;
      // Convert container coords into overlay coords.
      x -= rect.left - this.container.getBoundingClientRect().left;
      y -= rect.top - this.container.getBoundingClientRect().top;
      el.dataset.anchorX = String(x);
      el.dataset.anchorY = String(y);
      const onScreen = v.z < 1 && x > -80 && x < usableW + 80 && y > -40 && y < rect.height + 40;
      if (!onScreen) { el.style.display = 'none'; continue; }

      if (narrow) {
        // Wrapped flow list in the reserved band. Measure first, then place.
        el.style.display = '';
        const w = el.offsetWidth || 96;
        const h = el.offsetHeight || 20;
        if (flowX + w > usableW - 8 && flowX > 8) {
          flowX = 8;
          flowY += flowRowH + 6;
          flowRowH = 0;
        }
        if (flowY + h > rect.height - 4) { el.style.display = 'none'; continue; }
        el.style.left = `${Math.round(flowX + w / 2)}px`;
        el.style.top = `${Math.round(flowY + h / 2)}px`;
        flowX += w + 6;
        flowRowH = Math.max(flowRowH, h);
        seen.add(id);
        continue;
      }

      // Wide layout: flank the watch with two columns of callouts, pushed
      // outside the projected case silhouette so the dial stays clear.
      el.style.display = '';
      const w = el.offsetWidth || 96;
      const bounds = this._watchScreenBounds(rect);
      const side = index % 2 === 0 ? -1 : 1;
      const leftEdge = Math.min(bounds.left, x) - 10 - w / 2;
      const rightEdge = Math.max(bounds.right, x) + 10 + w / 2;
      x = side < 0 ? leftEdge : rightEdge;
      x = Math.min(Math.max(x, w / 2 + 4), usableW - w / 2 - 4);
      const h = el.offsetHeight || 20;
      const sameSide = placed.filter(p => p.side === side);
      y = Math.max(safeLabelTop + h / 2, sameSide.length ? sameSide.at(-1).y + (sameSide.at(-1).h + h) / 2 + 7 : safeLabelTop + h / 2);
      const coversModel = side < 0 ? x + w / 2 > bounds.left - 4 : x - w / 2 < bounds.right + 4;
      if (y + h / 2 > rect.height - 8 || coversModel) { el.style.display = 'none'; continue; }
      placed.push({ x, y, h, side });

      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      let leader = layer.querySelector(`[data-leader="${id}"]`);
      if (!leader) {
        leader = document.createElement('div');
        leader.className = 'leader';
        leader.dataset.leader = id;
        layer.prepend(leader);
      }
      const ax = Number(el.dataset.anchorX), ay = Number(el.dataset.anchorY);
      const endX = x - side * w / 2;
      Object.assign(leader.style, {
        left: `${ax}px`, top: `${ay}px`,
        width: `${Math.hypot(endX - ax, y - ay)}px`,
        transform: `rotate(${Math.atan2(y - ay, endX - ax)}rad)`, display: '',
      });
      seen.add(id);
    }
    for (const el of layer.querySelectorAll('.label')) {
      if (!seen.has(el.dataset.id)) el.style.display = 'none';
    }
    for (const leader of layer.querySelectorAll('.leader')) {
      if (narrow || !seen.has(leader.dataset.leader)) leader.style.display = 'none';
    }
  }

  // -- animation loop -------------------------------------------------------

  start() {
    const loop = (time) => {
      this._raf = requestAnimationFrame(loop);
      const dt = this.lastFrame ? Math.min((time - this.lastFrame) / 1000, 0.1) : 0;
      this.lastFrame = time;

      if (this.state.running && dt > 0) {
        this.apply(dt * this.state.speed, dt);
        this._refreshReadouts();
      }

      if (this.reversalPlaying) {
        this.reversalElapsed += dt;
        const p = this.reversalElapsed / REVERSAL_PLAY_SECONDS;
        if (p >= 1) {
          this.state.reversal = 1;
          this.setReversalPlaying(false);
        } else {
          this.state.reversal = p;
        }
        this.apply(0);
        this._refreshReversal();
      }

      if (this.state.assemblyPlaying) {
        this.state.assembly = Math.min(1, this.state.assembly + dt / ASSEMBLY_SECONDS);
        this.state.movementExplosion = 1 - this.state.assembly;
        if (this.state.assembly >= 1) this.state.assemblyPlaying = false;
        this.apply(0);
        this._refreshAssembly();
      }

      this._animatePusher(dt);
      this.render();
    };
    this._raf = requestAnimationFrame(loop);
  }

  _animatePusher(dt) {
    const node = this._pusherNode;
    if (!node) return;
    this._pusherT = (this._pusherT || 0) + dt;
    const cycle = 0.45;
    const t = this._pusherT / cycle;
    // Inward translation from the case flank, then release. Illustrative stroke.
    const stroke = t < 1 ? Math.sin(Math.min(t, 1) * Math.PI) * 0.45 : 0;
    const base = this.assembled.get('I003');
    if (base) {
      // Compose on the applied pose (assembled + live explosion offset) so the
      // stroke never overwrites the explosion and never accumulates per frame.
      const offset = explosionOffsets(this.state.explosion).I003 || [0, 0, 0];
      node.position.set(
        base.position.x + offset[0] - stroke,
        base.position.y + offset[1],
        base.position.z + offset[2],
      );
    }
    if (t >= 2) { this._pusherNode = null; this._pusherT = 0; }
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    // Keep the model centred in the uncovered viewport unless the user has taken
    // manual control of the camera.
    if (!this._userMovedCamera) this._frameCamera(this.state.view);
    this._syncOverlayBounds();
  }

  /** Clamp the label overlay to the uncovered region so callouts never sit under
   *  the controls panel. */
  _syncOverlayBounds() {
    if (!this.labelsLayer) return;
    const rect = this.container.getBoundingClientRect();
    const un = this._uncoveredRect();
    this.labelsLayer.style.left = `${un.left - rect.left}px`;
    this.labelsLayer.style.top = `${un.top - rect.top}px`;
    this.labelsLayer.style.width = `${un.width}px`;
    this.labelsLayer.style.height = `${un.height}px`;
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this._updateLabels();
  }


  // -- exports --------------------------------------------------------------

  async downloadGLB() {
    try {
      status('exporting GLB…');
      const { exportModel } = await import('./export.js');
      const blob = await exportModel(this.watch, this.sceneSpec);
      downloadBlob(blob, 'q2718110-reference.glb');
      status('');
    } catch (error) {
      status('');
      showError('GLB export', error);
    }
  }

  /**
   * Shared-contract entry point: return the parent export module's GLB Blob
   * without triggering a download, so an external renderer or smoke run can
   * consume it directly (window.reverso.exportModel()).
   */
  async exportModel() {
    const { exportModel } = await import('./export.js');
    return exportModel(this.watch, this.sceneSpec);
  }

  /**
   * Native Three.js JSON of the assembled model, authored in millimetres. The
   * project export module (model/export.js) owns the assembled-pose source: it
   * clones the watch, restores every presentation transform (including the six
   * hand quaternions) and returns a plain Object3D. We serialise that clone with
   * Object3D.toJSON(), so the live scene is never mutated. The result is native
   * Three JSON (not glTF), so millimetre authoring is correct here; glTF stays
   * metres via exportModel().
   */
  async downloadJSON() {
    try {
      status('exporting Three JSON…');
      const { assembledSource } = await import('./export.js');
      const source = assembledSource(this.watch, this.sceneSpec);
      const json = source.toJSON();
      json.asset = { ...(json.asset || {}), generator: 'Q2718110 native Three.js JSON (assembled, mm)' };
      downloadBlob(
        new Blob([JSON.stringify(json)], { type: 'application/json' }),
        'q2718110-assembled.three.json',
      );
      status('');
    } catch (error) {
      status('');
      showError('Three JSON export', error);
    }
  }

  /**
   * Compose the current view into a PNG Blob: the rendered canvas, the visible
   * part callouts drawn at their on-screen positions, and a width-wrapped
   * accuracy caption. downloadPNG() and any external plate renderer share this
   * so the composition lives in one place.
   */
  async capturePNG() {
    // Render once more so the captured canvas is current and caption-aligned.
    this.render();
    const source = this.renderer.domElement;
    const scale = 2;
    const sw = source.width;
    const sh = source.height;
    const pad = 16 * scale;
    const lineH = 20 * scale;
    const fontPx = 14 * scale;

    // The renderer canvas covers the whole stage, but the controls panel hides
    // part of it and the model is centred in the uncovered region, so a full
    // canvas would export a large blank strip. Crop to the union of the
    // uncovered region and the model's projected bounds, with a small margin.
    const crop = this._captureCrop(sw, sh, pad);

    const measure = document.createElement('canvas').getContext('2d');
    measure.font = `${fontPx}px system-ui, sans-serif`;
    const lines = this._accuracyCaption()
      .split('\n')
      .flatMap(line => wrapText(measure, line, crop.w - pad * 2));
    const captionH = Math.round(lines.length * lineH + pad);

    const out = document.createElement('canvas');
    out.width = crop.w;
    out.height = crop.h + captionH;
    const ctx = out.getContext('2d');
    ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

    // The WebGL canvas alone has no labels, so copy the live callouts in.
    this._drawLabelsOnCanvas(ctx, crop);

    ctx.fillStyle = '#14161a';
    ctx.fillRect(0, crop.h, crop.w, captionH);
    ctx.fillStyle = '#e7e9ee';
    ctx.font = `${fontPx}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, pad, crop.h + pad / 2 + i * lineH));

    return new Promise(resolve => out.toBlob(resolve, 'image/png'));
  }

  /**
   * The pixel rectangle to export: the uncovered viewport region widened to
   * include the projected model bounds, clamped to the canvas. Uses the same
   * camera projections as the live callouts so the crop matches what is shown.
   */
  _captureCrop(sw, sh, pad) {
    const containerRect = this.container.getBoundingClientRect();
    const cw = containerRect.width || 1;
    const ch = containerRect.height || 1;
    const sx = sw / cw;
    const sy = sh / ch;
    const un = this._uncoveredRect();
    let left = un.left - containerRect.left;
    let top = un.top - containerRect.top;
    let right = left + un.width;
    let bottom = top + un.height;

    // Union with the projected watch so the full model is always preserved.
    this.watchRoot.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    for (const node of this._labelTargets()) {
      node.getWorldPosition(v).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * cw;
      const y = (-v.y * 0.5 + 0.5) * ch;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }

    const m = pad / 2;
    left = Math.max(0, left - m);
    top = Math.max(0, top - m);
    right = Math.min(cw, right + m);
    bottom = Math.min(ch, bottom + m);
    const x = Math.round(left * sx);
    const y = Math.round(top * sy);
    const w = Math.max(1, Math.round((right - left) * sx));
    const h = Math.max(1, Math.round((bottom - top) * sy));
    return { x: Math.min(x, sw - w), y: Math.min(y, sh - h), w, h };
  }

  /** Ids that should always appear in an exported crop even if labels are off. */
  _labelTargets() {
    const ids = this._isCalibreView() ? Object.keys(MOVEMENT_GROUPS) : ['C100', 'C101', 'C102', 'D100', 'D101', 'D102', 'D104', 'C105', 'C106', 'M000'];
    const nodes = [];
    for (const id of ids) {
      const node = this.watchRoot.getObjectByName(id);
      if (node && this._effectivelyVisible(node)) nodes.push(node);
    }
    return nodes;
  }

  /**
   * Copy the visible DOM callouts onto the cropped 2D canvas so an exported
   * plate is self-describing. Positions come from the overlay bounding rects and
   * are scaled from CSS pixels to renderer pixels, then offset by the crop.
   */
  _drawLabelsOnCanvas(ctx, crop) {
    const layer = this.labelsLayer;
    if (!layer || !this.state.labels) return;
    const layerRect = layer.getBoundingClientRect();
    if (!layerRect.width || !layerRect.height) return;
    const containerRect = this.container.getBoundingClientRect();
    const px = this.renderer.domElement.width / (containerRect.width || 1);
    const py = this.renderer.domElement.height / (containerRect.height || 1);
    ctx.textBaseline = 'top';
    for (const el of layer.querySelectorAll('.label')) {
      if (el.style.display === 'none') continue;
      const r = el.getBoundingClientRect();
      // CSS px relative to the container, then to the cropped canvas.
      const cx = (r.left + r.width / 2 - containerRect.left) * px - crop.x;
      const cy = (r.top + r.height / 2 - containerRect.top) * py - crop.y;
      const bw = r.width * px;
      const bh = r.height * py;
      if (layerRect.width >= 560) {
        const ax = (layerRect.left - containerRect.left + Number(el.dataset.anchorX)) * px - crop.x;
        const ay = (layerRect.top - containerRect.top + Number(el.dataset.anchorY)) * py - crop.y;
        ctx.strokeStyle = 'rgba(190, 198, 210, 0.5)';
        ctx.lineWidth = px;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(cx + (ax < cx ? -bw / 2 : bw / 2), cy);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(20, 22, 26, 0.82)';
      roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, 4 * px);
      ctx.fill();
      const dot = getComputedStyle(el).getPropertyValue('--dot').trim() || '#9aa3b2';
      ctx.fillStyle = dot;
      ctx.beginPath();
      ctx.arc(cx - bw / 2 + 9 * px, cy, 3.5 * px, 0, Math.PI * 2);
      ctx.fill();
      for (const span of el.children) {
        const rect = span.getBoundingClientRect();
        const style = getComputedStyle(span);
        const fontSize = parseFloat(style.fontSize) * py;
        const lineHeight = parseFloat(style.lineHeight) * py || fontSize * 1.2;
        ctx.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
        ctx.fillStyle = style.color;
        const x = (rect.left - containerRect.left) * px - crop.x;
        const y = (rect.top - containerRect.top) * py - crop.y;
        wrapText(ctx, span.textContent, rect.width * px)
          .forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
      }
    }
  }

  /**
   * Also return the caption text so an external plate renderer can stamp the
   * same accuracy statement as the in-page PNG export.
   */
  accuracyCaption() {
    return this._accuracyCaption();
  }

  async downloadPNG() {
    try {
      status('rendering PNG…');
      const blob = await this.capturePNG();
      downloadBlob(blob, `q2718110-${this.state.view}.png`);
      status('');
    } catch (error) {
      status('');
      showError('PNG export', error);
    }
  }

  _accuracyCaption() {
    const s = this.state;
    const angles = dialAngles(s.seconds, s.offsetHours, s.dialZeroAngle);
    return [
      `Q2718110 Reverso Duo · Calibre 854/1 · view: ${s.view} · recto ${formatClockSeconds(s.seconds)} · reverse ${formatClockSeconds(s.seconds + 3600 * s.offsetHours)} (+${s.offsetHours} h, 24 h half-cycle ${dayPhase(s.seconds, s.offsetHours)} — provisional)`,
      `24 h indicator ${angles.reverse.hours24.toFixed(1)}° (dial zero ${s.dialZeroAngle}°, unverified) · reversal ${Math.round(s.reversal * 100)}% · explosion ${Math.round(s.explosion * 100)}%`,
      `Calibre separation ${Math.round(s.movementExplosion * 100)}% · educational assembly ${Math.round(s.assembly * 100)}% · ${assemblyStage(s.assembly).name}`,
      `Running calibre: ${s.running ? 'running' : 'paused'} · train phase ${s.motionPhase.trainElapsedSeconds.toFixed(1)} s · balance phase ${s.motionPhase.oscillatorElapsedSeconds.toFixed(1)} s · ${BEATS_PER_SECOND} beats/s (catalogue 21,600 vph) · train speeds and amplitudes illustrative`,
      'Mechanism source: Timekeeper’s Corner video (S07), title-attributed 854/1; exact engraving not confirmed. https://www.youtube.com/watch?v=BohN-EtjQuw&t=210s',
      GEOMETRY_CAUTION,
    ].join('\n');
  }
}

/** Greedy word wrap to a pixel width, using the given 2D context's font. */
function wrapText(ctx, text, maxWidth) {
  if (maxWidth <= 0 || !text) return [text];
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Rounded-rectangle path for the 2D canvas label plates. */
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function downloadBlob(blob, filename) {
  if (!blob) throw new Error(`nothing to download for ${filename}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  const container = $('stage');
  const labelsLayer = $('labels');

  const res = await fetch('../data/scene-spec.json');
  if (!res.ok) throw new Error(`scene-spec.json: HTTP ${res.status}`);
  const sceneSpec = await res.json();

  const watch = await createWatch(sceneSpec);
  if (!watch || !watch.root) throw new Error('createWatch() must return { root, parameters, meta }');

  const viewer = new ReversoViewer({ watch, sceneSpec, container, labelsLayer });
  window.reverso = viewer;
  viewer.setTime(viewer.state.seconds);
  viewer.setView('recto');
  viewer.start();
  return viewer;
}

boot().catch(error => showError('boot', error));

export { ReversoViewer };
