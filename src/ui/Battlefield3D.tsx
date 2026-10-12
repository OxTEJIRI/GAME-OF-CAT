import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CombatState, CombatUnit, Lane } from '../game/combat';

const laneZ: Record<Lane, number> = { high: -2.45, road: 0, flank: 2.45 };
const fieldX = (x: number) => (Math.max(3, Math.min(94, x)) / 100) * 19 - 9.5;
const material = (color: string, metalness = 0, roughness = .8) => new THREE.MeshStandardMaterial({ color, metalness, roughness, flatShading: true });

function Banner({ position, color }: { position: [number, number, number]; color: string }) {
  return <group position={position}>
    <mesh position={[0, .85, 0]}><cylinderGeometry args={[.035, .045, 1.7, 6]} /><meshStandardMaterial color="#51412d" /></mesh>
    <mesh position={[.29, 1.23, 0]} castShadow><boxGeometry args={[.58, .52, .045]} /><meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={.9} /></mesh>
    <mesh position={[.28, .93, .027]}><boxGeometry args={[.18, .18, .01]} /><meshStandardMaterial color="#dfc27c" metalness={.3} /></mesh>
  </group>;
}

function SnowField() {
  const stones = useMemo(() => Array.from({ length: 46 }, (_, index) => ({
    x: ((index * 47) % 187) / 10 - 9.35,
    z: ((index * 31) % 76) / 10 - 3.8,
    size: .12 + (index % 5) * .065,
    tone: index % 3 ? '#647078' : '#879093',
    rot: index * .73,
  })), []);
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.13, 0]} receiveShadow><planeGeometry args={[21, 9.5, 40, 20]} /><meshStandardMaterial color="#8f9b9d" roughness={1} /></mesh>
    <mesh position={[0, -.01, -5.05]} receiveShadow><boxGeometry args={[23, 1.6, 2.4]} /><meshStandardMaterial color="#435357" roughness={1} /></mesh>
    <mesh position={[0, -.01, 5.05]} receiveShadow><boxGeometry args={[23, 1.6, 2.4]} /><meshStandardMaterial color="#414d53" roughness={1} /></mesh>
    <mesh position={[-5.8, .015, -2.46]} receiveShadow><boxGeometry args={[7.7, .16, 2.7]} /><meshStandardMaterial color="#b4c1c1" roughness={1} /></mesh>
    <mesh position={[0, -.01, .02]} receiveShadow><boxGeometry args={[20.8, .12, 1.15]} /><meshStandardMaterial color="#71695d" roughness={1} /></mesh>
    <mesh position={[5.9, .015, 2.46]} receiveShadow><boxGeometry args={[7.8, .16, 2.7]} /><meshStandardMaterial color="#a7b3b3" roughness={1} /></mesh>
    {[-2.45, 0, 2.45].map((z, index) => <group key={z}>
      <mesh position={[0, .03, z - .95]}><boxGeometry args={[19.6, .04, .045]} /><meshStandardMaterial color={index === 1 ? '#a98a54' : '#829497'} emissive={index === 1 ? '#59401b' : '#26383a'} /></mesh>
      <mesh position={[0, .03, z + .95]}><boxGeometry args={[19.6, .04, .045]} /><meshStandardMaterial color="#829497" /></mesh>
    </group>)}
    {stones.map((stone, index) => <mesh key={index} position={[stone.x, .05, stone.z]} rotation={[0, stone.rot, 0]} castShadow><dodecahedronGeometry args={[stone.size, 0]} /><meshStandardMaterial color={stone.tone} flatShading /></mesh>)}
    {[-8.4, -7.5, -6.6, -5.7].map((x, index) => <mesh key={x} position={[x, .72, -4.58 + (index % 2) * .4]} castShadow><coneGeometry args={[.8 + (index % 2) * .35, 2.1 + (index % 3) * .45, 5]} /><meshStandardMaterial color={index % 2 ? '#455756' : '#334a4b'} flatShading /></mesh>)}
    <Banner position={[-8.2, .13, 3.85]} color="#782f37" />
    <Banner position={[8.2, .13, -3.85]} color="#87423a" />
    <group position={[8.5, .1, -4.35]}>
      <mesh position={[0, .45, 0]} castShadow><boxGeometry args={[1.4, .9, .7]} /><meshStandardMaterial color="#797266" /></mesh>
      {[-.48, .48].map((x) => <mesh key={x} position={[x, .98, 0]} castShadow><coneGeometry args={[.32, .75, 4]} /><meshStandardMaterial color="#aaa89f" /></mesh>)}
    </group>
    <group position={[-8.5, .1, 4.3]}>
      <mesh position={[0, .32, 0]} castShadow><boxGeometry args={[1.25, .64, .65]} /><meshStandardMaterial color="#66513c" /></mesh>
      <mesh position={[0, .68, 0]} castShadow><coneGeometry args={[.82, .34, 4]} /><meshStandardMaterial color="#61443a" /></mesh>
      <mesh position={[0, .37, .335]}><boxGeometry args={[.31, .4, .02]} /><meshStandardMaterial color="#201a17" /></mesh>
    </group>
  </>;
}

