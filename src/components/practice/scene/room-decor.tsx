"use client";

import { useMemo } from "react";

// Real room geometry + procedural decorations (metres). Built from primitives so the
// whole room parallaxes/scales with the camera and is VR-ready (no flat backdrop, no
// external asset downloads).
export const ROOM_W = 5.2; // wall-to-wall width (x)
export const ROOM_D = 6.4; // depth (z)
export const ROOM_H = 2.8; // floor-to-ceiling height (y)
export const ROOM_BACK_Z = -2; // back wall sits behind the chairs
export const ROOM_FRONT_Z = ROOM_BACK_Z + ROOM_D; // front wall behind the camera
export const ROOM_MID_Z = (ROOM_BACK_Z + ROOM_FRONT_Z) / 2;
export const ROOM_HALF_W = ROOM_W / 2;
export const WALL_COLOR = "#d8d1c5"; // warm off-white
export const FLOOR_COLOR = "#b3a48d"; // soft warm wood/greige
export const CEIL_COLOR = "#ece8e0"; // slightly brighter than the walls

// An enclosing room (floor + 4 walls + ceiling). A plane faces +z by default, so each
// surface is rotated to face inward.
export function Room() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, ROOM_MID_Z]} receiveShadow>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.9} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM_H, ROOM_MID_Z]}>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial color={CEIL_COLOR} roughness={1} />
      </mesh>
      <mesh position={[0, ROOM_H / 2, ROOM_BACK_Z]} receiveShadow>
        <planeGeometry args={[ROOM_W, ROOM_H]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.95} />
      </mesh>
      <mesh position={[0, ROOM_H / 2, ROOM_FRONT_Z]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[ROOM_W, ROOM_H]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.95} />
      </mesh>
      <mesh position={[-ROOM_HALF_W, ROOM_H / 2, ROOM_MID_Z]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[ROOM_D, ROOM_H]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.95} />
      </mesh>
      <mesh position={[ROOM_HALF_W, ROOM_H / 2, ROOM_MID_Z]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[ROOM_D, ROOM_H]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.95} />
      </mesh>
    </group>
  );
}

type Vec3 = [number, number, number];

// A framed picture: a dark frame box with a coloured "art" plane on its front face.
function WallArt({
  position,
  rotation = [0, 0, 0],
  w = 0.6,
  h = 0.8,
  art = "#7e93ad",
}: {
  position: Vec3;
  rotation?: Vec3;
  w?: number;
  h?: number;
  art?: string;
}) {
  const d = 0.04;
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#3b2f25" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, d / 2 + 0.002]}>
        <planeGeometry args={[w * 0.82, h * 0.82]} />
        <meshStandardMaterial color={art} roughness={0.5} />
      </mesh>
    </group>
  );
}

const BOOK_COLORS = [
  "#7d4a3b",
  "#3f5a6e",
  "#6b6f4a",
  "#8a6d3b",
  "#574a6e",
  "#9a5b53",
  "#46604f",
  "#b08a4a",
];

// A back-wall bookshelf: side/top/bottom panels, shelves, and rows of differently sized
// "books" (deterministic, so the arrangement is stable across renders).
function Bookshelf({ position }: { position: Vec3 }) {
  const W = 1.1;
  const H = 1.7;
  const D = 0.3;
  const T = 0.04; // panel thickness
  const SHELVES = 4;

  const { books, shelfYs, openingH } = useMemo(() => {
    const inner = W - 2 * T;
    const openH = (H - (SHELVES + 1) * T) / SHELVES;
    const ys: number[] = [];
    const out: { x: number; y: number; w: number; h: number; color: string }[] = [];
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let s = 0; s < SHELVES; s += 1) {
      const shelfBottom = T + s * (openH + T);
      ys.push(shelfBottom - T / 2); // y of the shelf board below this opening
      let x = -inner / 2 + 0.015;
      while (x < inner / 2 - 0.035) {
        const bw = 0.028 + rnd() * 0.03;
        const bh = openH * (0.62 + rnd() * 0.32);
        out.push({
          x: x + bw / 2,
          y: shelfBottom + bh / 2,
          w: bw,
          h: bh,
          color: BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)],
        });
        x += bw + 0.004;
      }
    }
    ys.push(H - T / 2); // top board
    return { books: out, shelfYs: ys, openingH: openH };
  }, []);

  const woodColor = "#6d4c33";
  const bookDepth = D - 0.08;

  return (
    <group position={position}>
      {/* Back panel */}
      <mesh position={[0, H / 2, -D / 2 + T / 2]} receiveShadow>
        <boxGeometry args={[W, H, T]} />
        <meshStandardMaterial color={woodColor} roughness={0.8} />
      </mesh>
      {/* Side panels */}
      <mesh position={[-W / 2 + T / 2, H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[T, H, D]} />
        <meshStandardMaterial color={woodColor} roughness={0.8} />
      </mesh>
      <mesh position={[W / 2 - T / 2, H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[T, H, D]} />
        <meshStandardMaterial color={woodColor} roughness={0.8} />
      </mesh>
      {/* Shelf boards (bottom, between openings, and top) */}
      {shelfYs.map((y, i) => (
        <mesh key={`shelf-${i}`} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[W - 2 * T, T, D]} />
          <meshStandardMaterial color={woodColor} roughness={0.8} />
        </mesh>
      ))}
      {/* Books */}
      {books.map((b, i) => (
        <mesh key={`book-${i}`} position={[b.x, b.y, 0]} castShadow>
          <boxGeometry args={[b.w, b.h, bookDepth]} />
          <meshStandardMaterial color={b.color} roughness={0.7} />
        </mesh>
      ))}
      {/* A couple of small framed photos leaning on shelves for a therapy-office feel */}
      <mesh position={[0.22, T + openingH * 1.5 + T * 1.5 + 0.12, 0.02]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.14, 0.18, 0.02]} />
        <meshStandardMaterial color="#cfc7bb" roughness={0.5} />
      </mesh>
    </group>
  );
}

