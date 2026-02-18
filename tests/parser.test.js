import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'public', 'data');

function readVocab(filename) {
  return JSON.parse(readFileSync(join(dataDir, filename), 'utf-8'));
}

describe('parsed vocabulary-en.json', () => {
  const data = readVocab('vocabulary-en.json');

  it('has schema_version 1.0', () => {
    expect(data.schema_version).toBe('1.0');
  });

  it('has more than 1000 entries', () => {
    expect(data.entries.length).toBeGreaterThan(1000);
  });

  it('all entries have required fields', () => {
    for (const entry of data.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.term).toBeTruthy();
      expect(entry.source_language).toBe('en');
      expect(['word', 'phrase']).toContain(entry.type);
      expect(entry.translations).toBeDefined();
      expect(entry.difficulty).toBeGreaterThanOrEqual(1);
      expect(entry.difficulty).toBeLessThanOrEqual(5);
      expect(entry.metadata).toBeDefined();
    }
  });

  it('has no ???? noise entries', () => {
    const noise = data.entries.filter((e) => e.term.includes('????'));
    expect(noise.length).toBe(0);
  });

  it('does not self-reference term as own translation', () => {
    const selfRef = data.entries.filter((e) => e.translations.en === e.term);
    expect(selfRef.length).toBe(0);
  });

  it('extracts Russian translations from dash-separated lines', () => {
    const humble = data.entries.find((e) => e.term.toLowerCase() === 'humble');
    expect(humble).toBeDefined();
    expect(humble.translations.ru).toBe('скромный');
  });

  it('extracts pronunciation from bracket notation', () => {
    const withPron = data.entries.filter((e) => e.pronunciation !== null);
    expect(withPron.length).toBeGreaterThan(5);
  });

  it('classifies single words and phrases correctly', () => {
    const words = data.entries.filter((e) => e.type === 'word');
    const phrases = data.entries.filter((e) => e.type === 'phrase');
    expect(words.length).toBeGreaterThan(100);
    expect(phrases.length).toBeGreaterThan(100);
  });

  it('has unique ids', () => {
    const ids = data.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('parsed vocabulary-sr.json', () => {
  const data = readVocab('vocabulary-sr.json');

  it('has more than 400 entries', () => {
    expect(data.entries.length).toBeGreaterThan(400);
  });

  it('all entries have source_language sr', () => {
    for (const entry of data.entries) {
      expect(entry.source_language).toBe('sr');
    }
  });

  it('has entries with English translations', () => {
    const withEn = data.entries.filter((e) => e.translations.en !== null);
    expect(withEn.length).toBeGreaterThan(10);
  });

  it('has unique ids', () => {
    const ids = data.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