function CatHead({ fur, facing }: { fur: string; facing: number }) {
  const coat = useMemo(() => material(fur), [fur]);
  const dark = useMemo(() => material('#302c27'), []);
  const eyes = useMemo(() => material('#d8b85f', .1), []);
  const nose = useMemo(() => material('#9f695d'), []);
  return <group position={[0, 1.68, 0]} rotation={[0, facing > 0 ? 0 : Math.PI, 0]}>
    <mesh castShadow material={coat}><sphereGeometry args={[.34, 9, 7]} /></mesh>
    {[-1, 1].map((side) => <group key={side} position={[side * .22, .25, -.035]}>
      <mesh position={[0, .19, 0]} rotation={[0, 0, -side * .1]} castShadow material={coat}><coneGeometry args={[.16, .48, 5]} /></mesh>
      <mesh position={[0, .14, .102]} rotation={[0, 0, -side * .1]} material={nose}><coneGeometry args={[.075, .23, 4]} /></mesh>
      <mesh position={[side * -.17, -.015, .286]} material={eyes}><sphereGeometry args={[.062, 8, 6]} /></mesh>
      <mesh position={[side * -.17, -.015, .335]} material={dark}><sphereGeometry args={[.02, 6, 6]} /></mesh>
    </group>)}
    <mesh position={[0, -.14, .29]} scale={[1, .7, .65]} material={coat}><sphereGeometry args={[.18, 8, 6]} /></mesh>
    <mesh position={[0, -.105, .42]} material={nose}><octahedronGeometry args={[.04, 0]} /></mesh>
    {[-1, 1].map((side) => <group key={side}>
      <mesh position={[side * .25, -.17, .39]} rotation={[side * .12, 0, -side * .08]} material={dark}><cylinderGeometry args={[.006, .008, .35, 4]} /></mesh>
      <mesh position={[side * .29, -.15, .4]} rotation={[side * .13, 0, side * .18]} material={dark}><cylinderGeometry args={[.006, .008, .32, 4]} /></mesh>
    </group>)}
  </group>;
}

