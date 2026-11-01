export declare const SHAPE_IDS: readonly ['mochi', 'butter', 'strawberry', 'cube', 'chocolate', 'banana', 'cat', 'cheese', 'peanut', 'drop', 'gumdrop', 'paw', 'capybara', 'donut', 'dumpling'];
export type ShapeId = typeof SHAPE_IDS[number];
export type SurfaceEffect = 'foam' | 'glitter' | 'clear';
export declare const FACE_EXPRESSIONS: readonly ['smile', 'happy', 'sleepy', 'wink', 'surprised'];
export type FaceExpression = typeof FACE_EXPRESSIONS[number];
export interface Appearance {
    shape: ShapeId;
    label: 'none' | 'butter' | 'strawberry';
    face: boolean;
    effect: SurfaceEffect;
    expression?: FaceExpression;
    text?: string;
    textColor?: string;
    font?: 'Chewy' | 'Baloo 2' | 'Pacifico' | 'Short Stack';
}
export declare const DEFAULT_APPEARANCE: Appearance;
export declare const COLLECTION: {
    id: string;
    name: string;
    note: string;
    color: string;
    appearance: Appearance;
}[];
export declare function validateAppearance(value: unknown): Appearance;
export declare function collectionName(appearance: Appearance): string;
