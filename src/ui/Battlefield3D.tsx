import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CombatEvent, CombatState, CombatUnit, Lane, Side } from '../game/combat';

/* Greyfen Pass in three dimensions. Presentation only: the deterministic combat engine decides every outcome;
   this scene turns its state and per-tick events into terrain, squads, arrows, and weather, and projects squad
   positions back to the DOM so health bars, damage numbers, and accessible click targets sit on the soldiers. */

/** Screen position (in px, relative to the battlefield) of a lane/x point, lifted above the ground. */
export type Projector = (lane: Lane, x: number, lift?: number) => { left: number; top: number };

const FIELD_W = 22;
const laneZ: Record<Lane, number> = { high: -3, road: 0, flank: 3 };
export const worldX = (x: number) => (Math.max(3, Math.min(94, x)) / 100) * FIELD_W - FIELD_W / 2;
const smooth = (edge0: number, edge1: number, value: number) => { const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

/** Terrain height: a raised ridge behind the high-ground lane, a sunken dirt road, an open snowfield, and cliffs beyond. */
export function heightAt(x: number, z: number) {
  const ripple = Math.sin(x * .7) * .07 + Math.cos(z * 1.3 + x * .31) * .05 + Math.sin(x * 2.1 + z * 1.7) * .02;
  const ridge = smooth(-1.5, -2.3, z) * .85;
  const backCliff = smooth(-4.6, -7.5, z) * 4.2 + smooth(-7, -12, z) * 3;
  const road = (1 - smooth(.55, 1.05, Math.abs(z))) * -.07;
  const frontDip = smooth(5, 9, z) * -.5;
  const sides = smooth(11, 14, Math.abs(x)) * 2.4;
  return ripple + ridge + backCliff + road + frontDip + sides;
}

const kits = {
  crown: { tabard: '#7a2832', trim: '#c6a66b', steel: '#a9b1b2', cloak: '#3d1c24', fur: '#d4b689', leather: '#4a3324', crest: '#c6a66b', field: '#7a2832', horse: '#5b4130', banner: '#7a2832' },
  raiders: { tabard: '#39473d', trim: '#7d6a52', steel: '#6f6a63', cloak: '#202527', fur: '#6f655a', leather: '#2b231d', crest: '#b5503f', field: '#2b302d', horse: '#3a3633', banner: '#5a2a26' },
} as const;
type Kit = Record<keyof typeof kits.crown, THREE.MeshStandardMaterial> & { eye: THREE.MeshStandardMaterial };

function useKit(side: Side): Kit {
  return useMemo(() => {
    const colors = kits[side];
    const make = (color: string, metalness = 0, roughness = .85) => new THREE.MeshStandardMaterial({ color, metalness, roughness, flatShading: true });
    return {
      tabard: make(colors.tabard), trim: make(colors.trim, .35, .5), steel: make(colors.steel, .65, .38), cloak: make(colors.cloak), fur: make(colors.fur),
      leather: make(colors.leather), crest: make(colors.crest, .3, .55), field: make(colors.field), horse: make(colors.horse), banner: new THREE.MeshStandardMaterial({ color: colors.banner, side: THREE.DoubleSide, roughness: .9 }),
      eye: new THREE.MeshStandardMaterial({ color: '#f2c94c', emissive: '#a07a12', emissiveIntensity: .6 }),
    };
  }, [side]);
}

/* ── Terrain, sky, and set dressing ─────────────────────────────────────────────────────────────── */

function Terrain() {
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(40, 30, 160, 120);
    plane.rotateX(-Math.PI / 2);
    const position = plane.attributes.position;
    const colors: number[] = [];
    const snow = new THREE.Color('#d6dfe2'), snowShade = new THREE.Color('#a9b7bc'), rock = new THREE.Color('#5d6569'), dirt = new THREE.Color('#6d5a44'), mud = new THREE.Color('#4f4235'), grass = new THREE.Color('#6f7a63');
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i), z = position.getZ(i);
      const y = heightAt(x, z);
      position.setY(i, y);
      const noise = (Math.sin(x * 3.1 + z * 2.3) + Math.sin(x * 7.7 - z * 5.1) * .5) * .25 + .5;
      const slope = Math.abs(heightAt(x + .2, z) - y) + Math.abs(heightAt(x, z + .2) - y);
      if (Math.abs(z) < .95 && Math.abs(x) < 11.5) color.copy(dirt).lerp(mud, noise * .6).lerp(snowShade, Math.max(0, noise - .72) * 1.4);
      else if (slope > .22) color.copy(rock).lerp(snowShade, Math.max(0, .5 - slope) * .8);
      else color.copy(snow).lerp(snowShade, noise * .8).lerp(grass, z > 1.2 && z < 4.8 ? Math.max(0, noise - .82) * 1.3 : 0);
      colors.push(color.r, color.g, color.b);
    }
    plane.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    plane.computeVertexNormals();
    return plane;
  }, []);
  return <mesh geometry={geometry} receiveShadow><meshStandardMaterial vertexColors roughness={.95} flatShading /></mesh>;
}