function Fighter({ unit, selected, targeted, paused, onSelect }: { unit: CombatUnit; selected: boolean; targeted: boolean; paused: boolean; onSelect(): void }) {
  const root = useRef<THREE.Group>(null);
  const swing = useRef<THREE.Group>(null);
  const moveTime = useRef(0);
  const gait = useRef(0);
  const allied = unit.side === 'crown';
  const facing = allied ? 1 : -1;
  const isMoving = !unit.routed && unit.hp > 0 && (!!unit.laneTarget || unit.order === 'advance' || unit.type === 'cavalry');
  const cloth = useMemo(() => material(allied ? '#772e38' : '#6a4035'), [allied]);
  const clothLight = useMemo(() => material(allied ? '#b48b50' : '#926b4f'), [allied]);
  const steel = useMemo(() => material(allied ? '#8e9897' : '#786b60', .52, .43), [allied]);
  const furColor = allied ? '#d0b88f' : '#807262';
  const fur = useMemo(() => material(furColor), [furColor]);
  const boot = useMemo(() => material('#332c28'), []);

  useFrame((_, delta) => {
    if (!root.current || paused) return;
    const dt = Math.min(delta, .05);
    moveTime.current += dt;
    const targetZ = laneZ[unit.laneTarget ?? unit.lane];
    const desiredX = fieldX(unit.x);
    root.current.position.x = THREE.MathUtils.damp(root.current.position.x, desiredX, 5, dt);
    root.current.position.z = THREE.MathUtils.damp(root.current.position.z, targetZ, 5, dt);
    const stride = isMoving ? Math.sin(moveTime.current * (unit.type === 'cavalry' ? 17 : 11)) : 0;
    gait.current = stride;
    root.current.position.y = (unit.hp <= 0 ? -.38 : unit.routed ? -.16 : 0) + Math.abs(stride) * .045;
    root.current.rotation.z = unit.hp <= 0 ? -Math.PI / 2 : unit.routed ? -.32 : stride * (unit.type === 'cavalry' ? .045 : .02);
    if (swing.current) swing.current.rotation.x = !paused && unit.order === 'advance' && unit.hp > 0 ? Math.sin(moveTime.current * 9) * .33 : 0;
  });
  return <group ref={root} position={[fieldX(unit.x), 0, laneZ[unit.lane]]} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
    {selected && <mesh position={[0, .035, .02]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.67, .78, 28]} /><meshBasicMaterial color="#f3ce79" /></mesh>}
    {targeted && <mesh position={[0, .045, .02]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.86, .96, 28]} /><meshBasicMaterial color="#d56a60" /></mesh>}
    <group scale={[1, unit.type === 'cavalry' ? 1.04 : 1, 1]}>
      {unit.type === 'cavalry' ? <group>
        <mesh position={[-.08, .56, 0]} castShadow material={steel}><boxGeometry args={[1.18, .56, .43]} /></mesh>
        <mesh position={[facing * .58, .68, 0]} castShadow material={fur}><sphereGeometry args={[.29, 8, 6]} /></mesh>
        <mesh position={[facing * .78, .64, 0]} material={boot}><coneGeometry args={[.14, .38, 5]} /></mesh>
        {[-.45, .38].map((x) => [-.18, .18].map((z) => <group key={`${x}-${z}`} position={[x, .4, z]}>
          <mesh position={[0, -.2, 0]} material={boot}><cylinderGeometry args={[.055, .07, .47, 6]} /></mesh>
          <mesh position={[.08 * gait.current, -.42, .015]} material={boot}><sphereGeometry args={[.1, 6, 5]} /></mesh>
        </group>))}
        <mesh position={[-.6 * facing, .8, .03]} rotation={[0, 0, -.42 * facing]} material={cloth}><boxGeometry args={[.38, .23, .025]} /></mesh>
      </group> : null}
      <group position={[unit.type === 'cavalry' ? -.1 : 0, unit.type === 'cavalry' ? .95 : .72, .06]}>
        <mesh position={[0, -.2, 0]} castShadow material={cloth}><boxGeometry args={[.42, .69, .38]} /></mesh>
        <mesh position={[0, .13, .215]} castShadow material={steel}><boxGeometry args={[.45, .22, .12]} /></mesh>
        <mesh position={[-.17, -.12, .025]} material={steel}><boxGeometry args={[.13, .52, .31]} /></mesh>
        <mesh position={[.18, -.2, -.015]} material={cloth}><cylinderGeometry args={[.06, .07, .49, 6]} /></mesh>
        <CatHead fur={furColor} facing={facing} />
        <mesh position={[0, -.3, .03]} rotation={[.32, 0, -facing * .1]} castShadow material={cloth}><boxGeometry args={[.53, .28, .34]} /></mesh>
        <group ref={swing} position={[.29 * facing, -.04, .08]}>
          {unit.type === 'archers' ? <>
            <mesh rotation={[0, 0, .23]} material={boot}><cylinderGeometry args={[.022, .03, .79, 5]} /></mesh>
            <mesh position={[.09 * facing, -.1, .08]} rotation={[0, 0, .25]} material={clothLight}><torusGeometry args={[.31, .025, 5, 11, Math.PI * 1.45]} /></mesh>
            <mesh position={[0, .08, .02]} material={steel}><boxGeometry args={[.12, .2, .1]} /></mesh>
            <mesh position={[-.25 * facing, .23, -.17]} material={boot}><cylinderGeometry args={[.045, .045, .4, 6]} /></mesh>
          </> : <>
            <mesh position={[.14 * facing, -.03, .02]} rotation={[0, 0, -.35 * facing]} material={steel}><boxGeometry args={[.31, .4, .1]} /></mesh>
            <mesh position={[.3 * facing, .11, .14]} rotation={[0, 0, -.08 * facing]} material={clothLight}><boxGeometry args={[.055, .96, .06]} /></mesh>
            <mesh position={[.3 * facing, .62, .14]} rotation={[0, 0, -.08 * facing]} material={steel}><coneGeometry args={[.075, .19, 5]} /></mesh>
          </>}
        </group>
        {allied && <mesh position={[0, -.31, .2]} material={clothLight}><boxGeometry args={[.11, .37, .025]} /></mesh>}
      </group>
      <mesh position={[-.28 * facing, unit.type === 'cavalry' ? 1.42 : 1.25, -.02]} rotation={[0, 0, facing * .22]} material={fur}><cylinderGeometry args={[.025, .045, .55, 5]} /></mesh>
    </group>
    {isMoving && <mesh position={[0, .12, .02]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.94, .99, 20]} /><meshBasicMaterial color={allied ? '#d4b16d' : '#cc766a'} transparent opacity={.55} /></mesh>}
  </group>;
}

