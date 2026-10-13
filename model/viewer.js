// model/viewer.js
//
// Interactive viewer for the Q2718110 Reverso Duo reference model (Calibre 854/1).
//
//   * Assembles the scene (camera, procedural warm-neutral studio, contact
//     shadow, orbit controls).
//   * Drives one elapsed-time state + integer mod-24 reverse offset through
//     model/behavior.js.
//   * Applies case reversal and explosion as presentation layers on top of the
//     assembled transforms owned by model/exterior.js.
//   * Presents three modes — Watch, Mechanism, Sources — over the same scene:
//     Watch is a close, slightly angled case view with one obvious Flip action;
//     Mechanism owns the calibre explosion/assembly timeline; Sources holds the
//     evidence qualifications and locators.
//   * Picks real parts by pointer raycast or by the keyboard-accessible part
//     list, and shows a human name, description and technical evidence details.
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
//   * The selection highlight is a scene-level overlay of clones driven from the
//     live world matrices. It is never a child of watch.root, so it can never be
//     serialised into the GLB or the native JSON, and exports need no undo step.

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

/**
 * Camera presets. `fit` names the node whose visible extent is framed, so the
 * default Watch views frame the moving case and its controls — never the whole
 * bracelet. The whole-watch comparison view is opted into explicitly.
 */
const CAMERA_PRESETS = {
  recto: { dir: [0, 0, 1], up: [0, 1, 0], fit: 'case', margin: 1.18 },
  reverse: { dir: [0, 0, -1], up: [0, 1, 0], fit: 'case', margin: 1.18 },
  oblique: { dir: [0.34, 0.16, 1], up: [0, 1, 0], fit: 'case', margin: 1.2 },
  whole: { dir: [0.14, 0.1, 1], up: [0, 1, 0], fit: 'watch', margin: 1.12 },
  exploded: { dir: [0.78, 0.28, 1], up: [0, 1, 0], fit: 'watch', margin: 1.14 },
  calibre: { dir: [0.22, -0.34, 1], up: [0, 1, 0], fit: 'movement', margin: 1.14 },
  'calibre-exploded': { dir: [0.32, -0.5, 1], up: [0, 1, 0], fit: 'movement', margin: 1.16 },
};
const VIEW_MODES = {
  recto: 'watch', reverse: 'watch', oblique: 'watch', whole: 'watch', exploded: 'watch',
  calibre: 'mechanism', 'calibre-exploded': 'mechanism',
};
const MODE_VIEWS = { watch: 'oblique', mechanism: 'calibre', sources: null };
const REVERSAL_PLAY_SECONDS = 3.2;
/**
 * Intentional case-view crop. `bracelet` is the share of the available bracelet
 * run shown above and below the case (both ends equally); `drop` nudges the
 * cropped case below the header so the title never sits on the case top edge.
 */
const CASE_CROP = Object.freeze({ bracelet: 0.18, drop: 0.03 });

/** Warm-neutral evidence colours, shared by the legend and the callout dots. */
const EVIDENCE_COLORS = Object.freeze({
  verified_primary: '#4f7259',
  observed_owner: '#3f6f8f',
  observed_supplied_photo: '#6b5f96',
  observed_reference_video: '#4a6f9a',
  observed_reference_image: '#4a6f9a',
  general_mechanical_illustration: '#7a7368',
  derived: '#a5792f',
  general_mechanical: '#7a7368',
  project_defined: '#8a8378',
  source_informed: '#a5792f',
  reported_unconfirmed: '#8a5a22',
  illustrative_envelope: '#8a5a22',
  unknown: '#9a917f',
});
/**
 * Evidence wording for the callout badges and the selection card. The shared
 * behaviour map stays authoritative where it has an entry; the extra keys below
 * are the statuses actually authored in the exterior and movement metadata
 * (observed reference video/image and the illustrative general-mechanical case),
 * which the shared map does not name and which would otherwise read
 * 'Not established' on a properly recorded part.
 */
const EVIDENCE_TEXT = Object.freeze({
  ...EVIDENCE_LABELS,
  observed_reference_video: 'Slow-motion reference video inspected frame by frame (S07); identity unconfirmed',
  observed_reference_image: 'Publisher-attributed reference photograph inspected (S09); not geometry-traced',
  general_mechanical_illustration: 'General mechanical illustration, not 854/1 geometry',
  illustrative_envelope: 'Illustrative envelope; shape and proportions not measured',
});
const SELECT_COLOR = 0xb8862f;
/** Condensed plate statement, docs/11 quality-checks wording, full text in Sources. */
const CAPTION_QUALIFICATION = 'Photograph-informed exterior; dimensions partly provisional. Educational exploded assembly; internal geometry illustrative. Full qualifications and source locators: the Sources mode of the reference viewer.';

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

