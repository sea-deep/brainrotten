import { type Cage, type Vec3 } from './cage';
import type { Contact } from './solver';
export declare const STANDARD_GESTURE: {
    id: string;
    logicalPoint: Vec3;
    normal: Vec3;
    rampSeconds: number;
    holdSeconds: number;
    recoverySeconds: number;
    maximumIntensity: number;
    sustainStartSeconds: number;
    sustainRampSeconds: number;
};
export declare function standardLogicalPoint(cage: Cage): Vec3;
export declare function sustainedPressureAt(elapsedSeconds: number): number;
export declare function pressureAt(elapsedSeconds: number, drag?: number): number;
export declare function standardContact(cage: Cage, elapsedSeconds: number, holdSeconds?: number): Contact | null;