function Dragon({ paused }: { paused: boolean }) {
  const dragon = useRef<THREE.Group>(null);
  const leftWing = useRef<THREE.Group>(null);
  const rightWing = useRef<THREE.Group>(null);
  const timer = useRef(0);
  const body = useMemo(() => material('#332c2e', .16, .72), []);
  const belly = useMemo(() => material('#755244', .08), []);
  const ember = useMemo(() => material('#c18851', .18, .55), []);
  const membrane = useMemo(() => new THREE.MeshStandardMaterial({ color: '#633a3c', side: THREE.DoubleSide, roughness: .82 }), []);
  useFrame((_, delta) => {
    if (paused) return;
    timer.current += Math.min(delta, .05);
    // First fly-by arrives early enough to notice in a normal battle; subsequent passes are occasional.
    const phase = (timer.current + 4) % 38;
    const visible = phase < 9;
    if (dragon.current) {
      dragon.current.visible = visible;
      const progress = phase / 9;
      dragon.current.position.set(-15 + progress * 30, 7.5 + Math.sin(progress * Math.PI * 2) * .32, -4.4);
      dragon.current.rotation.z = Math.sin(progress * Math.PI * 2) * .035;
    }
    const flap = Math.sin(timer.current * 5.4) * .58;
    if (leftWing.current) leftWing.current.rotation.x = flap;
    if (rightWing.current) rightWing.current.rotation.x = -flap;
  });
  return <group ref={dragon} scale={.78}>
    <mesh position={[0, 0, 0]} castShadow material={body}><capsuleGeometry args={[.28, 1.2, 4, 7]} /></mesh>
    <mesh position={[0, -.16, .015]} rotation={[0, 0, Math.PI / 2]} material={belly}><capsuleGeometry args={[.18, .95, 4, 6]} /></mesh>
    <mesh position={[.84, .08, 0]} castShadow material={body}><sphereGeometry args={[.27, 7, 5]} /></mesh>
    <mesh position={[1.08, 0, 0]} rotation={[0, 0, -Math.PI / 2]} material={body}><coneGeometry args={[.12, .38, 5]} /></mesh>
    {[-.45, -.12, .2, .5, .78].map((x, index) => <mesh key={x} position={[x, .28 + (index % 2) * .04, 0]} rotation={[0, 0, .08]} material={ember}><coneGeometry args={[.09 - index * .006, .3 - index * .015, 5]} /></mesh>)}
    {[-1, 1].map((side) => <mesh key={side} position={[.93, .12, side * .2]} material={ember}><sphereGeometry args={[.045, 6, 5]} /></mesh>)}
    <mesh position={[-.88, .04, 0]} rotation={[0, 0, Math.PI / 2]} material={body}><coneGeometry args={[.1, .95, 5]} /></mesh>
    {[-.24, .24].map((z) => <mesh key={z} position={[.94, .28, z]} rotation={[0, 0, -.5]} material={body}><coneGeometry args={[.06, .35, 4]} /></mesh>)}
    <group ref={leftWing} position={[-.14, .18, .1]} rotation={[0, Math.PI / 2, 0]}>
      <mesh rotation={[0, 0, .12]} material={membrane}><shapeGeometry args={[new THREE.Shape().moveTo(0, 0).lineTo(-.3, 2.5).lineTo(1.3, 1.18).lineTo(2.7, 2.22).lineTo(1.53, -.12).lineTo(0, 0)]} /></mesh>
      {[[-.3, 2.5], [1.3, 1.18], [2.7, 2.22]].map(([x, y], index) => <mesh key={index} position={[x / 2, y / 2, 0]} rotation={[0, 0, Math.atan2(y, x)]} material={body}><cylinderGeometry args={[.018, .026, Math.hypot(x, y), 4]} /></mesh>)}
    </group>
    <group ref={rightWing} position={[-.14, .18, -.1]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh rotation={[0, 0, -.12]} material={membrane}><shapeGeometry args={[new THREE.Shape().moveTo(0, 0).lineTo(-.3, 2.5).lineTo(1.3, 1.18).lineTo(2.7, 2.22).lineTo(1.53, -.12).lineTo(0, 0)]} /></mesh>
    </group>
  </group>;
}

function BattleScene({ combat, selected, targeted, paused, onSelect }: { combat: CombatState; selected: string; targeted?: string; paused: boolean; onSelect(id: string): void }) {
  return <>
    <color attach="background" args={['#647579']} />
    <fog attach="fog" args={['#78898c', 17, 34]} />
    <ambientLight intensity={.55} />
    <hemisphereLight args={['#d7e1dd', '#293a3f', .72]} />
    <directionalLight position={[-5, 11, 6]} intensity={1.65} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={12} shadow-camera-bottom={-12} />
    <directionalLight position={[8, 5, -5]} intensity={.35} color="#dcbb82" />
    <SnowField />
    <Dragon paused={paused} />
    {combat.units.map((unit) => <Fighter key={unit.id} unit={unit} selected={selected === unit.id} targeted={targeted === unit.id} paused={paused} onSelect={() => onSelect(unit.id)} />)}
  </>;
}

/** A presentation-only Three.js battlefield. Combat rules remain in the deterministic campaign engine. */
export function Battlefield3D({ combat, selected, targeted, paused, onSelect }: { combat: CombatState; selected: string; targeted?: string; paused: boolean; onSelect(id: string): void }) {
  return <div className="battlefield-world" aria-label="Three-dimensional Greyfen Pass battlefield">
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 13.5, 23.5], fov: 43, near: .1, far: 100 }} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }} onCreated={({ camera }) => camera.lookAt(0, .15, 0)} fallback={<div className="webgl-fallback-note">3D rendering is unavailable; battlefield orders and results remain playable.</div>}>
      <BattleScene combat={combat} selected={selected} targeted={targeted} paused={paused} onSelect={onSelect} />
    </Canvas>
  </div>;
}
