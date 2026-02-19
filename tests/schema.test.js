import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'public', 'data');

function readJson(filename) {
  return JSON.parse(readFileSync(join(dataDir, filename), 'utf-8'));
}

describe('vocabulary JSON schema', () => {
  it('schema.json is valid JSON', () => {
    const schema = readJson('schema.json');
    expect(schema.$defs.VocabularyEntry).toBeDefined();
    expect(schema.properties.schema_version).toBeDefined();
  });

  it('schema defines all required entry fields', () => {
    const schema = readJson('schema.json');
    const required = schema.$defs.VocabularyEntry.required;
    expect(required).toContain('id');
    expect(required).toContain('term');
    expect(required).toContain('source_language');
    expect(required).toContain('type');
    expect(required).toContain('translations');
    expect(required).toContain('difficulty');
    expect(required).toContain('metadata');
  });

  it('schema supports word and phrase types', () => {
    const schema = readJson('schema.json');
    const typeEnum = schema.$defs.VocabularyEntry.properties.type.enum;
    expect(typeEnum).toEqual(['word', 'phrase']);
  });

  it('schema supports trilingual translations', () => {
    const schema = readJson('schema.json');
    const translationProps = schema.$defs.VocabularyEntry.properties.translations.properties;
    expect(translationProps.en).toBeDefined();
    expect(translationProps.sr).toBeDefined();
    expect(translationProps.ru).toBeDefined();
  });

  it('difficulty range is 1-5', () => {
    const schema = readJson('schema.json');
    const diff = schema.$defs.VocabularyEntry.properties.difficulty;
    expect(diff.minimum).toBe(1);
    expect(diff.maximum).toBe(5);
  });
});