function Sky() {
  const geometry = useMemo(() => {
    const sphere = new THREE.SphereGeometry(90, 32, 16);
    const top = new THREE.Color('#566d80'), horizon = new THREE.Color('#d6d6cc'), glow = new THREE.Color('#e9cf9e');
    const colors: number[] = []; const color = new THREE.Color(); const position = sphere.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i) / 90; const x = position.getX(i) / 90;
      color.copy(horizon).lerp(top, Math.max(0, Math.min(1, y * 1.8)));
      if (y < .25 && x < -.2) color.lerp(glow, (1 - y * 4) * Math.min(1, -x) * .45);
      colors.push(color.r, color.g, color.b);
    }
    sphere.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return sphere;
  }, []);
  return <mesh geometry={geometry}><meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} /></mesh>;
}

function Mountains() {
  const peaks = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ x: -34 + i * 5.3 + Math.sin(i * 2.7) * 2, z: -22 - (i % 3) * 5, h: 9 + ((i * 37) % 9), r: 6 + ((i * 13) % 5) })), []);
  const rock = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4f5c63', roughness: 1, flatShading: true }), []);
  const snow = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e6edf0', roughness: .9, flatShading: true }), []);
  return <group>{peaks.map((peak, i) => <group key={i} position={[peak.x, -1, peak.z]} rotation={[0, i * .9, 0]}>
    <mesh material={rock}><coneGeometry args={[peak.r, peak.h, 6]} /></mesh>
    <mesh material={snow} position={[0, peak.h * .3, 0]}><coneGeometry args={[peak.r * .42, peak.h * .4, 6]} /></mesh>
  </group>)}</group>;
}

const seeded = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

function Pines() {
  const trees = useMemo(() => {
    const list: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 70; i += 1) {
      const band = i % 3;
      const x = -15 + seeded(i) * 30;
      const z = band === 0 ? -5.4 - seeded(i + 9) * 4 : band === 1 ? 6.6 + seeded(i + 4) * 3 : (seeded(i + 2) > .5 ? -1 : 1) * (12 + seeded(i + 7) * 3);
      if (band === 2) list.push({ x: z, z: -4 + seeded(i + 1) * 9, s: .8 + seeded(i + 3) * .7 });
      else list.push({ x, z, s: .7 + seeded(i + 3) * .8 });
    }
    return list;
  }, []);
  const bark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3d2f24', flatShading: true }), []);
  const needles = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2d4339', roughness: .95, flatShading: true }), []);
  const frost = useMemo(() => new THREE.MeshStandardMaterial({ color: '#dfe8ea', roughness: .9, flatShading: true }), []);
  return <group>{trees.map((tree, i) => <group key={i} position={[tree.x, heightAt(tree.x, tree.z), tree.z]} scale={tree.s}>
    <mesh material={bark} position={[0, .25, 0]} castShadow><cylinderGeometry args={[.06, .09, .5, 5]} /></mesh>
    {[0, 1, 2].map((tier) => <group key={tier}>
      <mesh material={needles} position={[0, .65 + tier * .42, 0]} castShadow><coneGeometry args={[.62 - tier * .16, .75, 7]} /></mesh>
      <mesh material={frost} position={[0, .82 + tier * .42, 0]}><coneGeometry args={[.36 - tier * .1, .36, 7]} /></mesh>
    </group>)}
  </group>)}</group>;
}

function Boulders() {
  const rocks = useMemo(() => Array.from({ length: 60 }, (_, i) => {
    const x = -13 + seeded(i * 3.1) * 26; let z = -6 + seeded(i * 5.3) * 13;
    if (Math.abs(z - laneZ.road) < 1.1 || Math.abs(z - laneZ.high) < .9 || Math.abs(z - laneZ.flank) < .9) z += z > 0 ? 1.6 : -1.6;
    return { x, z, r: .1 + seeded(i * 7.7) * (z < -4.5 ? .7 : .28), rot: seeded(i) * 6 };
  }), []);
  const stone = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6c7377', roughness: 1, flatShading: true }), []);
  return <group>{rocks.map((rock, i) => <mesh key={i} material={stone} position={[rock.x, heightAt(rock.x, rock.z) + rock.r * .4, rock.z]} rotation={[rock.rot, rock.rot * 1.7, 0]} castShadow receiveShadow><dodecahedronGeometry args={[rock.r, 0]} /></mesh>)}</group>;
}

