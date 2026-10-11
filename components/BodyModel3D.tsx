"use client";

// 3D recovery map: the Blender model from /public/models/body.glb, one mesh per muscle.
// Drag left/right to spin it 360°, hover to highlight a muscle, click to select it.

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MUSCLES, type MuscleStatus } from "@/lib/recovery";

const MODEL_URL = "/models/body.glb";

const COLORS = {
  fatigued: "#ef4444",
  recovering: "#eab308",
  ready: "#22c55e",
  body: "#4a4a52",
};

const AUTO_SPIN = 0.35; // radians per second while idle
const IDLE_BEFORE_SPIN_MS = 2500;
const DRAG_SPEED = 0.012; // radians per pixel dragged

function statusColor(recovery: number) {
  if (recovery < 50) return COLORS.fatigued;
  if (recovery < 90) return COLORS.recovering;
  return COLORS.ready;
}

type Props = {
  statuses: MuscleStatus[];
  selected?: string | null;
  onSelect: (muscle: string) => void;
  /** Shown instead if the browser can't do 3D or the model fails to load */
  fallback?: ReactNode;
};

type Hover = { muscle: string; x: number; y: number } | null;

type MuscleMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

// What the buttons and prop changes need to reach inside the 3D scene
type Engine = {
  recolor: () => void;
  snapTo: (angle: number) => void;
};