// A simple potted plant: tapered pot + a cluster of foliage spheres.
function Plant({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.17, 0.13, 0.4, 18]} />
        <meshStandardMaterial color="#9c6b4a" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.78, 0]} castShadow>
        <sphereGeometry args={[0.36, 16, 16]} />
        <meshStandardMaterial color="#4d7a4a" roughness={0.95} />
      </mesh>
      <mesh position={[0.2, 0.98, 0.1]} castShadow>
        <sphereGeometry args={[0.24, 14, 14]} />
        <meshStandardMaterial color="#5b8a55" roughness={0.95} />
      </mesh>
      <mesh position={[-0.17, 0.92, -0.08]} castShadow>
        <sphereGeometry args={[0.22, 14, 14]} />
        <meshStandardMaterial color="#43703f" roughness={0.95} />
      </mesh>
    </group>
  );
}

// A round wall clock (face toward +z in local space, so rotate the group for side walls).
function WallClock({ position, rotation = [0, 0, 0] }: { position: Vec3; rotation?: Vec3 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.03, 28]} />
        <meshStandardMaterial color="#2c2c2c" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.018]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.01, 28]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.4} />
      </mesh>
      {/* hands */}
      <mesh position={[0, 0.045, 0.03]}>
        <boxGeometry args={[0.012, 0.1, 0.004]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh position={[0.035, 0, 0.03]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.012, 0.075, 0.004]} />
        <meshStandardMaterial color="#222" />
      </mesh>
    </group>
  );
}

// All decorations, placed around the room.
// - Couple: the bookshelf sits centred in the gap between the two seats; plant back-right.
// - Single: a lone client is centred at x=0, so the bookshelf is shifted to the back-right
//   (it would otherwise be hidden behind their head) and the plant moves to the back-left
//   to balance the composition.
export function RoomDecor({ single = false }: { single?: boolean }) {
  const backWallZ = ROOM_BACK_Z + 0.03; // a hair in front of the wall to avoid z-fighting
  const bookshelfX = single ? 0.85 : 0;
  const plantX = single ? -(ROOM_HALF_W - 0.55) : ROOM_HALF_W - 0.55;
  // Clock follows the bookshelf so it stays centred over it.
  const clockX = bookshelfX;
  return (
    <group>
      <Bookshelf position={[bookshelfX, 0, ROOM_BACK_Z + 0.16]} />
      <WallClock position={[clockX, 2.0, backWallZ]} />
      {/* Back-wall art: flank the bookshelf (couple) or hang opposite it (single) */}
      {single ? (
        <>
          <WallArt position={[-1.0, 1.45, backWallZ]} w={0.6} h={0.8} art="#7e93ad" />
          <WallArt position={[-1.85, 1.4, backWallZ]} w={0.5} h={0.66} art="#9a8475" />
        </>
      ) : (
        <>
          <WallArt position={[-1.55, 1.42, backWallZ]} w={0.58} h={0.78} art="#7e93ad" />
          <WallArt position={[1.55, 1.42, backWallZ]} w={0.58} h={0.78} art="#9a8475" />
        </>
      )}
      {/* Side-wall art */}
      <WallArt
        position={[-ROOM_HALF_W + 0.03, 1.5, 0.4]}
        rotation={[0, Math.PI / 2, 0]}
        w={0.72}
        h={0.52}
        art="#88a08a"
      />
      <WallArt
        position={[ROOM_HALF_W - 0.03, 1.5, 0.4]}
        rotation={[0, -Math.PI / 2, 0]}
        w={0.72}
        h={0.52}
        art="#a7917e"
      />
      {/* Potted plant in a back corner */}
      <Plant position={[plantX, 0, ROOM_BACK_Z + 0.55]} />
      {/* Area rug under the chairs (just above the floor; contact shadows sit above it) */}
      <mesh position={[0, 0.008, 0.3]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3.3, 2.3]} />
        <meshStandardMaterial color="#9c8f7e" roughness={1} />
      </mesh>
    </group>
  );
}