/** 'recto_dial' or 'recto dial' -> 'Recto dial'. Data-driven, never invented. */
function humanize(text) {
  const value = String(text || '').replaceAll('_', ' ').replace(/\s+/g, ' ').trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/** A small vertical/horizontal gradient canvas used for the studio cards. */
function gradientTexture(stops) {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 2;
  return texture;
}

/**
 * Soft contact pool: a radial alpha gradient drawn on a small canvas. It is
 * deliberately a drawn gradient, not a photograph, and it costs one quad.
 */
function radialShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(46, 38, 28, 0.34)');
  gradient.addColorStop(0.55, 'rgba(52, 44, 34, 0.15)');
  gradient.addColorStop(1, 'rgba(60, 52, 40, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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

    this.reduceMotion = window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

    this.state = {
      seconds: 8 * 3600 + 20 * 60 + 35,
      offsetHours: 0,
      // The clock runs on load; the Run/Pause control is the only thing that
      // changes it. Nothing animates on its own beyond the movement the user is
      // looking at, so no queued motion is imposed on a reduced-motion visitor
      // either (CSS transitions and camera easing honour the preference).
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
      view: 'oblique',
      mode: 'watch',
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

    // Responsive-panel and export bookkeeping.
    this._panelOpen = false;            // Inspector open, for focus transitions
    this._panelInert = false;           // background currently inert
    this._captureIgnore = null;         // UI overlays left out of a capture's framing
    this._isCapturing = false;          // one PNG capture at a time
    this._pickTapFlag = null;           // framing flag as it was before a pick
    this._pickSkip = null;              // crystal-face meshes picked over (lazy)

    this.selection = null;         // selected part id
    this.selectionNodes = [];      // every node tagged with that id
    this.selectionShells = [];     // { shell, source }
    this.parts = new Map();        // id -> { id, name, node, nodes, userData, spec }
    this.sourceIndex = null;       // data/sources.json, loaded lazily
    this.sourcesError = '';

    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._collectNodes();
    this._collectParts();
    this._resolveHandSigns();
    this._initControls();
    this._initSelectionOverlay();
    this._buildLegend();
    this._buildPartList();
    this._bindUI();
    this.setLabels(this.state.labels);
    this._refreshReadouts();
    this.apply(0);
    this._refreshMotion();
    this._refreshAssembly();
    this.setMode('watch', { keepView: true });
    this.setPanelOpen(false);
    this.setControlsOpen(false, { silent: true });

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // -- setup ----------------------------------------------------------------

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // The gallery backdrop is the CSS gradient behind the transparent canvas, so
    // the page and the render share one continuous warm field.
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Filmic tone mapping: without it the environment's bright bands clip
    // straight to white while the mid bands stay dark, which is what made steel
    // read as a flat sheet. The curve rolls the highlights off instead, so a
    // polished face crossed by a softbox shows a real gradient.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
  }

  /**
   * Studio environment: a full neutral surround plus broad softboxes and one
   * narrow dark strip. Drawn in code, no photographic assets.
   *
   * A mirror-metal surface renders whatever the environment contains, so the
   * surround must cover *every* direction with neutral light: an enclosing
   * gradient sphere (bright overhead, mid grey at the horizon, mid-dark below)
   * means no reflective face can see a black void and read olive. The softboxes
   * then carry the broad highlight sweeps across the front steel, and a single
   * narrow dark strip supplies the dark-to-bright transition that reads as
   * metal rather than white plastic. Nothing here is tinted warm.
   */
  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = null;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const studio = new THREE.Scene();

    // Enclosing neutral surround. BackSide, so the camera-side surfaces of the
    // sphere are the ones the model reflects.
    const surroundTexture = gradientTexture([
      [0, '#ffffff'], [0.30, '#e4e6e6'], [0.52, '#aeb0af'], [0.74, '#87898e'], [1, '#565a60'],
    ]);
    const surround = new THREE.Mesh(
      new THREE.SphereGeometry(60, 24, 16),
      new THREE.MeshBasicMaterial({ map: surroundTexture, side: THREE.BackSide }),
    );
    studio.add(surround);

    const textures = [
      // Broad front softbox: bright at the top edge, falling through mid grey to
      // a deep end, so a polished face crossed by it reads a real sweep.
      gradientTexture([[0, '#ffffff'], [0.30, '#eff0f2'], [0.62, '#c3c6c8'], [0.86, '#8f9296'], [1, '#5f6367']]),
      // Side fills: neutral, with their own gradient so the flanks are not flat.
      gradientTexture([[0, '#f4f6f8'], [0.45, '#cbcfd2'], [0.8, '#8e9196'], [1, '#63666b']]),
      // Under-bounce: lifts the lower bevels without going bright.
      gradientTexture([[0, '#d5d8db'], [0.6, '#a9adb2'], [1, '#74777c']]),
      // Dark strips: the deep end of the tonal range.
      gradientTexture([[0, '#3a3d42'], [0.5, '#24272b'], [1, '#16181b']]),
    ];
    const planeGeometry = new THREE.PlaneGeometry(1, 1);
    const addCard = (texture, x, y, z, w, h) => {
      const panel = new THREE.Mesh(planeGeometry, new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
      panel.position.set(x, y, z);
      panel.scale.set(w, h, 1);
      panel.lookAt(0, 0, 0);
      studio.add(panel);
    };
    // The watch faces +Z toward the camera, so the broad softbox sits in front
    // of it covering a wide, tall angle: every front steel face, including the
    // bracelet run above and below the case, catches the sweep. Flanks fill the
    // case sides, a top panel serves the bezel, and the bounce serves the
    // underside.
    addCard(textures[0], 0, 16, 22, 90, 62);
    addCard(textures[1], -19, 3, 11, 30, 44);
    addCard(textures[1], 19, 3, 11, 30, 44);
    addCard(textures[0], 0, 30, 2, 64, 40);
    addCard(textures[2], 0, -18, 5, 66, 26);
    // Two narrow vertical dark strips: one near the front, one offset, so the
    // polished faces read a dark edge from either side without any of them
    // seeing an overall dark surround.
    addCard(textures[3], -8, 0, 17, 2.6, 34);
    addCard(textures[3], 10, 1, 15, 2.2, 28);
    // A wide blur keeps the sweeps readable as broad reflections while stopping
    // the small-radius fillets at the case ends from spiking into white blobs.
    this.scene.environment = pmrem.fromScene(studio, 0.12).texture;
    this.scene.environmentIntensity = 1.25;
    planeGeometry.dispose();
    surround.geometry.dispose();
    surround.material.dispose();
    surroundTexture.dispose();
    for (const texture of textures) texture.dispose();
    pmrem.dispose();

    // A single low neutral key for direction; the environment above supplies
    // almost all of the metal's tonal range. No shadow map is enabled anywhere:
    // the exterior meshes do not cast, so the pass would cost a full extra render
    // and change nothing, and contact is drawn as a gradient pool instead.
    const key = new THREE.DirectionalLight(0xffffff, 0.42);
    key.position.set(34, 52, 40);
    this.scene.add(key);
    this.keyLight = key;

    // Neutral fill and rim only: the warm page field is CSS, never a light, so
    // no warm cast lands on the steel or the dial.
    const fill = new THREE.DirectionalLight(0xf0f3f7, 0.34);
    fill.position.set(-46, 18, -34);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xf2f5f8, 0.22);
    rim.position.set(6, -34, -50);
    this.scene.add(rim);

    // Contact pool: a soft radial gradient painted on a small plane just under
    // the watch. Cheap, deterministic and drawn in code — no photographic asset
    // and no shadow-map pass, because nothing in the exterior casts.
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: radialShadowTexture(),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.renderOrder = 1;
    this.scene.add(pool);
    this.floor = pool;

    // Watch root, owned by model/exterior.js createWatch.
    this.watchRoot = this.watch.root;
    this.scene.add(this.watchRoot);

    this.movingNode = this.watchRoot.getObjectByName('C100') || null;
    if (!this.movingNode) {
      showError('geometry', new Error('watch.root has no C100 moving assembly; reversal cannot be applied'));
    }

    // Sit the pool just below the lowest watch point and scale it to the model
    // footprint. A small illustrative gap keeps the contact readable; this is not
    // a measured ground plane.
    this.watchRoot.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.watchRoot);
    const size = bounds.getSize(new THREE.Vector3());
    pool.position.y = bounds.min.y - 1.5;
    pool.scale.set(Math.max(size.x, 12) * 0.9, Math.max(size.z, 12) * 0.9, 1);
  }

  _initCamera() {
    const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    // A long lens keeps perspective distortion low enough for reference
    // comparison without giving up orbit; an orthographic camera is offered
    // alongside it for matched recto/reverse plates.
    this.perspective = new THREE.PerspectiveCamera(30, aspect, 0.5, 4000);
    this.orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 4000);
    this.cameraMode = 'perspective';
    this.camera = this.perspective;
    this._orthoHeight = 60;
    this.perspective.position.set(0, 6, 150);
    this.perspective.lookAt(0, 0, 0);
    this.orthographic.position.copy(this.perspective.position);
    this.orthographic.quaternion.copy(this.perspective.quaternion);
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    // Damping is the only camera motion the app adds on its own, so a
    // reduced-motion visitor gets a camera that stops where they release it.
    this.controls.enableDamping = !this.reduceMotion;
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
   * Build the selectable-part registry from scene-spec order and the authored
   * per-node metadata in the geometry. Names, descriptions and evidence all come
   * from existing records; nothing is invented here.
   */
  _collectParts() {
    const byId = new Map();
    this.watchRoot.traverse(node => {
      const id = node.userData?.id;
      if (!id) return;
      if (!byId.has(id)) byId.set(id, { nodes: [], userData: node.userData });
      byId.get(id).nodes.push(node);
    });
    const specById = new Map((this.sceneSpec.nodes || []).map(spec => [spec.id, spec]));
    for (const spec of this.sceneSpec.nodes || []) {
      const entry = byId.get(spec.id);
      if (!entry) continue;
      // Keep nodes that report this id as their own or as the nearest tagged
      // ancestor; if that filters everything out, keep the collected set as is.
      const tagged = entry.nodes.filter(node => this._baseId(node) === spec.id);
      const ud = entry.userData || {};
      this.parts.set(spec.id, {
        id: spec.id,
        name: humanize(ud.label || spec.name || spec.id),
        nodes: tagged.length ? tagged : entry.nodes,
        userData: ud,
        spec,
        group: spec.id.startsWith('M') ? 'Mechanism' : 'Exterior',
      });
    }
    // Groups tagged on a parent (case assemblies, cradle) inherit their own ids.
    for (const [id, entry] of byId) {
      if (this.parts.has(id)) continue;
      const spec = specById.get(id) || null;
      this.parts.set(id, {
        id,
        name: humanize(entry.userData?.label || spec?.name || id),
        nodes: entry.nodes,
        userData: entry.userData || {},
        spec,
        group: id.startsWith('M') ? 'Mechanism' : 'Exterior',
      });
    }
  }

  /** The id a mesh reports directly, or the nearest ancestor's id. */
  _baseId(node) {
    let current = node;
    while (current) {
      if (current.userData?.id) return current.userData.id;
      current = current.parent;
    }
    return null;
  }

  _initSelectionOverlay() {
    this.raycaster = new THREE.Raycaster();
    this.highlightGroup = new THREE.Group();
    this.highlightGroup.name = 'SELECTION_OVERLAY';
    this.highlightMaterial = new THREE.MeshBasicMaterial({
      color: SELECT_COLOR,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      toneMapped: false,
    });
    this.highlightGroup.visible = false;
    this.scene.add(this.highlightGroup);
  }

  /**
   * Determine, for each hand, the sign of the local +Z rotation that reads
   * clockwise to a viewer of that face. Uses the node's local +Z axis expressed
   * in the assembled recto frame, so reverse hands authored in their own visible
   * frame get the opposite sign from flat recto hands.
   */
  _resolveHandSigns() {
    this.handSign = { recto: -1, reverse: -1 };
    this.watchRoot.updateMatrixWorld(true);
    const worldPlusZ = new THREE.Vector3();
    const pickSign = (face) => {
      const entry = this.hands[face][0];
      if (!entry) return -1;
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
    list.textContent = '';
    // The caution applies to the whole model, independent of any evidence badge,
    // so it is always shown at the top of the legend.
    const caution = document.createElement('p');
    caution.className = 'legend-caution';
    caution.textContent = GEOMETRY_CAUTION;
    list.appendChild(caution);
    for (const [key, color] of Object.entries(EVIDENCE_COLORS)) {
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
      v.textContent = ' — ' + (EVIDENCE_TEXT[key] || '');
      text.appendChild(k);
      text.appendChild(v);
      row.appendChild(dot);
      row.appendChild(text);
      list.appendChild(row);
    }
    const cautionNote = $('sourceCaution');
    if (cautionNote) cautionNote.textContent = GEOMETRY_CAUTION;
    const panelCaution = $('panelCaution');
    if (panelCaution) panelCaution.textContent = GEOMETRY_CAUTION;
  }

  /** Keyboard-accessible alternative to pointer picking. */
  _buildPartList() {
    const select = $('partSelect');
    if (!select) return;
    select.textContent = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Select a part…';
    select.appendChild(blank);
    const groups = new Map();
    for (const [id, part] of this.parts) {
      if (!part.nodes.length) continue;
      if (!groups.has(part.group)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = part.group;
        groups.set(part.group, optgroup);
        select.appendChild(optgroup);
      }
      const option = document.createElement('option');
      option.value = id;
      option.textContent = `${part.name} · ${id}`;
      groups.get(part.group).appendChild(option);
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
    // Modes.
    for (const btn of document.querySelectorAll('#modeBar [data-mode]')) {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    }
    $('toSourcesBtn').addEventListener('click', () => this.setMode('sources'));
    $('toWatchBtn').addEventListener('click', () => this.setMode('watch'));

    // View buttons (front/back/angle/whole/calibre/calibre exploded/exploded).
    for (const btn of document.querySelectorAll('[data-view]')) {
      btn.addEventListener('click', () => this.setView(btn.dataset.view));
    }
    for (const btn of document.querySelectorAll('[data-projection]')) {
      btn.addEventListener('click', () => this.setCameraProjection(btn.dataset.projection));
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
    $('explosionRange').addEventListener('input', event => {
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

    // Selection: pointer picking, keyboard list, focus and clear.
    const canvas = this.renderer.domElement;
    let down = null;
    canvas.addEventListener('pointerdown', event => {
      down = { x: event.clientX, y: event.clientY, time: performance.now(), pointerType: event.pointerType };
    });
    canvas.addEventListener('pointerup', event => {
      if (!down) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      const elapsed = performance.now() - down.time;
      const wasDown = down;
      down = null;
      if (!wasDown.pointerType || wasDown.pointerType === 'mouse') {
        if (moved > 5 || elapsed > 700) return; // that was an orbit or a pan
      } else if (moved > 12 || elapsed > 700) return; // that was a touch drag
      const id = this.pickAt(event.clientX, event.clientY);
      // The tap is over, so OrbitControls hover damping has already nudged the
      // camera. Restore the pre-tap framing flag first, or the card-aware refit
      // would read this stationary pick as a camera gesture and skip.
      this._userMovedCamera = this._pickTapFlag === true;
      if (id) this.selectPart(id);
      else this.clearSelection();
    });
    $('partSelect').addEventListener('change', event => {
      if (event.target.value) this.selectPart(event.target.value);
      else this.clearSelection();
    });
    $('selectionClear').addEventListener('click', () => this.clearSelection());
    $('selectionFocusBtn').addEventListener('click', () => this.focusSelection());
    $('inspectClearBtn').addEventListener('click', () => this.clearSelection());

    // Panel and mobile sheet.
    $('panelToggle').addEventListener('click', () => this.setPanelOpen($('panel').dataset.collapsed === 'true'));
    $('panelClose').addEventListener('click', () => this.setPanelOpen(false));
    $('sheetToggle').addEventListener('click', () => this.setControlsOpen($('controls').dataset.collapsed === 'true'));

    // Sources index.
    $('sourceFilter').addEventListener('change', event => this._renderSources(event.target.value));

    // Error dismiss.
    $('errorClose').addEventListener('click', () => { $('error').dataset.open = 'false'; });

    // Keyboard: space toggles run, arrows step time, P presses the pusher.
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        this.setPanelOpen(false);
        this.clearSelection();
        return;
      }
      if (event.key === 'Tab' && $('panel').dataset.collapsed === 'false' && window.matchMedia('(max-width: 900px)').matches) {
        const controls = [...$('panel').querySelectorAll('button, input, select, summary, a[href]')].filter(el => !el.disabled && el.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (event.target instanceof HTMLElement && event.target.closest('input, select, button, textarea, a, [contenteditable]')) return;
      if (event.code === 'Space') { event.preventDefault(); this.toggleRun(); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); this.setTime(this.state.seconds + (event.shiftKey ? 3600 : 60)); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); this.setTime(this.state.seconds - (event.shiftKey ? 3600 : 60)); }
      else if (event.key === 'p' || event.key === 'P') { this.pressPusher(); }
      else if (event.key === 'f' || event.key === 'F') { this.toggleReversalPlay(); }
      else if (event.key === 'l' || event.key === 'L') { $('labelsToggle').click(); }
    });
  }

  // -- modes and panels -----------------------------------------------------

  /**
   * Switch presentation mode. Watch and Mechanism own their own view families,
   * so an explicit mode change moves the camera into that family once; passing
   * `keepView` (used by setView itself) only updates the visible controls.
   */
  setMode(mode, { keepView = false } = {}) {
    if (!MODE_VIEWS.hasOwnProperty(mode)) return this.state.mode;
    this.state.mode = mode;
    for (const btn of document.querySelectorAll('#modeBar [data-mode]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    }
    const mechanism = mode === 'mechanism';
    const sources = mode === 'sources';
    $('watchRow').hidden = mechanism || sources;
    $('mechRow').hidden = !mechanism;
    $('sourceRow').hidden = !sources;
    $('setTimeBlock').hidden = sources;
    $('explodeBlock').hidden = sources || mechanism;
    // One short plate statement per mode; the full qualification text lives in
    // Sources and in the panel caution, not in the always-visible strip. Kept to
    // a single line so it never runs down over the model.
    $('viewCaption').textContent = mechanism
      ? 'Educational geometry. Calibre groups source-informed, not exact 854/1 parts; locators in Sources.'
      : sources
        ? 'Educational geometry. Source status, qualifications and locators for every modelled claim.'
        : 'Educational geometry. Provisional proportions; full qualifications and locators in Sources.';
    if (sources) this._loadSources();
    if (!keepView) {
      if (mechanism && !this._isCalibreView()) this.setView(MODE_VIEWS.mechanism);
      else if (mode === 'watch' && this._isCalibreView()) this.setView(MODE_VIEWS.watch);
      else if (!this._userMovedCamera) this._frameCamera(this.state.view);
    }
    // A mode switch changes which dock rows are visible, so the label overlay
    // and the card's dock-relative offset are re-measured. The new rows are
    // only measurable once the dock has been laid out, hence the next frame —
    // the immediate pass keeps the synchronous contract callers rely on.
    this._syncOverlayBounds();
    requestAnimationFrame(() => { if (this.state.mode === mode) this._syncOverlayBounds(); });
    return mode;
  }

  _refreshModeForView(view) {
    const mode = VIEW_MODES[view];
    if (mode && mode !== this.state.mode) this.setMode(mode, { keepView: true });
  }

  setPanelOpen(open) {
    const panel = $('panel');
    panel.dataset.collapsed = String(!open);
    $('panelToggle').setAttribute('aria-expanded', String(!!open));
    this._syncPanelInert();
    // The uncovered region changed, so re-fit and re-clamp the overlay.
    if (!this._userMovedCamera) this._frameCamera(this.state.view);
    this._syncOverlayBounds();
    return !!open;
  }

  /**
   * Apply the mobile Inspector's inertness and focus for the current
   * breakpoint. Re-derived on every resize, because a resize can cross 900px
   * with the panel open: the full-screen drawer would otherwise leave the
   * desktop background inert while its Close button is hidden, and the desktop
   * Inspector toggle lives inside those inert controls.
   */
  _syncPanelInert() {
    const panel = $('panel');
    const open = panel.dataset.collapsed === 'false';
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    const inert = open && mobile;
    const wasInert = this._panelInert === true;
    const wasOpen = this._panelOpen === true;
    this._panelInert = inert;
    this._panelOpen = open;
    for (const element of [document.querySelector('header'), $('controls'), $('selectionCard')]) {
      if (element) element.inert = inert;
    }
    // Focus only follows a real transition, so an ordinary desktop interaction
    // (or a resize that keeps the same state) never steals it from a control.
    if (inert && !wasInert) { $('panelClose').focus(); return; }
    if (!inert && wasInert) { if (panel.contains(document.activeElement)) $('panelToggle').focus(); return; }
    if (!open && wasOpen && panel.contains(document.activeElement)) $('panelToggle').focus();
  }

  setControlsOpen(open, { silent = false } = {}) {
    const controls = $('controls');
    controls.dataset.collapsed = String(!open);
    $('sheetToggle').setAttribute('aria-expanded', String(!!open));
    if (silent) return !!open;
    if (!this._userMovedCamera) this._frameCamera(this.state.view);
    this._syncOverlayBounds();
    return !!open;
  }

  /**
   * Show or hide the selection card and refit, because the card occupies part of
   * the model's band. All selection changes go through this instead of writing
   * `card.hidden` directly.
   */
  _setCardVisible(visible) {
    // Snapshot the framing flag before anything can re-frame, so a stationary
    // tap can put it back after the pick: OrbitControls reports `start` on
    // pointer-down and its own hover damping settles after pointer-up.
    this._pickTapFlag = this._userMovedCamera;
    const card = $('selectionCard');
    if (!card || card.hidden === !visible) return;
    card.hidden = !visible;
    if (!this._userMovedCamera) this._frameCamera(this.state.view);
    this._syncOverlayBounds();
  }
  // -- selection ------------------------------------------------------------

  /**
   * Pick the frontmost selectable part under a viewport point.
   * @returns {string|null} part id
   */
  pickAt(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    // The crystals are optically clear but geometrically solid, so a raycast
    // against their faces would swallow every click on the hands and dial
    // behind them. They stay selectable from the part list, which names the id
    // directly instead of picking it.
    if (!this._pickSkip) {
      this._pickSkip = new Set();
      for (const id of ['C105', 'C106']) {
        const crystal = this.watchRoot.getObjectByName(id);
        if (crystal) crystal.traverse(child => { if (child.isMesh) this._pickSkip.add(child); });
      }
    }
    const hits = this.raycaster.intersectObject(this.watchRoot, true)
      .filter(hit => hit.object.isMesh && !this._pickSkip.has(hit.object) && this._effectivelyVisible(hit.object));
    for (const hit of hits) {
      const id = this._baseId(hit.object);
      if (id && this.parts.has(id) && this.parts.get(id).nodes.length) return id;
    }
    return null;
  }

  /** Accepts a part id or any Object3D that reports one. */
  selectPart(ref) {
    const id = typeof ref === 'string' ? ref : this._baseId(ref);
    const part = id ? this.parts.get(id) : null;
    if (!part) return null;
    this.selection = id;
    // Only nodes tagged with this exact id highlight: a group id also pulls in
    // its own meshes, but never its children's separate ids.
    this.selectionNodes = part.nodes.slice(0, 400);
    this._rebuildSelectionOverlay();
    this._renderSelectionCard(part);
    // The source records are a separate fetch, previously triggered only by the
    // Sources and Mechanism modes, so a pick made in Watch mode showed bare ids
    // with no locator. Load once on first selection; when the fetch lands,
    // _loadSources re-renders this card with the resolved records.
    if (!this.sourceIndex && !this.sourcesError) this._loadSources();
    const select = $('partSelect');
    if (select && select.value !== id) select.value = id;
    this._setCardVisible(true);
    return id;
  }

  clearSelection() {
    this.selection = null;
    this.selectionNodes = [];
    this._rebuildSelectionOverlay();
    this._setCardVisible(false);
    const select = $('partSelect');
    if (select) select.value = '';
    return null;
  }

  get selectedPart() {
    return this.selection ? this.parts.get(this.selection) || null : null;
  }

  /**
   * Rebuild the highlight from the selected part's own meshes: only meshes that
   * report the selected id — directly or through their nearest tagged ancestor
   * — are drawn, so selecting a group never pulls in a child that carries its
   * own separate id, and each source mesh contributes exactly one shell however
   * many times the traversal reaches it.
   */
  _rebuildSelectionOverlay() {
    this.highlightGroup.clear();
    this.selectionShells = [];
    const seen = new Set();
    const add = node => {
      if (seen.has(node)) return;
      seen.add(node);
      this._addShell(node);
    };
    for (const node of this.selectionNodes) {
      if (node.isMesh) { add(node); continue; }
      node.traverse(child => {
        if (child.isMesh && this._baseId(child) === this.selection) add(child);
      });
    }
    this.highlightGroup.visible = this.selectionShells.length > 0;
  }

  _addShell(source) {
    if (this.selectionShells.length >= 400) return;
    // Clone with the same geometry and local transform, but its own material, so
    // no shared part material is ever touched by the selection.
    const shell = new THREE.Mesh(source.geometry, this.highlightMaterial);
    shell.matrixAutoUpdate = false;
    shell.frustumCulled = false;
    this.highlightGroup.add(shell);
    this.selectionShells.push({ shell, source });
  }

  /** Drive the overlay from the live world matrices; it is never in the export. */
  _syncSelectionOverlay() {
    if (!this.selectionShells.length) return;
    for (const { shell, source } of this.selectionShells) {
      shell.matrix.copy(source.matrixWorld);
      shell.visible = this._effectivelyVisible(source);
    }
  }

  _renderSelectionCard(part) {
    const ud = part.userData || {};
    const spec = part.spec || {};
    $('selectionName').textContent = part.name || part.id;
    $('selectionId').textContent = part.id;
    const desc = ud.description || '';
    const descEl = $('selectionDesc');
    descEl.textContent = desc;
    descEl.hidden = !desc;
    const evidence = ud.evidenceStatus || spec.geometry_status || 'unknown';
    $('selectionEvidence').textContent = `Evidence: ${EVIDENCE_TEXT[evidence] || 'Not established'}.`;

    const technical = $('selectionTechnical');
    technical.textContent = '';
    const rows = [
      ['Project id', part.id],
      ['Record type', spec.type || ud.part || 'project grouping'],
      ['Evidence badge', evidence],
      ['Geometry status', ud.geometryStatus || spec.geometry_status || 'unknown'],
      ['Sources', (ud.sourceIds && ud.sourceIds.length ? ud.sourceIds : (spec.source_ids || [])).join(', ') || 'none recorded'],
      ['Illustrative', ud.illustrative === false ? 'no' : 'yes — editable artistic proportions'],
    ];
    if (ud.motion && ud.motion.kind) rows.push(['Motion', `${ud.motion.kind} (educational)`]);
    for (const [key, value] of rows) {
      const row = document.createElement('div');
      row.className = 'row';
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = key;
      const v = document.createElement('span');
      v.textContent = String(value);
      row.appendChild(k);
      row.appendChild(v);
      technical.appendChild(row);
    }
    const sourceIds = ud.sourceIds && ud.sourceIds.length ? ud.sourceIds : (spec.source_ids || []);
    if (sourceIds.length) {
      const links = document.createElement('div');
      links.className = 'row';
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = 'Locators';
      const v = document.createElement('span');
      const resolved = sourceIds.map(id => (this.sourceIndex && this.sourceIndex.get(id)) || null);
      if (resolved.some(Boolean)) {
        resolved.forEach((source, index) => {
          if (index) v.appendChild(document.createTextNode(' · '));
          if (!source) { v.appendChild(document.createTextNode(sourceIds[index])); return; }
          // Privately retained material has no public URL: show the record and
          // its locator as text rather than a dead link.
          if (!source.url) {
            v.appendChild(document.createTextNode(`${source.id} ${source.title}${source.locator ? ` (${source.locator})` : ''}`));
            return;
          }
          const a = document.createElement('a');
          a.href = source.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = `${source.id} ${source.title}`;
          v.appendChild(a);
        });
      } else {
        v.textContent = 'Open Sources for the full index and locators.';
      }
      links.appendChild(k);
      links.appendChild(v);
      technical.appendChild(links);
    }
  }

  /** Frame the selected part without changing the presentation mode. */
  focusSelection() {
    if (!this.selection) return null;
    this._userMovedCamera = false;
    this._frameSelection();
    return this.selection;
  }

  /**
   * Screen position of a part, for external smoke checks and for placing the
   * selection card over a picked part.
   * @returns {{x:number, y:number, visible:boolean}|null} viewport pixels
   */
  projectToScreen(ref) {
    const id = typeof ref === 'string' ? ref : this._baseId(ref);
    const part = id ? this.parts.get(id) : null;
    if (!part || !part.nodes.length) return null;
    const box = new THREE.Box3();
    for (const node of part.nodes) {
      if (!this._effectivelyVisible(node) || !node.isMesh) continue;
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      box.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
    }
    if (box.isEmpty()) return null;
    const rect = this.container.getBoundingClientRect();
    const v = box.getCenter(new THREE.Vector3()).project(this.camera);
    return {
      x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
      visible: v.z < 1,
    };
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
    btn.textContent = this.reversalPlaying ? 'Pause flip' : 'Flip';
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
    this._refreshModeForView(view);
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

  /**
   * Model visibility for the close calibre views. The controls panel is not
   * touched here: which rows are visible is the presentation mode's business.
   */
  _setCalibreFocus(on) {
    if (on && !this.focusVisibility) {
      this.focusVisibility = new Map();
      this.watchRoot.traverse(node => this.focusVisibility.set(node, node.visible));
      const cradle = this.watchRoot.getObjectByName('C000');
      if (cradle) cradle.visible = false;
      if (this.movingNode) {
        this.movingNode.visible = true;
        // Under focus the moving case shows only the calibre module. That module
        // is left exactly as it stands — its visibility IS the live state the
        // M000 checkbox drives, and the same value is what the restore map ends
        // up holding — while every other exterior group is hidden for the close
        // view. Clobbering it here is what made the checkbox appear dead.
        for (const node of this.movingNode.children) {
          if (node.name !== 'M000') node.visible = false;
        }
      }
      this.floor.visible = false;
    } else if (!on && this.focusVisibility) {
      for (const [node, visible] of this.focusVisibility) node.visible = visible;
      this.focusVisibility = null;
      this.floor.visible = true;
    }
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

  /** Explicit alias kept for external render scripts. */
  setAssemblyProgress(progress) { return this.setAssembly(progress); }

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
    node.visible = !!visible;
    // The calibre focus map is the restore record for the next unfocus, so the
    // enabled control has to update it too: otherwise the live model keeps
    // showing the part the visitor just switched off, and unfocusing brings
    // back the pre-focus state as if the control had never been touched.
    if (this.focusVisibility) this.focusVisibility.set(node, !!visible);
    if (!this._userMovedCamera) this._frameCamera(this.state.view);
  }

  /** Long-lens ↔ orthographic comparison camera. */
  setCameraProjection(mode) {
    const wanted = mode === 'orthographic' ? 'orthographic' : 'perspective';
    for (const btn of document.querySelectorAll('[data-projection]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.projection === wanted));
    }
    if (wanted === this.cameraMode) return this.cameraMode;
    const previous = this.camera;
    this.cameraMode = wanted;
    this.camera = wanted === 'orthographic' ? this.orthographic : this.perspective;
    this.camera.position.copy(previous.position);
    this.camera.up.copy(previous.up);
    this.camera.quaternion.copy(previous.quaternion);
    this.controls.object = this.camera;
    this._userMovedCamera = false;
    this.resize();
    return this.cameraMode;
  }

  reset() {
    this.clearSelection();
    this.setMode('watch', { keepView: true });
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
        `reverse <b>${formatClockSeconds(rt)}</b> <span class="day" title="Provisional 24 h half-cycle label; the indicator's true zero orientation is unverified.">${dayPhase(seconds, offsetHours)} · ½-cycle</span><br>` +
        `offset&nbsp; <b>+${offsetHours} h</b> &nbsp;·&nbsp; 24 h ${angles.reverse.hours24.toFixed(1)}°`;
    }
    const input = $('timeInput');
    if (input && document.activeElement !== input) {
      input.value = formatClockSeconds(seconds).slice(0, 5);
    }
    const note = $('pusherNote');
    if (note) note.dataset.offset = String(offsetHours);
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

  // -- sources --------------------------------------------------------------

  async _loadSources() {
    if (this.sourceIndex || this.sourcesError) return this.sourceIndex;
    try {
      const res = await fetch('../data/sources.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.sourceIndex = new Map((data.sources || []).map(source => [source.id, source]));
      this._renderSources($('sourceFilter')?.value || 'all');
      if (this.selection) this._renderSelectionCard(this.parts.get(this.selection));
    } catch (error) {
      this.sourcesError = String(error.message || error);
      this._renderSources();
    }
    // The source list and the card's locator row are filled in here, so the
    // card's height — and the dock-relative offsets derived from it — are
    // re-measured once the lazy fetch has actually landed.
    this._syncOverlayBounds();
    return this.sourceIndex;
  }

  _renderSources(filter = 'all') {
    const list = $('sourceList');
    if (!list) return;
    const select = $('sourceFilter');
    list.textContent = '';
    if (select && !select.dataset.filled && this.sourceIndex) {
      select.textContent = '';
      for (const [value, label] of [['all', 'All records'], ['primary', 'Primary and manufacturer'], ['movement', 'Movement sources'], ['exterior', 'Exterior photograph records']]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      }
      select.dataset.filled = '1';
      select.value = filter;
    }
    const note = document.createElement('p');
    note.className = 'note';
    if (!this.sourceIndex) {
      note.textContent = this.sourcesError
        ? `Source index unavailable from this build (${this.sourcesError}). The full record is retained in the repository data/sources.json.`
        : 'Loading the source index…';
      list.appendChild(note);
      return;
    }
    const match = source => {
      if (filter === 'primary') return /^S0[1-5]$|^S1[0-3]$/.test(source.id);
      if (filter === 'movement') return source.id === 'S07' || source.id === 'S09' || source.id === 'G01';
      if (filter === 'exterior') return source.id === 'U01' || source.id === 'U02' || source.id === 'U03';
      return true;
    };
    const ordered = [...this.sourceIndex.values()].filter(match);
    const ol = document.createElement('ol');
    for (const source of ordered) {
      const li = document.createElement('li');
      li.className = 'source';
      const id = document.createElement('span');
      id.className = 'id';
      id.textContent = source.id;
      // Public locator where one exists; privately retained records stay text
      // only, so the export never produces a dead or private link.
      const title = document.createElement(source.url ? 'a' : 'span');
      title.className = 'title';
      if (source.url) {
        title.href = source.url;
        title.target = '_blank';
        title.rel = 'noopener noreferrer';
      }
      title.textContent = source.title;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = [
        source.status ? humanize(source.status) : '',
        source.locator ? `locator: ${source.locator}` : '',
        source.rights ? `Rights: ${humanize(source.rights)}` : '',
        source.identity_caveat ? `identity: ${source.identity_caveat}` : '',
      ].filter(Boolean).join(' · ');
      li.appendChild(id);
      li.appendChild(document.createElement('br'));
      li.appendChild(title);
      li.appendChild(document.createElement('br'));
      li.appendChild(meta);
      ol.appendChild(li);
    }
    list.appendChild(ol);
  }

  // -- camera ---------------------------------------------------------------

  /** The node whose visible extent a preset frames. */
  _fitNode(fit) {
    if (fit === 'watch') return this.watchRoot;
    if (fit === 'movement') return this.watchRoot.getObjectByName('M000') || this.watchRoot;
    return this.watchRoot.getObjectByName('C100') || this.watchRoot;
  }

  /** World-space bounds of a node's visible meshes, optionally including timeline ends. */
  _nodeBounds(node, timeline = false, visit = null) {
    this.watchRoot.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const scope = [node];
    node.traverse(child => scope.push(child));
    for (const item of scope) {
      if (!item.isMesh || !this._effectivelyVisible(item)) continue;
      if (!item.geometry.boundingBox) item.geometry.computeBoundingBox();
      const bounds = item.geometry.boundingBox.clone().applyMatrix4(item.matrixWorld);
      box.union(bounds);
      if (visit) visit(bounds);
      if (!timeline || !this._isCalibreView()) continue;
      let group = item;
      while (group && group.parent?.name !== 'M000') group = group.parent;
      const spec = group && MOVEMENT_GROUPS[group.name];
      const base = group && this.assembled.get(group.name);
      if (!spec || !base) continue;
      const current = group.position.clone().sub(base.position);
      const origin = group.parent.localToWorld(new THREE.Vector3());
      for (const offset of [[0, 0, 0], spec.offset]) {
        const delta = group.parent.localToWorld(new THREE.Vector3(...offset).sub(current)).sub(origin);
        const endpoint = bounds.clone().translate(delta);
        box.union(endpoint);
        if (visit) visit(endpoint);
      }
    }
    if (box.isEmpty()) {
      const fallback = new THREE.Box3().setFromObject(this.watchRoot);
      return fallback.isEmpty() ? new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)) : fallback;
    }
    return box;
  }

  /**
   * Frame a view: the preset's fit node is centred in the *uncovered* part of the
   * viewport (right of nothing / above the bottom controls bar and beside the
   * inspector on wide layouts). Front and back macro views share one fit, so
   * recto and reverse plates are matched.
   *
   * The fit uses the uncovered pixel box, then camera.setViewOffset() translates
   * the whole frustum so the model lands at that box's centre. setViewOffset is
   * exact (it re-maps the virtual frame onto the canvas) so no iterative
   * projection correction is needed, and it works for the orthographic camera too.
   */
  _frameCamera(view) {
    const preset = CAMERA_PRESETS[view] || CAMERA_PRESETS.oblique;
    const fitNode = this._fitNode(preset.fit);
    const dir = new THREE.Vector3().fromArray(preset.dir).normalize();
    const up = new THREE.Vector3().fromArray(preset.up).normalize();
    const timeline = this._isCalibreView() && (this.assemblyActive || view === 'calibre-exploded');
    const box = this._nodeBounds(fitNode, timeline);
    // Case views crop on purpose: the case silhouette plus an equal, measured
    // length of bracelet above and below, so neither end arrives clipped by the
    // header by accident and the two ends stay symmetric.
    if (preset.fit === 'case') {
      this._frameBox(this._intentionalCaseBox(box), dir, up, preset.margin || 1.14, CASE_CROP.drop);
      return;
    }
    this._frameBox(box, dir, up, preset.margin || 1.14);
  }

  /**
   * Expand the case box symmetrically along Y by a fixed share of the bracelet
   * run that actually exists above and below it. Taking the smaller of the two
   * runs keeps the crop symmetric and guarantees it never frames past the
   * bracelet ends, so the result reads as an intended crop, not a clip.
   */
  _intentionalCaseBox(caseBox) {
    const watch = this._nodeBounds(this.watchRoot, false);
    if (watch.isEmpty() || caseBox.isEmpty()) return caseBox;
    const run = Math.max(0, Math.min(
      watch.max.y - caseBox.max.y,
      caseBox.min.y - watch.min.y,
    ));
    const show = run * CASE_CROP.bracelet;
    if (show <= 0) return caseBox;
    return caseBox.clone().set(
      caseBox.min.clone().setY(caseBox.min.y - show),
      caseBox.max.clone().setY(caseBox.max.y + show),
    );
  }

  /** Frame an arbitrary box in the uncovered viewport region. */
  _frameBox(box, dir, up, margin = 1.14, drop = 0) {
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 1);
    const W = this.container.clientWidth || 1;
    const H = this.container.clientHeight || 1;
    // A capture reframes with the UI overlays excluded, so the exported plate is
    // composed for the whole stage rather than the strip they leave uncovered.
    const uncovered = this._uncoveredRect();
    const narrow = uncovered.width < 560;
    // Reserve the fixed header strip so the top of the watch never hides under
    // the title. On narrow layouts the callout list occupies the lower part of
    // the uncovered region, so the model is fit into what remains.
    const header = document.querySelector('header');
    const headerH = header
      ? Math.min(header.getBoundingClientRect().height + 6, uncovered.height * 0.34)
      : 0;
    const bandH = narrow && this.state.labels ? uncovered.height * 0.6 : uncovered.height;
    const contentTop = uncovered.top + headerH;
    const HU = Math.max(80, uncovered.top + bandH - contentTop);
    const WU = Math.max(80, uncovered.width - (!narrow && this.state.labels ? Math.min(360, uncovered.width * 0.36) : 0));

    const right = new THREE.Vector3().crossVectors(up, dir).normalize();
    const cameraUp = new THREE.Vector3().crossVectors(dir, right).normalize();
    const corner = new THREE.Vector3();
    let needRight = 0;
    let needUp = 0;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          corner.set(x, y, z).sub(sphere.center);
          needRight = Math.max(needRight, Math.abs(corner.dot(right)));
          needUp = Math.max(needUp, Math.abs(corner.dot(cameraUp)));
        }
      }
    }

    if (this.cameraMode === 'orthographic') {
      // Match the world-per-pixel of the uncovered box, then translate.
      const height = Math.max(
        2 * needUp * margin * (H / HU),
        2 * needRight * margin * (H / WU),
        radius * 0.02,
      );
      this._orthoHeight = height;
      // OrbitControls leaves its own wheel zoom in camera.zoom; a named fit
      // replaces the frustum, so a retained zoom would frame a model smaller
      // than the requested view. Every named fit starts from zoom 1.
      this.camera.zoom = 1;
      const aspect = W / H;
      this.camera.top = height / 2;
      this.camera.bottom = -height / 2;
      this.camera.left = (-height * aspect) / 2;
      this.camera.right = (height * aspect) / 2;
      this.camera.near = 0.5;
      this.camera.far = radius * 40 + 400;
      const distance = radius * 4 + 120;
      this.camera.up.copy(up);
      this.camera.position.copy(sphere.center).addScaledVector(dir, distance);
      this.camera.lookAt(sphere.center);
      this.camera.updateProjectionMatrix();
    } else {
      const tanHalf = Math.tan((this.camera.fov * DEG2RAD) / 2);
      let distance = 5;
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            corner.set(x, y, z).sub(sphere.center);
            const depth = corner.dot(dir);
            distance = Math.max(
              distance,
              depth + margin * Math.abs(corner.dot(right)) * H / (WU * tanHalf),
              depth + margin * Math.abs(corner.dot(cameraUp)) * H / (HU * tanHalf),
            );
          }
        }
      }
      this.camera.up.copy(up);
      this.camera.position.copy(sphere.center).addScaledVector(dir, distance);
      this.camera.lookAt(sphere.center);
      this.camera.updateProjectionMatrix();
    }

    // Place the model centre in the reserved content box. `drop` is a fraction of
    // the *capped* content height, used to sit an intentionally cropped case a
    // little below the header rather than dead centre.
    //
    // The fit above solves for the box corners conservatively — a corner can
    // demand more room than the box's real silhouette needs, which is how the
    // model ended up loose enough to ride up behind the header. Measure the drawn
    // silhouette instead and pull the camera back until it honours the margin,
    // then place it. project() reads matrixWorldInverse, which only
    // updateMatrixWorld() refreshes, and the next render has not run yet — so
    // without this the measurement uses the previous frame's camera.
    this.camera.updateMatrixWorld(true);
    const drawnH = this._drawnHeight(box, W, H, this.camera);
    const limit = HU / (margin * 1.02);
    if (drawnH > limit && drawnH > 0) {
      const factor = limit / drawnH;
      if (this.cameraMode === 'orthographic') {
        this._orthoHeight /= factor;
        const aspect = W / H;
        this.camera.top = this._orthoHeight / 2;
        this.camera.bottom = -this._orthoHeight / 2;
        this.camera.left = (-this._orthoHeight * aspect) / 2;
        this.camera.right = (this._orthoHeight * aspect) / 2;
      } else {
        this.camera.position
          .sub(sphere.center)
          .divideScalar(factor)
          .add(sphere.center);
      }
      this.camera.lookAt(sphere.center);
      this.camera.updateProjectionMatrix();
    }

    const rect = this.container.getBoundingClientRect();
    const cx = uncovered.left - rect.left + uncovered.width / 2;
    const cy = contentTop - rect.top + HU / 2 + HU * drop;
    this.camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(sphere.center);
    this.controls.update();
  }

  /**
   * Height in canvas pixels that the box's eight projected corners span from the
   * current camera. The caller refreshes matrixWorld first; the value drives the
   * margin cap so a case view cannot ride up behind the header.
   */
  _drawnHeight(box, W, H, camera) {
    let top = Infinity;
    let bottom = -Infinity;
    const corner = new THREE.Vector3();
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          corner.set(x, y, z).project(camera);
          const py = (1 - corner.y) / 2 * H;
          top = Math.min(top, py);
          bottom = Math.max(bottom, py);
        }
      }
    }
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) return 0;
    return Math.max(0, bottom - top);
  }

  /** Frame the current selection: its own visible extent, from the current direction. */
  _frameSelection() {
    const part = this.selectedPart;
    if (!part) return;
    const box = new THREE.Box3();
    for (const node of part.nodes) {
      const sub = this._nodeBounds(node);
      box.union(sub);
    }
    if (box.isEmpty()) return;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (!Number.isFinite(dir.x) || dir.lengthSq() < 1e-6) dir.set(0.34, 0.16, 1).normalize();
    const up = this.camera.up.clone().normalize();
    this._frameBox(box, dir, up, 1.6);
  }

  _effectivelyVisible(node) {
    for (let parent = node; parent; parent = parent.parent) if (!parent.visible) return false;
    return true;
  }

  /** Bounds of the visible model, matching the legacy `_visibleBounds` contract. */
  _visibleBounds(timeline = false, visit = null) {
    return this._nodeBounds(this.watchRoot, timeline, visit);
  }

  /** The part of the viewport not covered by the inspector or the controls bar. */
  _uncoveredRect() {
    const rect = this.container.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top;
    let right = rect.right;
    let bottom = rect.bottom;

    const panel = this._captureIgnore?.has($('panel')) ? null : $('panel');
    if (panel && getComputedStyle(panel).display !== 'none') {
      const p = panel.getBoundingClientRect();
      if (p.width > 0 && rect.width > 900) right = Math.min(right, p.left);
      else if (p.width > 0) bottom = Math.min(bottom, Math.max(rect.top + 140, p.top));
    }
    // The selection card is a fixed overlay inside the model's band. On narrow
    // layouts it spans nearly the whole width and hangs below the header, so the
    // model must frame below it. On wide layouts it is a corner card above the
    // dock, and shifting the model sideways for it would be worse than the small
    // overlap, so it is left alone there.
    const card = this._captureIgnore?.has($('selectionCard')) ? null : $('selectionCard');
    if (card && !card.hidden && getComputedStyle(card).display !== 'none') {
      const c = card.getBoundingClientRect();
      if (c.height > 0 && c.width >= (rect.right - rect.left) * 0.7) {
        top = Math.max(top, c.bottom + 6);
      }
    }
    const bar = this._captureIgnore?.has($('controls')) ? null : $('controls');
    if (bar && getComputedStyle(bar).display !== 'none') {
      const b = bar.getBoundingClientRect();
      if (b.height > 0) bottom = Math.min(bottom, Math.max(rect.top + 140, b.top - 6));
    }
    return {
      left,
      top,
      width: Math.max(120, right - left),
      height: Math.max(140, bottom - top),
    };
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
    const show = this.state.labels && this.state.mode !== 'sources';
    if (!show) {
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
    // moving case's own frame. Rotate that outward normal by the case's live
    // world quaternion and compare it with the camera-to-case vector; a plain
    // camera-direction test would mislabel a reversed case. Both face sets are
    // shown only during a real explosion, never for a seated reversal, because a
    // reversed-but-assembled watch still shows one face.
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

    // Narrow layouts reserve the lower part of the uncovered region for a wrapped
    // list of callouts (see _frameBox); wide layouts flank the watch with two columns.
    let flowX = 8;
    let flowY = Math.max(safeLabelTop, Math.round(rect.height * 0.6) + 6);
    let flowRowH = 0;

    const visibleDefs = defs.filter(([, , , face]) =>
      face === 'both' || exploding || face === faceToward);

    // The watch silhouette moves with the camera, so measure it once per frame
    // and reuse it for every callout instead of recomputing it per label.
    const watchBounds = narrow ? null : this._watchScreenBounds(rect);
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
        const ev = document.createElement('span');
        ev.className = 'ev';
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
      el.title = EVIDENCE_TEXT[evidence] || evidence;
      el.style.setProperty('--dot', EVIDENCE_COLORS[evidence] || EVIDENCE_COLORS.unknown);
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
      const bounds = watchBounds || this._watchScreenBounds(rect);
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
    // A viewport change (rotation, window drag) returns the mobile sheet to its
    // collapsed default: the compact primary row is the reliable starting point
    // on every shape, and an explicit expand would otherwise persist into a
    // layout where it covers the model. Desktop ignores the flag entirely.
    this.setControlsOpen(false, { silent: true });
    // The same resize can cross the 900px breakpoint with the Inspector open,
    // so its inertness and focus state are re-derived before the new layout is
    // measured by the refit below.
    this._syncPanelInert();
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const aspect = w / Math.max(1, h);
    this.perspective.aspect = aspect;
    this.perspective.updateProjectionMatrix();
    if (this.cameraMode === 'orthographic') {
      const height = this._orthoHeight;
      this.orthographic.top = height / 2;
      this.orthographic.bottom = -height / 2;
      this.orthographic.left = (-height * aspect) / 2;
      this.orthographic.right = (height * aspect) / 2;
      this.orthographic.updateProjectionMatrix();
    }
    this.renderer.setSize(w, h, false);
    // Keep the model centred in the uncovered viewport unless the user has taken
    // manual control of the camera.
    if (!this._userMovedCamera) this._frameCamera(this.state.view);
    this._syncOverlayBounds();
  }

  /** Clamp the label overlay to the uncovered region so callouts never sit under
   *  the controls bar or the inspector. */
  _syncOverlayBounds() {
    if (!this.labelsLayer) return;
    const rect = this.container.getBoundingClientRect();
    const un = this._uncoveredRect();
    this.labelsLayer.style.left = `${un.left - rect.left}px`;
    this.labelsLayer.style.top = `${un.top - rect.top}px`;
    this.labelsLayer.style.width = `${un.width}px`;
    this.labelsLayer.style.height = `${un.height}px`;
    this._placeSelectionCard(rect);
  }

  /**
   * Place the selection card inside the live layout: above the dock on desktop,
   * below the header on narrow screens. Each layout clears the edge the other
   * one owns, so crossing the breakpoint or resizing the dock can never leave
   * the card pinned to a stale offset.
   */
  _placeSelectionCard(rect = this.container.getBoundingClientRect()) {
    const card = $('selectionCard');
    if (!card) return;
    const bar = $('controls');
    if (window.matchMedia('(min-width: 901px)').matches) {
      card.style.removeProperty('top');
      if (bar && getComputedStyle(bar).display !== 'none') {
        const b = bar.getBoundingClientRect();
        card.style.bottom = `${Math.round(rect.bottom - b.top + 10)}px`;
      }
    } else {
      card.style.removeProperty('bottom');
      const header = document.querySelector('header');
      if (header) card.style.top = `${Math.round(header.getBoundingClientRect().bottom + 8)}px`;
    }
  }

  render() {
    this.controls.update();
    this.watchRoot.updateMatrixWorld(true);
    this._syncSelectionOverlay();
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
   * Object3D.toJSON(), so the live scene is never mutated and the scene-level
   * selection overlay is never included. The result is native Three JSON (not
   * glTF), so millimetre authoring is correct here; glTF stays metres via
   * exportModel().
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
   * part callouts drawn at their on-screen positions, and a short accuracy
   * caption. The selection overlay is switched off for the capture and restored
   * afterwards, so a plate never carries a highlight that the exported geometry
   * does not contain. downloadPNG() and any external plate renderer share this
   * so the composition lives in one place.
   */
  async capturePNG() {
    // Re-entrant captures (a second click while the first is still encoding)
    // would both snapshot the same pre-capture value and race to restore it.
    // One at a time; the next click re-renders and captures regardless.
    if (this._isCapturing) return null;
    // The page's UI overlays can squeeze the model's framing band: on a narrow
    // viewport the full-screen Inspector and the wide selection card leave a
    // short strip, and the PNG would then show a shrunken model rather than the
    // composition on screen. For the capture those overlays are left out of the
    // framing and crop, and the live layout is put back immediately afterwards.
    // A desktop side slab is never excluded: the capture already crops beside
    // it, so the existing desktop plate is unchanged. The camera is only touched
    // when the automatic framing owns it; a manual camera is captured as set.
    const containerWidth = this.container.getBoundingClientRect().width || 1;
    const panel = $('panel');
    const drawer = panel && getComputedStyle(panel).display !== 'none'
      && panel.getBoundingClientRect().width >= containerWidth * 0.7
      ? panel
      : null;
    const card = $('selectionCard');
    const hanging = card && !card.hidden && card.getBoundingClientRect().width >= containerWidth * 0.7;
    const overlays = [drawer, hanging ? card : null].filter(Boolean);
    if (overlays.length) this._captureIgnore = new Set(overlays);
    const restore = overlays.length && !this._userMovedCamera ? this._snapshotFraming() : null;
    if (restore) this._frameCamera(this.state.view);
    const overlayWasVisible = this.highlightGroup.visible;
    this.highlightGroup.visible = false;
    // Setup is synchronous, so the guard only needs to cover the awaited part;
    // setting it here means an impossible throw during setup cannot wedge it on.
    this._isCapturing = true;
    try {
      // Render once more so the captured canvas is current and caption-aligned.
      this.render();
      const source = this.renderer.domElement;
      const scale = 2;
      const sw = source.width;
      const sh = source.height;
      const pad = 16 * scale;
      const lineH = 19 * scale;
      const fontPx = 13 * scale;

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
      const captionH = Math.round(lines.length * lineH + pad * 1.2);

      const out = document.createElement('canvas');
      out.width = crop.w;
      out.height = crop.h + captionH;
      const ctx = out.getContext('2d');
      // The renderer canvas is transparent over the CSS gallery field, so the
      // plate paints its own warm backdrop first.
      ctx.fillStyle = '#ece7df';
      ctx.fillRect(0, 0, out.width, crop.h);
      ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

      // The WebGL canvas alone has no labels, so copy the live callouts in.
      this._drawLabelsOnCanvas(ctx, crop);

      ctx.fillStyle = '#f7f4ef';
      ctx.fillRect(0, crop.h, crop.w, captionH);
      ctx.fillStyle = '#6d675c';
      ctx.font = `${fontPx}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => ctx.fillText(line, pad, crop.h + pad * 0.6 + i * lineH));

      // Restore the highlight the moment the rendered pixels are copied into
      // the output canvas: the encode below is asynchronous, and a selection
      // made while it runs must not be overwritten by a stale restore.
      this.highlightGroup.visible = overlayWasVisible;
      this.render();
      return await new Promise(resolve => out.toBlob(resolve, 'image/png'));
    } finally {
      // Layout belongs to the page, not to the export, so it goes back even if
      // rendering or encoding failed.
      this._captureIgnore = null;
      if (restore) this._restoreFraming(restore);
      this._isCapturing = false;
    }
  }

  /** Camera and panel layout to put back after a capture that had to reframe. */
  _snapshotFraming() {
    const camera = this.camera;
    const view = camera.view;
    return {
      camera,
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      up: camera.up.clone(),
      zoom: camera.zoom,
      near: camera.near,
      far: camera.far,
      left: camera.left,
      right: camera.right,
      top: camera.top,
      bottom: camera.bottom,
      fov: camera.fov,
      aspect: camera.aspect,
      orthoHeight: this._orthoHeight,
      view: view && view.enabled
        ? { ...view }
        : null,
      target: this.controls.target.clone(),
      panelOpen: $('panel').dataset.collapsed === 'false',
    };
  }

  /** Put back exactly what _snapshotFraming() captured. */
  _restoreFraming(snapshot) {
    // The panel goes back first: its own refit is then overwritten by the
    // captured camera below, so the restored frame is the captured one.
    this.setPanelOpen(snapshot.panelOpen);
    const camera = snapshot.camera;
    camera.position.copy(snapshot.position);
    camera.quaternion.copy(snapshot.quaternion);
    camera.up.copy(snapshot.up);
    camera.zoom = snapshot.zoom;
    camera.near = snapshot.near;
    camera.far = snapshot.far;
    if ('fov' in camera) {
      camera.fov = snapshot.fov;
      camera.aspect = snapshot.aspect;
    } else {
      camera.left = snapshot.left;
      camera.right = snapshot.right;
      camera.top = snapshot.top;
      camera.bottom = snapshot.bottom;
    }
    this._orthoHeight = snapshot.orthoHeight;
    if (snapshot.view) {
      camera.setViewOffset(
        snapshot.view.fullWidth, snapshot.view.fullHeight,
        snapshot.view.offsetX, snapshot.view.offsetY,
        snapshot.view.width, snapshot.view.height,
      );
    } else {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    this.controls.target.copy(snapshot.target);
    this.controls.update();
    this._syncOverlayBounds();
  }

  /**
   * The pixel rectangle to export: the uncovered viewport region widened to
   * include the projected model bounds, clamped to the canvas. Uses the same
   * camera projections as the live callouts so the crop matches what is shown.
   * Because the uncovered region is recomputed from the live panel geometry, a
   * close case view exports the case, not a forced whole-bracelet frame.
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

    // Union with the projected model so the full visible model is preserved.
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
    const ids = this._isCalibreView()
      ? Object.keys(MOVEMENT_GROUPS)
      : ['C100', 'C101', 'C102', 'D001', 'D101', 'D102', 'D104', 'C105', 'C106', 'M000', 'I001', 'I003'];
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
        ctx.strokeStyle = 'rgba(90, 78, 60, 0.45)';
        ctx.lineWidth = px;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(cx + (ax < cx ? -bw / 2 : bw / 2), cy);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(247, 244, 239, 0.94)';
      roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, 4 * px);
      ctx.fill();
      const dot = getComputedStyle(el).getPropertyValue('--dot').trim() || '#9a917f';
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
      // A capture already in flight keeps the status line it owns.
      if (!blob) return;
      downloadBlob(blob, `q2718110-${this.state.view}.png`);
      status('');
    } catch (error) {
      status('');
      showError('PNG export', error);
    }
  }

  /**
   * Short plate caption: what the view is, the useful live state, and the
   * precision statement required by docs/11. Long-form qualifications and every
   * source locator live in Sources mode instead of on the plate.
   */
  _accuracyCaption() {
    const s = this.state;
    const stage = assemblyStage(s.assembly);
    // Qualification plus only the view state that changes what the picture
    // shows. Separation sliders that are at zero, the beat rate and the
    // indicator angle were a paragraph of noise on every plate; the full
    // qualification and every locator live in Sources.
    const state = [
      `${s.mode} mode`,
      `view ${s.view}`,
      `recto ${formatClockSeconds(s.seconds)}`,
      `reverse ${formatClockSeconds(s.seconds + 3600 * s.offsetHours)} (+${s.offsetHours} h)`,
    ];
    if (s.reversal > 0) state.push(`reversal ${Math.round(s.reversal * 100)}%`);
    if (s.explosion > 0) state.push(`explosion ${Math.round(s.explosion * 100)}%`);
    if (s.movementExplosion > 0) state.push(`calibre separation ${Math.round(s.movementExplosion * 100)}%`);
    if (s.assembly < 1) state.push(`assembly ${Math.round(s.assembly * 100)}% (${stage.name})`);
    return [
      `Q2718110 Reverso Duo · Calibre 854/1 · ${state.join(' · ')}`,
      CAPTION_QUALIFICATION,
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
  // Default: the close, slightly angled case view. The whole bracelet is opted
  // into with the explicit Whole watch view.
  viewer.setView('oblique');
  viewer.start();
  return viewer;
}

boot().catch(error => showError('boot', error));

export { ReversoViewer };