export default function BodyModel3D({ statuses, selected = null, onSelect, fallback }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const statusesRef = useRef(statuses);
  const selectedRef = useRef(selected);
  const hoveredRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");
  const [hover, setHover] = useState<Hover>(null);

  // Keep the latest props available to the render loop and event handlers
  useEffect(() => {
    statusesRef.current = statuses;
    selectedRef.current = selected;
    onSelectRef.current = onSelect;
    engineRef.current?.recolor();
  }, [statuses, selected, onSelect]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      queueMicrotask(() => setPhase("failed")); // no WebGL: show the 2D fallback
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "pan-y"; // vertical swipes still scroll the page on phones
    mount.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);

    // Lights stay fixed while the body spins, so the shading reads consistently
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2a30, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 3, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-3, 1, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x38bdf8, 1.4); // brand-blue edge light
    rim.position.set(0, 2, -4);
    scene.add(rim);

    const turntable = new THREE.Group();
    scene.add(turntable);

    const meshes = new Map<string, MuscleMesh>(); // muscle id -> mesh
    const allMeshes: MuscleMesh[] = []; // muscles + the neutral body (for picking and cleanup)
    let bodyHeight = 1.8;
    let bodyWidth = 1;

    // ----- Colors -----
    const tmp = new THREE.Color();
    function recolor() {
      const byMuscle = new Map(statusesRef.current.map((s) => [s.muscle as string, s]));
      const hovered = hoveredRef.current;
      const sel = selectedRef.current;
      for (const [name, mesh] of meshes) {
        const mat = mesh.material;
        const s = byMuscle.get(name);
        tmp.set(s ? statusColor(s.recovery) : COLORS.body);
        if (hovered && hovered !== name) tmp.multiplyScalar(0.45); // fade the rest
        mat.color.copy(tmp);
        if (name === hovered) mat.emissive.copy(tmp).multiplyScalar(0.35);
        else if (name === sel) mat.emissive.copy(tmp).multiplyScalar(0.25);
        else mat.emissive.setRGB(0, 0, 0);
      }
    }

    // ----- Sizing -----
    function frame() {
      const w = mount!.clientWidth || 1;
      const h = mount!.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
      const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
      const distForHeight = (bodyHeight / 2) / Math.tan(vHalf);
      const distForWidth = (bodyWidth / 2) / Math.tan(hHalf);
      const dist = Math.max(distForHeight, distForWidth) * 1.12;
      camera.position.set(0, bodyHeight / 2, dist);
      camera.lookAt(0, bodyHeight / 2, 0);
      camera.updateProjectionMatrix();
    }
    const resizeObserver = new ResizeObserver(frame);
    resizeObserver.observe(mount);

    // ----- Load the model -----
    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        if (disposed) return;
        const root = gltf.scene;
        root.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          const name = (obj.userData.muscle as string) || obj.name;
          const isMuscle = (MUSCLES as readonly string[]).includes(name);
          const material = new THREE.MeshStandardMaterial({
            color: COLORS.body,
            roughness: isMuscle ? 0.5 : 0.8,
            metalness: 0.05,
          });
          obj.material = material;
          const mesh = obj as MuscleMesh;
          allMeshes.push(mesh);
          if (isMuscle) meshes.set(name, mesh);
        });
        // Stand the body on the turntable: centered left/right and front/back, feet at 0
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        root.position.set(-center.x, -box.min.y, -center.z);
        bodyHeight = size.y;
        bodyWidth = Math.max(size.x, size.z);
        turntable.add(root);
        recolor();
        frame();
        setPhase("ready");
      },
      undefined,
      () => {
        if (!disposed) setPhase("failed");
      }
    );

    // ----- Spinning -----
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let angle = 0;
    let velocity = 0;
    let snapTarget: number | null = null;
    let lastInteraction = performance.now();
    let pointerInside = false;
    let drag: { id: number; startX: number; startY: number; startAngle: number; lastX: number; lastT: number; moved: boolean } | null = null;

    function snapTo(target: number) {
      // Take the short way around
      const twoPi = Math.PI * 2;
      const delta = ((((target - angle) % twoPi) + twoPi + Math.PI) % twoPi) - Math.PI;
      snapTarget = angle + delta;
      velocity = 0;
      lastInteraction = performance.now();
    }

    // ----- Hover / click picking -----
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    function pick(clientX: number, clientY: number): string | null {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(allMeshes, false)[0];
      if (!hit) return null;
      for (const [name, mesh] of meshes) if (mesh === hit.object) return name;
      return null; // the neutral body (head, hands, feet...) isn't selectable
    }

    function setHovered(name: string | null, x = 0, y = 0) {
      if (hoveredRef.current !== name) {
        hoveredRef.current = name;
        recolor();
      }
      setHover(name ? { muscle: name, x, y } : null);
      canvas.style.cursor = drag ? "grabbing" : name ? "pointer" : "grab";
    }

    let pendingMove: PointerEvent | null = null;
    function onPointerMove(e: PointerEvent) {
      pointerInside = true;
      if (drag && e.pointerId === drag.id) {
        const dx = e.clientX - drag.startX;
        if (Math.abs(dx) > 4 || Math.abs(e.clientY - drag.startY) > 4) drag.moved = true;
        const now = performance.now();
        const dt = Math.max(1, now - drag.lastT);
        velocity = ((e.clientX - drag.lastX) * DRAG_SPEED) / (dt / 1000);
        drag.lastX = e.clientX;
        drag.lastT = now;
        angle = drag.startAngle + dx * DRAG_SPEED;
        snapTarget = null;
        lastInteraction = now;
        if (drag.moved && hoveredRef.current) setHovered(null);
        return;
      }
      if (e.pointerType === "mouse") pendingMove = e; // picked once per frame
    }

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, startX: e.clientX, startY: e.clientY, startAngle: angle, lastX: e.clientX, lastT: performance.now(), moved: false };
      velocity = 0;
      snapTarget = null;
      lastInteraction = performance.now();
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    }

    function onPointerUp(e: PointerEvent) {
      if (!drag || e.pointerId !== drag.id) return;
      const wasClick = !drag.moved;
      const heldStill = performance.now() - drag.lastT > 80;
      drag = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      lastInteraction = performance.now();
      if (wasClick) {
        velocity = 0;
        const name = pick(e.clientX, e.clientY);
        if (name) onSelectRef.current(name);
        if (e.pointerType === "mouse") pendingMove = e;
      } else if (heldStill) {
        velocity = 0; // released without a flick: stop where it is
      }
      canvas.style.cursor = hoveredRef.current ? "pointer" : "grab";
    }

    function onPointerLeave() {
      pointerInside = false;
      pendingMove = null;
      if (!drag) setHovered(null);
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.style.cursor = "grab";

    // ----- Render loop -----
    let raf = 0;
    let last = performance.now();
    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (!drag) {
        if (snapTarget !== null) {
          angle += (snapTarget - angle) * Math.min(1, dt * 8);
          if (Math.abs(snapTarget - angle) < 0.001) {
            angle = snapTarget;
            snapTarget = null;
          }
        } else if (Math.abs(velocity) > 0.01) {
          angle += velocity * dt; // let a flick keep spinning, then slow down
          velocity *= Math.pow(0.04, dt);
        } else if (!reduceMotion && !pointerInside && now - lastInteraction > IDLE_BEFORE_SPIN_MS) {
          angle += AUTO_SPIN * dt;
        }
      }
      turntable.rotation.y = angle;

      if (pendingMove && !drag) {
        const e = pendingMove;
        pendingMove = null;
        const rect = canvas.getBoundingClientRect();
        setHovered(pick(e.clientX, e.clientY), e.clientX - rect.left, e.clientY - rect.top);
      }

      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(tick);

    engineRef.current = { recolor, snapTo };

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      for (const mesh of allMeshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      renderer.dispose();
      canvas.remove();
      engineRef.current = null;
      hoveredRef.current = null;
    };
  }, []);

  if (phase === "failed" && fallback) return <>{fallback}</>;

  const hovered = hover ? statuses.find((s) => s.muscle === hover.muscle) : undefined;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-[440px] w-[280px] sm:h-[480px] sm:w-[320px]">
        {/* soft floor shadow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 left-1/2 h-6 w-40 -translate-x-1/2 rounded-[50%]"
          style={{ background: "radial-gradient(closest-side, rgba(0,0,0,0.45), transparent)" }}
        />
        <div
          ref={mountRef}
          className="absolute inset-0"
          role="img"
          aria-label="3D body model colored by muscle recovery. Drag to rotate."
        />
        {phase !== "ready" && (
          <div className="absolute inset-0 grid place-items-center">
            <p className="fibr-muted text-sm">{phase === "loading" ? "Loading 3D model..." : "3D model unavailable"}</p>
          </div>
        )}
        {hover && hovered && (
          <div
            className="fibr-panel pointer-events-none absolute z-10 whitespace-nowrap px-2 py-1 text-xs font-semibold"
            style={{ left: hover.x + 14, top: hover.y + 14 }}
          >
            {hovered.label} <span style={{ color: statusColor(hovered.recovery) }}>{hovered.recovery}%</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button type="button" className="fibr-pill hover:text-[var(--text-primary)]" onClick={() => engineRef.current?.snapTo(0)}>
          Front
        </button>
        <span className="fibr-faint text-xs">Drag to spin</span>
        <button type="button" className="fibr-pill hover:text-[var(--text-primary)]" onClick={() => engineRef.current?.snapTo(Math.PI)}>
          Back
        </button>
      </div>
    </div>
  );
}
