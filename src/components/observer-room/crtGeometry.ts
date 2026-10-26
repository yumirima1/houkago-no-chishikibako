import * as THREE from "three";

type Profile = { width: number; height: number; radius: number; z: number };
const CORNER_STEPS = 10;

function roundedLoop({ width, height, radius, z }: Profile) {
  const points: THREE.Vector3[] = [];
  const centers = [[width / 2 - radius, height / 2 - radius], [-width / 2 + radius, height / 2 - radius],
    [-width / 2 + radius, -height / 2 + radius], [width / 2 - radius, -height / 2 + radius]];
  centers.forEach(([x, y], corner) => {
    for (let step = 0; step <= CORNER_STEPS; step++) {
      const angle = (corner + step / CORNER_STEPS) * Math.PI / 2;
      points.push(new THREE.Vector3(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, z));
    }
  });
  return points;
}

/** A continuous front shell, with an actual opening and flared inner walls. */
export function createCRTBezelGeometry() {
  const outer = [
    { width: 1.54, height: 1.02, radius: 0.005, z: 0.27 },
    { width: 1.54, height: 1.02, radius: 0.085, z: 0.485 },
    { width: 1.50, height: 0.98, radius: 0.095, z: 0.525 },
  ];
  const inner = [
    { width: 1.35, height: 0.83, radius: 0.10, z: 0.27 },
    { width: 1.29, height: 0.77, radius: 0.085, z: 0.485 },
    { width: 1.29, height: 0.77, radius: 0.085, z: 0.525 },
  ];
  const loops = [...outer.map(roundedLoop), ...inner.map(roundedLoop)];
  const count = loops[0].length, positions = loops.flatMap((loop) => loop.flatMap((p) => [p.x, p.y, p.z]));
  const indices: number[] = [];
  const quad = (a: number, b: number, c: number, d: number) => indices.push(a, b, c, a, c, d);
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    for (let level = 0; level < 2; level++) {
      quad(level * count + i, level * count + j, (level + 1) * count + j, (level + 1) * count + i);
      quad((level + 3) * count + i, (level + 4) * count + i, (level + 4) * count + j, (level + 3) * count + j);
    }
    quad(2 * count + i, 2 * count + j, 5 * count + j, 5 * count + i);
    quad(i, 3 * count + i, 3 * count + j, j);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox();
  return geometry;
}

/** Trim the incompatible TV front instead of concealing it with another panel. */
export function clipCRTFront(source: THREE.BufferGeometry, cutoffZ: number) {
  const positions = source.getAttribute("position"), normals = source.getAttribute("normal"), uv = source.getAttribute("uv");
  const index = source.getIndex(), count = index?.count ?? positions.count;
  const output: number[] = [], outputNormals: number[] = [], outputUV: number[] = [];
  type Vertex = { p: THREE.Vector3; n: THREE.Vector3; uv: THREE.Vector2 };
  const vertex = (i: number): Vertex => ({ p: new THREE.Vector3().fromBufferAttribute(positions, i),
    n: normals ? new THREE.Vector3().fromBufferAttribute(normals, i) : new THREE.Vector3(0, 0, 1),
    uv: uv ? new THREE.Vector2().fromBufferAttribute(uv, i) : new THREE.Vector2() });
  for (let i = 0; i < count; i += 3) {
    const triangle = [0, 1, 2].map((j) => vertex(index ? index.getX(i + j) : i + j));
    const clipped: Vertex[] = [];
    triangle.forEach((a, j) => {
      const b = triangle[(j + 1) % 3], insideA = a.p.z <= cutoffZ, insideB = b.p.z <= cutoffZ;
      if (insideA) clipped.push(a);
      if (insideA !== insideB) {
        const t = (cutoffZ - a.p.z) / (b.p.z - a.p.z);
        clipped.push({ p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize(), uv: a.uv.clone().lerp(b.uv, t) });
      }
    });
    for (let j = 1; j + 1 < clipped.length; j++) for (const v of [clipped[0], clipped[j], clipped[j + 1]]) {
      output.push(v.p.x, v.p.y, v.p.z); outputNormals.push(v.n.x, v.n.y, v.n.z); outputUV.push(v.uv.x, v.uv.y);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(output, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(outputNormals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(outputUV, 2));
  geometry.computeBoundingBox();
  return geometry;
}
