export interface SquishySpec {
    version: 1;
    archetype: 'mochi';
    proportions: {
        width: number;
        height: number;
        depth: number;
    };
    color: string;
    finish: 'matte' | 'satin';
    softness: number;
    compressibility: number;
    recoverySeconds: number;
    damping: number;
}
export type SpecPatch = Partial<Omit<SquishySpec, 'version' | 'archetype' | 'proportions'>> & {
    proportions?: Partial<SquishySpec['proportions']>;
};
export interface ModelOutput {
    version: 1;
    status: 'ok' | 'unsupported';
    patch: SpecPatch;
    message?: string;
}
export interface SquishyRequest {
    version: 1;
    mode: 'create' | 'modify';
    prompt: string;
    current?: SquishySpec;
    turnstileToken?: string;
}
export interface SquishyResponse {
    version: 1;
    status: 'ok' | 'unsupported';
    spec: SquishySpec;
    patch: SpecPatch;
    message: string;
    corrections: string[];
    repaired: boolean;
    provider: 'mock' | 'workers-ai';
}
export declare const DEFAULT_SPEC: SquishySpec;
export declare const PRESETS: {
    name: string;
    description: string;
    spec: SquishySpec;
}[];
export declare class ValidationError extends Error {
}
export declare function record(value: unknown): Record<string, unknown>;
export declare function validatePatch(input: unknown, correct?: boolean): {
    patch: SpecPatch;
    corrections: string[];
};
export declare function validateSpec(input: unknown): SquishySpec;
export declare function applyPatch(base: SquishySpec, patch: SpecPatch): SquishySpec;
export declare function validateModelOutput(input: unknown): {
    output: ModelOutput;
    corrections: string[];
};
export declare function validateRequest(input: unknown): SquishyRequest;
export declare function compileSpec(raw: SquishySpec): {
    radii: [number, number, number];
    edgeCompliance: number;
    volumeCompliance: number;
    tetherCompliance: number;
    contactCompliance: number;
    dampingRate: number;
    memoryFraction: number;
    recoveryTau: number;
    creepTau: number;
    roughness: number;
};
