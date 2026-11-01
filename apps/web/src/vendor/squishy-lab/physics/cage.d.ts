import { type SquishySpec } from '../shared/spec';
import type { ShapeId } from '../collection';
export type Vec3 = [number, number, number];
export interface Cage {
    rest: Float64Array;
    logical: Float64Array;
    inverseMass: Float64Array;
    tets: Uint16Array;
    volumes: Float64Array;
    edges: Uint16Array;
    lengths: Float64Array;
    cells: number;
    radii: Vec3;
    shape: ShapeId;
    ringSegments?: number;
}
export declare function roundedPoint(x: number, y: number, z: number, r: Vec3): Vec3;
export declare const CHEESE_POCKETS: {
    axis: number;
    u: number;
    v: number;
    radius: number;
    depth: number;
}[];
export declare function shellRelief(x: number, angle: number): number;
export declare function shapeTint(shape: ShapeId, q: Vec3): Vec3;
export declare function axialCoordinate(shape: ShapeId, q: Vec3): number;
export declare function shapePoint(x: number, y: number, z: number, r: Vec3, shape?: ShapeId): Vec3;
export declare function signedVolume(p: ArrayLike<number>, a: number, b: number, c: number, d: number): number;
export declare const permutations: number[][];
export declare function generateCage(spec: SquishySpec, cells?: number, shape?: ShapeId): Cage;
export interface SurfaceEmbedding {
    faceGrids: {
        axis: number;
        sign: number;
        grid: number[];
    }[];
    subdivisions: number;
    rest: Float32Array;
    logical: Float32Array;
    indices: Uint16Array;
    nodes: Uint16Array;
    weights: Float64Array;
    neighborOffsets: Uint32Array;
    neighbors: Uint16Array;
    deformationOffsets: Uint32Array;
    deformationNodes: Uint16Array;
    deformationWeights: Float64Array;
}
export declare function createSurface(cage: Cage, subdivisions?: number): SurfaceEmbedding;
export declare function embedSurface(cage: Cage, positions: Float64Array, surface: SurfaceEmbedding, out: Float32Array): void;
export declare function sampledSurfaceDepth(cage: Cage, positions: Float64Array, surface: SurfaceEmbedding, point: MaterialPoint, normal: Vec3): number;
export interface MaterialPoint {
    nodes: number[];
    weights: number[];
}
export declare function facePoint(surface: SurfaceEmbedding, axis: number, sign: number, u: number, v: number): MaterialPoint;
export declare function cagePoint(cage: Cage, q: Vec3): MaterialPoint;
export declare function surfacePoint(surface: SurfaceEmbedding, q: Vec3): MaterialPoint;
export declare function samplePoint(positions: ArrayLike<number>, point: MaterialPoint): Vec3;
export declare function pointDepth(rest: ArrayLike<number>, positions: ArrayLike<number>, point: MaterialPoint, normal: Vec3): number;