/** Broken walls and an arch along the old road, echoing the ruined pass in the painted environment. */
function Ruins() {
  const stone = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7d7a72', roughness: 1, flatShading: true }), []);
  const walls = [[-6, -1.5, 1.2], [-3.4, -1.5, .7], [2.5, 1.55, 1], [5.6, 1.55, .5], [8.4, -1.5, .9]] as const;
  return <group>
    {walls.map(([x, z, h], i) => <group key={i} position={[x, heightAt(x, z), z]}>
      <mesh material={stone} position={[0, h / 2, 0]} castShadow receiveShadow><boxGeometry args={[1.6, h, .28]} /></mesh>
      <mesh material={stone} position={[.55, h + .12, 0]} castShadow><boxGeometry args={[.4, .24, .3]} /></mesh>
    </group>)}
    <group position={[-10.6, heightAt(-10.6, -4.2), -4.2]}>
      <mesh material={stone} position={[0, 1.4, 0]} castShadow><cylinderGeometry args={[.7, .85, 2.8, 8]} /></mesh>
      <mesh material={stone} position={[0, 3, 0]} castShadow><cylinderGeometry args={[.85, .75, .4, 8]} /></mesh>
      {Array.from({ length: 6 }, (_, i) => <mesh key={i} material={stone} position={[Math.cos(i) * .78, 3.35, Math.sin(i) * .78]}><boxGeometry args={[.22, .3, .22]} /></mesh>)}
    </group>
    <group position={[11.3, heightAt(11.3, -1.4), -1.4]} rotation={[0, .2, 0]}>
      {[-.8, .8].map((z) => <mesh key={z} material={stone} position={[0, 1.1, z]} castShadow><boxGeometry args={[.4, 2.2, .4]} /></mesh>)}
      <mesh material={stone} position={[0, 2.35, 0]} castShadow><boxGeometry args={[.45, .4, 2.1]} /></mesh>
    </group>
  </group>;
}

function WarBanner({ position, side }: { position: [number, number, number]; side: Side }) {
  const kit = useKit(side);
  const flag = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 2.2 + position[0]) * .25; });
  return <group position={position}>
    <mesh material={kit.leather} position={[0, 1.3, 0]} castShadow><cylinderGeometry args={[.04, .05, 2.6, 6]} /></mesh>
    <mesh ref={flag} material={kit.banner} position={[side === 'crown' ? .45 : -.45, 2.15, 0]} castShadow><boxGeometry args={[.9, .7, .03]} /></mesh>
    <mesh material={kit.trim} position={[0, 2.65, 0]}><sphereGeometry args={[.07, 8, 6]} /></mesh>
  </group>;
}

function Snowfall({ paused }: { paused: boolean }) {
  const count = 1400;
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const buffer = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) { buffer[i * 3] = -18 + seeded(i) * 36; buffer[i * 3 + 1] = seeded(i + .5) * 14; buffer[i * 3 + 2] = -10 + seeded(i + .25) * 22; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(buffer, 3)); return g;
  }, []);
  useFrame((_, delta) => {
    if (paused || !points.current) return;
    const array = geometry.attributes.position.array as Float32Array; const dt = Math.min(delta, .05);
    for (let i = 0; i < count; i += 1) {
      array[i * 3 + 1] -= dt * (.7 + (i % 7) * .08);
      array[i * 3] += dt * (.45 + Math.sin(array[i * 3 + 1] + i) * .25);
      if (array[i * 3 + 1] < 0) { array[i * 3 + 1] = 14; array[i * 3] = -18 + seeded(i + array[i * 3 + 2]) * 36; }
      if (array[i * 3] > 18) array[i * 3] -= 36;
    }
    geometry.attributes.position.needsUpdate = true;
  });
  return <points ref={points} geometry={geometry}><pointsMaterial color="#f4f8f9" size={.07} transparent opacity={.85} depthWrite={false} /></points>;
}

/* ── Soldiers and squads ────────────────────────────────────────────────────────────────────────── */

type Pose = { body: THREE.Group | null; arm: THREE.Group | null };

