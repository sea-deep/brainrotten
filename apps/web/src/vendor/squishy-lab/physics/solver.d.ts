import { type SquishySpec } from '../shared/spec';
import { type Vec3 } from './cage';
import type { ShapeId } from '../collection';
export interface Contact {
    point: Vec3;
    normal: Vec3;
    intensity: number;
    sustain?: number;
}
export declare const FIXED_DT: number;
export declare class SoftBody {
    spec: SquishySpec;
    readonly cage: import("./cage").Cage;
    readonly positions: Float64Array;
    readonly velocity: Float64Array;
    readonly memory: Float64Array;
    private previous;
    private previousMemory;
    private targets;
    private edgeTargets;
    private volumeTargets;
    private edgeLambda;
    private volumeLambda;
    private gradient;
    private influence;
    private config;
    contact: Contact | null;
    time: number;
    safetyBackoffs: number;
    constructor(spec: SquishySpec, shape?: ShapeId);
    setMaterial(spec: SquishySpec): void;
    reset(): void;
    setContact(contact: Contact | null): void;
    step(h?: number): void;
    private solveEdges;
    private solveVolumes;
    maxDisplacement(): number;
    minVolumeRatio(): number;
}
export declare class FixedClock {
    accumulator: number;
    droppedSeconds: number;
    advance(elapsed: number, step: () => void): number;
    pause(): void;
}
