// Copyright (c) 2026 Squishy Lab contributors. MIT License; see ../LICENSE.
// Vendored from Daniele-Cangi/squishy-lab, revision a909820e881f50305f1e624a51b4e038d4d0a4c2.
export const DEFAULT_SPEC = {
    version: 1, archetype: 'mochi', proportions: { width: 1.18, height: 0.88, depth: 1.08 },
    color: '#a996ee', finish: 'matte', softness: 0.84, compressibility: 0.78,
    recoverySeconds: 4.5, damping: 0.88,
};
export const PRESETS = [
    { name: 'Purple cloud', description: 'Foam · slow rise', spec: DEFAULT_SPEC },
    { name: 'Peach mochi', description: 'Foam · a little firmer', spec: { ...DEFAULT_SPEC, color: '#f6aa8b', softness: 0.48, recoverySeconds: 2.3 } },
    { name: 'Blue pop', description: 'Bouncy · quick return', spec: { ...DEFAULT_SPEC, color: '#77c8ea', softness: 0.65, compressibility: 0.2, recoverySeconds: 0.45, damping: 0.38, finish: 'satin' } },
];
const ranges = { softness: [0.1, 1], compressibility: [0.05, 0.95], recoverySeconds: [0.3, 12], damping: [0.2, 1] };
export class ValidationError extends Error {
}
export function record(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new ValidationError('Expected an object');
    return value;
}
function keys(value, allowed) {
    if (Object.keys(value).some(k => !allowed.includes(k)))
        throw new ValidationError('Unknown field');
}
function number(value, min, max, name, corrections, correct) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new ValidationError(`Invalid ${name}`);
    if (value < min || value > max) {
        // Only a 2% boundary overshoot is repairable, and always reported.
        if (!correct || value < min - (max - min) * 0.02 || value > max + (max - min) * 0.02)
            throw new ValidationError(`Out of range: ${name}`);
        corrections.push(`${name}: ${value} → ${Math.max(min, Math.min(max, value))}`);
    }
    return Math.max(min, Math.min(max, value));
}
export function validatePatch(input, correct = false) {
    const value = record(input), corrections = [];
    keys(value, ['proportions', 'color', 'finish', ...Object.keys(ranges)]);
    const patch = {};
    if (value.proportions !== undefined) {
        const p = record(value.proportions);
        keys(p, ['width', 'height', 'depth']);
        if (!Object.keys(p).length)
            throw new ValidationError('Empty proportions');
        patch.proportions = {};
        for (const axis of ['width', 'height', 'depth'])
            if (p[axis] !== undefined)
                patch.proportions[axis] = number(p[axis], 0.65, 1.6, axis, corrections, correct);
    }
    if (value.color !== undefined) {
        if (typeof value.color !== 'string' || !/^#[\da-f]{6}$/i.test(value.color))
            throw new ValidationError('Invalid color');
        patch.color = value.color.toLowerCase();
    }
    if (value.finish !== undefined) {
        if (value.finish !== 'matte' && value.finish !== 'satin')
            throw new ValidationError('Invalid finish');
        patch.finish = value.finish;
    }
    for (const name of Object.keys(ranges))
        if (value[name] !== undefined)
            patch[name] = number(value[name], ranges[name][0], ranges[name][1], name, corrections, correct);
    return { patch, corrections };
}
export function validateSpec(input) {
    const v = record(input);
    keys(v, ['version', 'archetype', 'proportions', 'color', 'finish', ...Object.keys(ranges)]);
    if (v.version !== 1 || v.archetype !== 'mochi')
        throw new ValidationError('Unsupported spec version/archetype');
    const { patch } = validatePatch(Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'version' && k !== 'archetype')));
    if (Object.keys(patch).length !== 7 || !patch.proportions || Object.keys(patch.proportions).length !== 3)
        throw new ValidationError('Incomplete spec');
    const spec = { ...v, ...patch };
    if (Math.max(...Object.values(spec.proportions)) / Math.min(...Object.values(spec.proportions)) > 2.4)
        throw new ValidationError('Aspect ratio exceeds safe domain');
    return spec;
}
export function applyPatch(base, patch) {
    return validateSpec({ ...base, ...patch, proportions: { ...base.proportions, ...patch.proportions } });
}
export function validateModelOutput(input) {
    const v = record(input);
    keys(v, ['version', 'status', 'patch', 'message']);
    if (v.version !== 1 || (v.status !== 'ok' && v.status !== 'unsupported'))
        throw new ValidationError('Invalid model status');
    if (v.message !== undefined && (typeof v.message !== 'string' || v.message.length > 200))
        throw new ValidationError('Invalid message');
    const result = validatePatch(v.patch, true);
    if (v.status === 'unsupported' && Object.keys(result.patch).length)
        throw new ValidationError('Unsupported request must not mutate spec');
    if (v.status === 'ok' && !Object.keys(result.patch).length)
        throw new ValidationError('No changes interpreted');
    return { output: { ...v, patch: result.patch }, corrections: result.corrections };
}
export function validateRequest(input) {
    const v = record(input);
    keys(v, ['version', 'mode', 'prompt', 'current', 'turnstileToken']);
    if (v.version !== 1 || (v.mode !== 'create' && v.mode !== 'modify') || typeof v.prompt !== 'string' || !v.prompt.trim() || v.prompt.length > 500)
        throw new ValidationError('Invalid request');
    if (v.mode === 'modify' && !v.current)
        throw new ValidationError('Current spec required');
    if (v.mode === 'create' && v.current !== undefined)
        throw new ValidationError('Create cannot carry a current spec');
    if (v.turnstileToken !== undefined && (typeof v.turnstileToken !== 'string' || v.turnstileToken.length > 2048))
        throw new ValidationError('Invalid verification token');
    return { version: 1, mode: v.mode, prompt: v.prompt.trim(), ...(v.current ? { current: validateSpec(v.current) } : {}), ...(v.turnstileToken ? { turnstileToken: v.turnstileToken } : {}) };
}
export function compileSpec(raw) {
    const spec = validateSpec(raw);
    const p = spec.proportions, normalize = Math.cbrt(p.width * p.height * p.depth);
    return {
        radii: [1.22 * p.width / normalize, 0.92 * p.height / normalize, 1.08 * p.depth / normalize],
        edgeCompliance: 0.000002 + spec.softness ** 2 * 0.00012,
        volumeCompliance: 0.0000002 + spec.compressibility ** 2 * 0.00004,
        tetherCompliance: 0.000003 + spec.softness ** 2 * 0.00045,
        contactCompliance: 0.000025 + (1 - spec.softness) ** 2 * 0.0012,
        dampingRate: 3 + spec.damping * 32,
        memoryFraction: Math.min(0.98, 0.35 + spec.recoverySeconds * 0.14),
        recoveryTau: spec.recoverySeconds / Math.log(10),
        creepTau: 0.6,
        roughness: spec.finish === 'matte' ? 0.83 : 0.48,
    };
}