function Soldier({ kit, type, pose }: { kit: Kit; type: CombatUnit['type']; pose: Pose }) {
  const mounted = type === 'cavalry';
  const lift = mounted ? .48 : 0;
  return <group>
    {mounted && <group>
      <mesh material={kit.horse} position={[0, .62, 0]} castShadow><boxGeometry args={[.95, .34, .3]} /></mesh>
      <mesh material={kit.tabard} position={[-.05, .66, 0]} castShadow><boxGeometry args={[.7, .2, .33]} /></mesh>
      <mesh material={kit.horse} position={[.46, .84, 0]} rotation={[0, 0, -.55]} castShadow><boxGeometry args={[.2, .4, .17]} /></mesh>
      <mesh material={kit.horse} position={[.64, 1.0, 0]} castShadow><boxGeometry args={[.32, .15, .15]} /></mesh>
      <mesh material={kit.leather} position={[.52, 1.12, 0]}><boxGeometry args={[.12, .1, .2]} /></mesh>
      {[[-.33, -.1], [-.33, .1], [.33, -.1], [.33, .1]].map(([x, z]) => <mesh key={`${x}${z}`} material={kit.horse} position={[x, .25, z]} castShadow><cylinderGeometry args={[.035, .045, .5, 5]} /></mesh>)}
      <mesh material={kit.leather} position={[-.52, .62, 0]} rotation={[0, 0, .9]}><coneGeometry args={[.07, .45, 5]} /></mesh>
    </group>}
    <group ref={(node) => { pose.body = node; }} position={[0, lift, 0]}>
      {!mounted && [-.07, .07].map((z) => <mesh key={z} material={kit.leather} position={[0, .18, z]} castShadow><boxGeometry args={[.11, .36, .1]} /></mesh>)}
      <mesh material={kit.tabard} position={[0, .55, 0]} castShadow><boxGeometry args={[.22, .4, .32]} /></mesh>
      <mesh material={kit.steel} position={[.1, .62, 0]}><boxGeometry args={[.06, .2, .28]} /></mesh>
      <mesh material={kit.trim} position={[0, .38, 0]}><boxGeometry args={[.23, .05, .33]} /></mesh>
      <mesh material={kit.cloak} position={[-.13, .52, 0]} castShadow><boxGeometry args={[.05, .5, .34]} /></mesh>
      <group position={[0, .88, 0]}>
        <mesh material={kit.fur} castShadow><sphereGeometry args={[.15, 10, 8]} /></mesh>
        <mesh material={kit.fur} position={[.12, -.04, 0]}><sphereGeometry args={[.075, 8, 6]} /></mesh>
        {[-.055, .055].map((z) => <mesh key={z} material={kit.eye} position={[.135, .02, z]}><sphereGeometry args={[.022, 6, 5]} /></mesh>)}
        {[-.085, .085].map((z) => <mesh key={z} material={kit.fur} position={[-.01, .15, z]} rotation={[z > 0 ? .25 : -.25, 0, 0]}><coneGeometry args={[.055, .14, 4]} /></mesh>)}
        {type === 'archers'
          ? <mesh material={kit.cloak} position={[-.02, .05, 0]} rotation={[0, 0, .25]}><coneGeometry args={[.17, .26, 7, 1, true]} /></mesh>
          : <mesh material={kit.steel} position={[0, .04, 0]}><sphereGeometry args={[.158, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>}
      </group>
      <group ref={(node) => { pose.arm = node; }} position={[.05, .62, .2]}>
        {type === 'archers' ? <>
          <mesh material={kit.leather} position={[.12, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.26, .018, 5, 12, Math.PI]} /></mesh>
          <mesh material={kit.trim} position={[.12, 0, 0]}><boxGeometry args={[.005, .52, .005]} /></mesh>
        </> : <>
          <mesh material={kit.leather} position={[.05, .25, 0]} rotation={[0, 0, -.25]} castShadow><cylinderGeometry args={[.016, .016, mounted ? 1.5 : 1.25, 5]} /></mesh>
          <mesh material={kit.steel} position={[.22 + (mounted ? .1 : 0), .86 + (mounted ? .15 : 0), 0]} rotation={[0, 0, -.25]}><coneGeometry args={[.035, .16, 4]} /></mesh>
        </>}
      </group>
      {type === 'infantry' && <group position={[.14, .55, -.2]}>
        <mesh material={kit.field} castShadow><boxGeometry args={[.04, .4, .3]} /></mesh>
        <mesh material={kit.crest} position={[.022, 0, 0]}><boxGeometry args={[.01, .16, .16]} /></mesh>
      </group>}
    </group>
  </group>;
}

/** Squad formations in soldier slots (forward, across); squads are drawn 1.2× life size for readability. */
const SOLDIER_SCALE = 1.2;
const formations: Record<CombatUnit['type'], [number, number][]> = {
  infantry: [[.38, -.7], [.38, 0], [.38, .7], [-.38, -.35], [-.38, .35]],
  archers: [[.14, -.9], [-.14, -.3], [.14, .3], [-.14, .9]],
  cavalry: [[.42, 0], [-.66, -.82], [-.66, .82]],
};

function Squad({ unit, selected, targeted, paused, attackAt, positions, onSelect }: { unit: CombatUnit; selected: boolean; targeted: boolean; paused: boolean; attackAt: React.MutableRefObject<Map<string, number>>; positions: React.MutableRefObject<Map<string, THREE.Vector3>>; onSelect(): void }) {
  const kit = useKit(unit.side);
  const root = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const flag = useRef<THREE.Mesh>(null);
  const slots = formations[unit.type];
  const poses = useMemo(() => slots.map((): Pose => ({ body: null, arm: null })), [slots]);
  const soldierRoots = useRef<(THREE.Group | null)[]>([]);
  const clock = useRef(0);
  const facing = unit.side === 'crown' ? 1 : -1;
  const alive = unit.hp <= 0 ? 0 : Math.max(1, Math.ceil((unit.hp / 100) * slots.length));

  useEffect(() => {
    if (!positions.current.has(unit.id)) positions.current.set(unit.id, new THREE.Vector3(worldX(unit.x), heightAt(worldX(unit.x), laneZ[unit.lane]), laneZ[unit.lane]));
  }, [unit.id]);

  useFrame((_, delta) => {
    const group = root.current; if (!group) return;
    const dt = paused ? 0 : Math.min(delta, .05);
    clock.current += dt;
    const targetX = worldX(unit.x); const targetZ = laneZ[unit.laneTarget ?? unit.lane];
    const before = group.position.x;
    group.position.x = THREE.MathUtils.damp(group.position.x, targetX, 2.6, dt);
    group.position.z = THREE.MathUtils.damp(group.position.z, targetZ, 2.6, dt);
    group.position.y = heightAt(group.position.x, group.position.z);
    positions.current.get(unit.id)?.copy(group.position);
    const moving = Math.abs(group.position.x - before) > .002 || Math.abs(group.position.z - targetZ) > .05;
    const routed = unit.routed && unit.hp > 0;
    group.rotation.y = THREE.MathUtils.damp(group.rotation.y, routed ? Math.PI : 0, 4, dt);
    const sinceAttack = performance.now() - (attackAt.current.get(unit.id) ?? -1e9);
    slots.forEach(([ox, oz], index) => {
      const soldier = soldierRoots.current[index]; const pose = poses[index]; if (!soldier) return;
      const wx = group.position.x + ox * facing; const wz = group.position.z + oz;
      const ground = heightAt(wx, wz) - group.position.y;
      const fallen = index >= alive;
      if (fallen) {
        soldier.rotation.z = THREE.MathUtils.damp(soldier.rotation.z, (index % 2 ? 1 : -1) * Math.PI / 2, 6, dt || .016);
        soldier.position.y = THREE.MathUtils.damp(soldier.position.y, ground + .08, 6, dt || .016);
        return;
      }
      const stepRate = unit.type === 'cavalry' ? 13 : 9;
      const bob = moving || routed ? Math.abs(Math.sin(clock.current * stepRate + index * 1.3)) * (unit.type === 'cavalry' ? .09 : .05) : 0;
      soldier.position.y = ground + bob;
      soldier.rotation.z = moving ? Math.sin(clock.current * stepRate + index) * .03 : 0;
      if (pose.arm) pose.arm.rotation.z = sinceAttack < 450 ? -Math.sin((sinceAttack / 450) * Math.PI) * (unit.type === 'archers' ? .4 : 1.1) : Math.sin(clock.current * 1.6 + index) * .04;
      if (pose.body) pose.body.rotation.y = Math.sin(clock.current * .9 + index * 2) * .05;
    });
    if (ring.current) { const pulse = targeted ? 1 + Math.sin(performance.now() / 160) * .08 : 1; ring.current.scale.setScalar(pulse); }
    if (flag.current) flag.current.rotation.y = Math.sin(clock.current * 2.4 + facing) * .3;
  });

  const ringColor = targeted ? '#e0675a' : '#f3ce79';
  return <group ref={root} position={[worldX(unit.x), heightAt(worldX(unit.x), laneZ[unit.lane]), laneZ[unit.lane]]} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
    <group scale={[facing, 1, 1]}>
      {slots.map(([ox, oz], index) => <group key={index} ref={(node) => { soldierRoots.current[index] = node; }} position={[ox, 0, oz]} scale={SOLDIER_SCALE}><Soldier kit={kit} type={unit.type} pose={poses[index]} /></group>)}
      {unit.hp > 0 && <group position={[-.75, 0, unit.type === 'archers' ? -1.05 : -.9]}>
        <mesh material={kit.leather} position={[0, .9, 0]}><cylinderGeometry args={[.025, .03, 1.8, 5]} /></mesh>
        <mesh ref={flag} material={kit.banner} position={[.26, 1.55, 0]}><boxGeometry args={[.5, .4, .02]} /></mesh>
        <mesh material={kit.crest} position={[.26, 1.55, .012]}><boxGeometry args={[.14, .14, .01]} /></mesh>
      </group>}
    </group>
    {(selected || targeted) && <mesh ref={ring} position={[0, .06, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.18, 1.32, 40]} /><meshBasicMaterial color={ringColor} transparent opacity={.9} depthWrite={false} /></mesh>}
    {/* Generous invisible hit volume so squads are easy to click in 3D. */}
    <mesh position={[0, .7, 0]} visible={false}><boxGeometry args={[1.8, 1.4, 2.2]} /></mesh>
  </group>;
}

/* ── Projectiles and impacts ────────────────────────────────────────────────────────────────────── */

type Flight = { mesh: THREE.Group; from: THREE.Vector3; to: THREE.Vector3; born: number; life: number; arc: number };
type Puff = { mesh: THREE.Mesh; born: number; life: number };

function Projectiles({ events, positions, paused }: { events: CombatEvent[]; positions: React.MutableRefObject<Map<string, THREE.Vector3>>; paused: boolean }) {
  const group = useRef<THREE.Group>(null);
  const flights = useRef<Flight[]>([]);
  const puffs = useRef<Puff[]>([]);
  const parts = useMemo(() => ({
    shaft: new THREE.CylinderGeometry(.012, .012, .6, 4).rotateZ(Math.PI / 2),
    head: new THREE.ConeGeometry(.03, .1, 4).rotateZ(-Math.PI / 2).translate(.33, 0, 0),
    wood: new THREE.MeshStandardMaterial({ color: '#d9c9a3' }),
    tip: new THREE.MeshStandardMaterial({ color: '#cfd6d8', metalness: .7, roughness: .3 }),
    dust: new THREE.SphereGeometry(.5, 8, 6),
  }), []);
  useEffect(() => {
    const scene = group.current; if (!scene || !events.length) return;
    const now = performance.now();
    events.forEach((event, eventIndex) => {
      const from = positions.current.get(event.unitId); const to = positions.current.get(event.targetId ?? '');
      if (!from || !to) return;
      if (event.kind === 'volley') {
        for (let i = 0; i < 4; i += 1) {
          const mesh = new THREE.Group(); mesh.add(new THREE.Mesh(parts.shaft, parts.wood), new THREE.Mesh(parts.head, parts.tip));
          const jitter = new THREE.Vector3((seeded(eventIndex + i) - .5) * .9, 0, (seeded(i + 3.3 + eventIndex) - .5) * 1.4);
          scene.add(mesh);
          flights.current.push({ mesh, from: from.clone().add(new THREE.Vector3(0, 1, (i - 1.5) * .45)), to: to.clone().add(jitter).add(new THREE.Vector3(0, .5, 0)), born: now + i * 70, life: 620, arc: 2.2 + Math.abs(from.x - to.x) * .06 });
        }
      }
      if (event.kind === 'charge' || event.kind === 'fall') {
        const material = new THREE.MeshBasicMaterial({ color: event.kind === 'fall' ? '#c9d2d4' : '#e9eef0', transparent: true, opacity: .5, depthWrite: false });
        const mesh = new THREE.Mesh(parts.dust, material); mesh.position.copy(to).add(new THREE.Vector3(0, .35, 0)); scene.add(mesh);
        puffs.current.push({ mesh, born: now, life: 900 });
      }
    });
  }, [events]);
  useFrame(() => {
    const now = performance.now();
    flights.current = flights.current.filter((flight) => {
      const t = (now - flight.born) / flight.life;
      if (t < 0) { flight.mesh.visible = false; return true; }
      if (t >= 1) { group.current?.remove(flight.mesh); return false; }
      flight.mesh.visible = true;
      const position = flight.from.clone().lerp(flight.to, t); position.y += Math.sin(t * Math.PI) * flight.arc;
      const ahead = flight.from.clone().lerp(flight.to, Math.min(1, t + .02)); ahead.y += Math.sin(Math.min(1, t + .02) * Math.PI) * flight.arc;
      flight.mesh.position.copy(position);
      const direction = ahead.sub(position).normalize();
      flight.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
      return true;
    });
    puffs.current = puffs.current.filter((puff) => {
      const t = (now - puff.born) / puff.life;
      if (t >= 1) { group.current?.remove(puff.mesh); (puff.mesh.material as THREE.Material).dispose(); return false; }
      puff.mesh.scale.setScalar(.4 + t * 2.2); (puff.mesh.material as THREE.MeshBasicMaterial).opacity = .45 * (1 - t);
      return true;
    });
    if (group.current) group.current.visible = !paused || flights.current.length > 0 || puffs.current.length > 0;
  });
  return <group ref={group} />;
}

/* ── The dragon of the trailer, an occasional omen overhead ─────────────────────────────────────── */

function Dragon({ paused }: { paused: boolean }) {
  const dragon = useRef<THREE.Group>(null);
  const leftWing = useRef<THREE.Group>(null);
  const rightWing = useRef<THREE.Group>(null);
  const timer = useRef(0);
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color: '#332c2e', metalness: .16, roughness: .72, flatShading: true }), []);
  const ember = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c18851', metalness: .18, roughness: .55, flatShading: true }), []);
  const membrane = useMemo(() => new THREE.MeshStandardMaterial({ color: '#633a3c', side: THREE.DoubleSide, roughness: .82 }), []);
  const wing = useMemo(() => new THREE.Shape().moveTo(0, 0).lineTo(-.3, 2.5).lineTo(1.3, 1.18).lineTo(2.7, 2.22).lineTo(1.53, -.12).lineTo(0, 0), []);
  useFrame((_, delta) => {
    if (paused) return;
    timer.current += Math.min(delta, .05);
    const phase = (timer.current + 6) % 42; const visible = phase < 10; const progress = phase / 10;
    if (dragon.current) { dragon.current.visible = visible; dragon.current.position.set(-26 + progress * 52, 9 + Math.sin(progress * Math.PI * 2) * .6, -9); }
    const flap = Math.sin(timer.current * 5.4) * .58;
    if (leftWing.current) leftWing.current.rotation.x = flap;
    if (rightWing.current) rightWing.current.rotation.x = -flap;
  });
  return <group ref={dragon} scale={1.1} visible={false}>
    <mesh material={body} castShadow><capsuleGeometry args={[.28, 1.2, 4, 7]} /></mesh>
    <mesh position={[.84, .08, 0]} material={body}><sphereGeometry args={[.27, 7, 5]} /></mesh>
    <mesh position={[1.08, 0, 0]} rotation={[0, 0, -Math.PI / 2]} material={body}><coneGeometry args={[.12, .38, 5]} /></mesh>
    {[-.45, -.12, .2, .5].map((x) => <mesh key={x} position={[x, .3, 0]} material={ember}><coneGeometry args={[.08, .28, 5]} /></mesh>)}
    <mesh position={[-.88, .04, 0]} rotation={[0, 0, Math.PI / 2]} material={body}><coneGeometry args={[.1, .95, 5]} /></mesh>
    <group ref={leftWing} position={[-.14, .18, .1]} rotation={[0, Math.PI / 2, 0]}><mesh rotation={[0, 0, .12]} material={membrane}><shapeGeometry args={[wing]} /></mesh></group>
    <group ref={rightWing} position={[-.14, .18, -.1]} rotation={[0, -Math.PI / 2, 0]}><mesh rotation={[0, 0, -.12]} material={membrane}><shapeGeometry args={[wing]} /></mesh></group>
  </group>;
}

