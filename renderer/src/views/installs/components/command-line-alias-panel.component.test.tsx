import { describe, expect, it } from 'vitest';
import { suggestAlias } from './command-line-alias-panel.component';

describe('manual alias suggestions', () => {
    it.each([
        ['4.8-beta1', 'godot48b1'],
        ['4.8-beta2', 'godot48b2'],
        ['4.8.0-beta1', 'godot48b1'],
        ['4.8-beta.2', 'godot48b2'],
        ['4.8-dev1', 'godot48d1'],
        ['4.8-dev2', 'godot48d2'],
        ['4.8-alpha1', 'godot48a1'],
        ['4.8-rc1', 'godot48rc1'],
        ['4.8-rc2', 'godot48rc2'],
        ['4.7.2-rc1', 'godot472rc1'],
        ['4.8-stable', 'godot48'],
        ['4.8.0-stable', 'godot48'],
        ['4.7.2-stable', 'godot472'],
        ['4.8.0-custom.1', 'godot48'],
        ['studio-build', 'godot-custom'],
    ])('suggests %s as %s', (version, expected) => {
        expect(suggestAlias(version, false)).toBe(expected);
        expect(suggestAlias(version, true)).toBe(`${expected}-dotnet`);
    });
});
