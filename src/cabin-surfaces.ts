// The four photographed-style swatches share a mipmapped atlas with an eight-pixel gutter.
// Project in local metres to keep the weave round on thin drawers and long bunk cushions.
import type { BufferGeometry } from "three";

export type Surface = "enamel" | "canvas" | "birch" | "leather";
const tiles = { enamel: [0, 1], canvas: [1, 1], birch: [0, 0], leather: [1, 0] };

export function mapSurface(geometry: BufferGeometry, surface: Surface) {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  const span = Math.max(0.38, max.x - min.x, max.y - min.y, max.z - min.z);
  const [column, row] = tiles[surface];
  const { position, normal, uv } = geometry.attributes;
  for (let i = 0; i < uv.count; i++) {
    const x = (position.getX(i) - min.x) / span;
    const y = (position.getY(i) - min.y) / span;
    const z = (position.getZ(i) - min.z) / span;
    const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
    const side = nx > ny && nx > nz;
    const u = side ? z : x;
    const v = !side && ny > nz ? z : y;
    uv.setXY(i, column * .5 + (8 + u * 496) / 1024, row * .5 + (8 + v * 496) / 1024);
  }
}