/* ── Camera framing and DOM projection ──────────────────────────────────────────────────────────── */

/** Frame the whole pass at any aspect ratio by pulling the camera back on narrow screens. */
function CameraRig() {
  const { camera, size } = useThree();
  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const halfV = THREE.MathUtils.degToRad(perspective.fov / 2);
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const distance = Math.max(13.4, 11.8 / Math.tan(halfH));
    const direction = new THREE.Vector3(0, .6, .8).normalize();
    perspective.position.copy(direction.multiplyScalar(distance)).add(new THREE.Vector3(0, .4, .1));
    perspective.lookAt(0, .45, -.15);
    perspective.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

/** Keep DOM overlays (health bars, click targets, lane labels) glued to the 3D squads every frame. */
function ProjectionBridge({ positions, onProjector }: { positions: React.MutableRefObject<Map<string, THREE.Vector3>>; onProjector?: (projector: Projector) => void }) {
  const { camera, size } = useThree();
  const scratch = useMemo(() => new THREE.Vector3(), []);
  const toScreen = (point: THREE.Vector3) => { scratch.copy(point).project(camera); return { left: (scratch.x + 1) / 2 * size.width, top: (1 - scratch.y) / 2 * size.height }; };
  useEffect(() => {
    onProjector?.((lane, x, lift = 1) => { const wx = worldX(x); const wz = laneZ[lane]; return toScreen(new THREE.Vector3(wx, heightAt(wx, wz) + lift, wz)); });
  }, [camera, size.width, size.height]);
  useFrame(() => {
    positions.current.forEach((point, id) => {
      const element = document.getElementById(`hud-${id}`); if (!element) return;
      const screen = toScreen(new THREE.Vector3(point.x, point.y + .75, point.z));
      element.style.left = `${screen.left}px`; element.style.top = `${screen.top}px`;
    });
    (Object.keys(laneZ) as Lane[]).forEach((lane) => {
      const element = document.getElementById(`lane-label-${lane}`); if (!element) return;
      const wx = -11.4; const screen = toScreen(new THREE.Vector3(wx, heightAt(wx, laneZ[lane]) + .15, laneZ[lane]));
      element.style.left = `${Math.max(8, screen.left)}px`; element.style.top = `${screen.top}px`;
    });
  });
  return null;
}

function BattleScene({ combat, selected, targeted, paused, onSelect, onProjector }: { combat: CombatState; selected: string; targeted?: string; paused: boolean; onSelect(id: string): void; onProjector?: (projector: Projector) => void }) {
  const positions = useRef(new Map<string, THREE.Vector3>());
  const attackAt = useRef(new Map<string, number>());
  useEffect(() => { const now = performance.now(); combat.events.forEach((event) => { if (event.kind !== 'move' && event.kind !== 'rally') attackAt.current.set(event.unitId, now); }); }, [combat.events]);
  return <>
    <Sky />
    <fog attach="fog" args={['#c5cbc6', 24, 70]} />
    <hemisphereLight args={['#cfdde6', '#3b4447', .6]} />
    <ambientLight intensity={.18} />
    <directionalLight position={[-14, 16, 9]} intensity={1.9} color="#ffe2bb" castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-camera-near={1} shadow-camera-far={60} shadow-bias={-.0005} />
    <directionalLight position={[12, 6, -8]} intensity={.45} color="#a9c3d4" />
    <CameraRig />
    <Terrain /><Mountains /><Pines /><Boulders /><Ruins />
    <WarBanner position={[-12, heightAt(-12, 1.6), 1.6]} side="crown" />
    <WarBanner position={[12, heightAt(12, 1.6), 1.6]} side="raiders" />
    <Snowfall paused={paused} />
    <Dragon paused={paused} />
    {combat.units.map((unit) => <Squad key={unit.id} unit={unit} selected={selected === unit.id} targeted={targeted === unit.id} paused={paused} attackAt={attackAt} positions={positions} onSelect={() => onSelect(unit.id)} />)}
    <Projectiles events={combat.events} positions={positions} paused={paused} />
    <ProjectionBridge positions={positions} onProjector={onProjector} />
  </>;
}

/** A presentation-only Three.js battlefield. Combat rules remain in the deterministic campaign engine. */
export function Battlefield3D({ combat, selected, targeted, paused, onSelect, onProjector }: { combat: CombatState; selected: string; targeted?: string; paused: boolean; onSelect(id: string): void; onProjector?: (projector: Projector) => void }) {
  return <div className="battlefield-world" aria-hidden="true">
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 9, 16], fov: 40, near: .1, far: 200 }} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }} fallback={<div className="webgl-fallback-note">3D rendering is unavailable; battlefield orders and results remain playable.</div>}>
      <BattleScene combat={combat} selected={selected} targeted={targeted} paused={paused} onSelect={onSelect} onProjector={onProjector} />
    </Canvas>
  </div>;
}
