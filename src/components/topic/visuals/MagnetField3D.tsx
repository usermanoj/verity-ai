"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// A bar magnet's field in three dimensions, orbitable.
//
// A field is a property of the space around a magnet, and every textbook
// diagram of one is a lie by omission: it draws a plane through a thing that
// fills a volume. Students carry that flat picture into secondary school.
// Turning it with your finger is the cheapest correction available.
//
// three.js is ~600 kB, so this module is loaded only when a lesson actually
// matches the field concept — see the dynamic import in ConceptVisual. Every
// other lesson pays nothing for it.

function FieldLines() {
  const group = useRef<THREE.Group>(null);

  // Dipole field lines as tubes. Generated once: rebuilding this geometry on
  // each frame would burn a phone's battery to draw a static shape.
  const curves = useMemo(() => {
    const built: THREE.TubeGeometry[] = [];
    for (const spread of [0.55, 1.0, 1.5, 2.0]) {
      for (const side of [1, -1]) {
        const points: THREE.Vector3[] = [];
        for (let t = 0; t <= 1.0001; t += 0.05) {
          // A loop from the north pole out and back to the south, bulging
          // further from the axis the wider the line.
          const angle = Math.PI * t;
          points.push(
            new THREE.Vector3(
              -1.1 + 2.2 * t,
              side * Math.sin(angle) * spread,
              0,
            ),
          );
        }
        built.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.022, 8, false));
      }
    }
    return built;
  }, []);

  // A slow drift, so the shape reads as three-dimensional before anyone
  // thinks to drag it.
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.18;
  });

  return (
    <group ref={group}>
      {curves.map((geometry, i) => (
        <mesh key={i} geometry={geometry}>
          <meshStandardMaterial color="#22d3ee" emissive="#0e7490" emissiveIntensity={0.45} transparent opacity={0.75} />
        </mesh>
      ))}
      {/* The magnet: north pink, south indigo — the same coding the 2D
          visuals use, so the colours mean one thing across the lesson. */}
      <mesh position={[-0.55, 0, 0]}>
        <boxGeometry args={[1.1, 0.42, 0.42]} />
        <meshStandardMaterial color="#f472b6" />
      </mesh>
      <mesh position={[0.55, 0, 0]}>
        <boxGeometry args={[1.1, 0.42, 0.42]} />
        <meshStandardMaterial color="#6366f1" />
      </mesh>
    </group>
  );
}

export default function MagnetField3D() {
  return (
    <div className="h-64 w-full cursor-grab overflow-hidden rounded-xl active:cursor-grabbing">
      <Canvas camera={{ position: [0, 1.6, 4.6], fov: 50 }} dpr={[1, 1.75]}>
        <ambientLight intensity={0.75} />
        <directionalLight position={[3, 4, 5]} intensity={1.1} />
        <FieldLines />
        <OrbitControls enablePan={false} enableZoom={false} />
      </Canvas>
    </div>
  );
}
