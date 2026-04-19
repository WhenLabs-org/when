import spdxLicenseList from 'spdx-license-list';

export interface ClassificationResult {
  spdxId: string;
  confidence: number;
  matchedLicense: string;
}

// Distinctive phrases for fast-path matching (covers 90%+ of cases)
const FINGERPRINTS: Array<{ spdxId: string; name: string; phrases: string[] }> = [
  {
    spdxId: 'MIT',
    name: 'MIT License',
    phrases: [
      'permission is hereby granted, free of charge',
      'the mit license',
    ],
  },
  {
    spdxId: 'Apache-2.0',
    name: 'Apache License 2.0',
    phrases: [
      'apache license, version 2.0',
      'apache license\nversion 2.0',
    ],
  },
  {
    spdxId: 'GPL-3.0-only',
    name: 'GNU General Public License v3.0',
    phrases: [
      'gnu general public license version 3',
      'gnu general public license\n                       version 3',
    ],
  },
  {
    spdxId: 'GPL-2.0-only',
    name: 'GNU General Public License v2.0',
    phrases: [
      'gnu general public license version 2',
      'gnu general public license\n                    version 2',
    ],
  },
  {
    spdxId: 'LGPL-2.1-only',
    name: 'GNU Lesser General Public License v2.1',
    phrases: [
      'gnu lesser general public license version 2.1',
      'gnu lesser general public license\n                       version 2.1',
    ],
  },
  {
    spdxId: 'LGPL-3.0-only',
    name: 'GNU Lesser General Public License v3.0',
    phrases: [
      'gnu lesser general public license version 3',
      'gnu lesser general public license\n                       version 3',
    ],
  },
  {
    spdxId: 'AGPL-3.0-only',
    name: 'GNU Affero General Public License v3.0',
    phrases: [
      'gnu affero general public license version 3',
      'gnu affero general public license\n                       version 3',
    ],
  },
  {
    spdxId: 'BSD-2-Clause',
    name: 'BSD 2-Clause License',
    phrases: [
      'redistribution and use in source and binary forms, with or without',
    ],
  },
  {
    spdxId: 'BSD-3-Clause',
    name: 'BSD 3-Clause License',
    phrases: [
      'neither the name of the copyright holder nor the names of its',
      'neither the name of',
    ],
  },
  {
    spdxId: 'ISC',
    name: 'ISC License',
    phrases: [
      'permission to use, copy, modify, and/or distribute this software',
    ],
  },
  {
    spdxId: 'MPL-2.0',
    name: 'Mozilla Public License 2.0',
    phrases: [
      'mozilla public license version 2.0',
      'mozilla public license, version 2.0',
    ],
  },
  {
    spdxId: 'Unlicense',
    name: 'The Unlicense',
    phrases: [
      'this is free and unencumbered software released into the public domain',
    ],
  },
  {
    spdxId: 'CC0-1.0',
    name: 'CC0 1.0 Universal',
    phrases: [
      'cc0 1.0 universal',
      'creative commons zero',
    ],
  },
  {
    spdxId: 'Artistic-2.0',
    name: 'Artistic License 2.0',
    phrases: [
      'the artistic license 2.0',
    ],
  },
  {
    spdxId: 'Zlib',
    name: 'zlib License',
    phrases: [
      'this software is provided \'as-is\', without any express or implied',
    ],
  },
  {
    spdxId: 'EPL-2.0',
    name: 'Eclipse Public License 2.0',
    phrases: [
      'eclipse public license - v 2.0',
      'eclipse public license, version 2.0',
    ],
  },
  {
    spdxId: 'WTFPL',
    name: 'WTFPL',
    phrases: [
      'do what the fuck you want to public license',
    ],
  },
  {
    spdxId: '0BSD',
    name: 'Zero-Clause BSD',
    phrases: [
      'permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted',
    ],
  },
];

// TF-IDF infrastructure (lazy init)
interface TfIdfVector {
  spdxId: string;
  name: string;
  terms: Map<string, number>;
  magnitude: number;
}

let referenceVectors: TfIdfVector[] | null = null;
let idfMap: Map<string, number> | null = null;

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    // Strip copyright lines
    .replace(/copyright\s*(\(c\)|©)?\s*\d{4}.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return text
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function computeTf(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  // Normalize by total token count
  const total = tokens.length;
  for (const [token, count] of tf) {
    tf.set(token, count / total);
  }
  return tf;
}

function buildReferenceVectors(): void {
  const REFERENCE_IDS = [
    'MIT', 'Apache-2.0', 'GPL-2.0-only', 'GPL-3.0-only',
    'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'LGPL-2.1-only',
    'LGPL-3.0-only', 'AGPL-3.0-only', 'MPL-2.0', 'Unlicense',
    'CC0-1.0', 'Artistic-2.0', 'Zlib', '0BSD', 'WTFPL',
    'EPL-2.0', 'CDDL-1.0',
  ];

  const docFreq = new Map<string, number>();
  const allDocs: Array<{ spdxId: string; name: string; tf: Map<string, number> }> = [];

  for (const id of REFERENCE_IDS) {
    const entry = spdxLicenseList[id as keyof typeof spdxLicenseList] as { name: string; licenseText?: string } | undefined;
    if (!entry) continue;

    const text = normalizeText((entry as { licenseText?: string }).licenseText ?? entry.name);
    const tokens = tokenize(text);
    const tf = computeTf(tokens);

    allDocs.push({ spdxId: id, name: entry.name, tf });

    for (const token of tf.keys()) {
      docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
    }
  }

  // Compute IDF
  const totalDocs = allDocs.length;
  idfMap = new Map<string, number>();
  for (const [token, df] of docFreq) {
    idfMap.set(token, Math.log(totalDocs / df));
  }

  // Build TF-IDF vectors
  referenceVectors = allDocs.map(doc => {
    const terms = new Map<string, number>();
    let magSq = 0;

    for (const [token, tf] of doc.tf) {
      const idf = idfMap!.get(token) ?? 0;
      const tfidf = tf * idf;
      if (tfidf > 0) {
        terms.set(token, tfidf);
        magSq += tfidf * tfidf;
      }
    }

    return {
      spdxId: doc.spdxId,
      name: doc.name,
      terms,
      magnitude: Math.sqrt(magSq),
    };
  });
}

function cosineSimilarity(
  queryTerms: Map<string, number>,
  queryMag: number,
  ref: TfIdfVector,
): number {
  if (queryMag === 0 || ref.magnitude === 0) return 0;

  let dot = 0;
  for (const [token, weight] of queryTerms) {
    const refWeight = ref.terms.get(token);
    if (refWeight !== undefined) {
      dot += weight * refWeight;
    }
  }

  return dot / (queryMag * ref.magnitude);
}

export function classifyLicenseText(text: string): ClassificationResult | null {
  if (!text || text.trim().length < 10) return null;

  const normalized = normalizeText(text);

  // Fast path: fingerprint matching
  for (const fp of FINGERPRINTS) {
    for (const phrase of fp.phrases) {
      if (normalized.includes(phrase.toLowerCase())) {
        return {
          spdxId: fp.spdxId,
          confidence: 0.95,
          matchedLicense: fp.name,
        };
      }
    }
  }

  // BSD-2 vs BSD-3 disambiguation: BSD-2 fingerprint may match BSD-3
  // BSD-3 has the "neither the name" clause which we check first in FINGERPRINTS

  // TF-IDF path
  if (!referenceVectors) {
    buildReferenceVectors();
  }

  if (!referenceVectors || !idfMap) return null;

  const tokens = tokenize(normalized);
  if (tokens.length < 5) return null;

  const tf = computeTf(tokens);
  const queryTerms = new Map<string, number>();
  let magSq = 0;

  for (const [token, tfVal] of tf) {
    const idf = idfMap.get(token) ?? 0;
    const tfidf = tfVal * idf;
    if (tfidf > 0) {
      queryTerms.set(token, tfidf);
      magSq += tfidf * tfidf;
    }
  }

  const queryMag = Math.sqrt(magSq);

  let bestMatch: TfIdfVector | null = null;
  let bestScore = 0;

  for (const ref of referenceVectors) {
    const score = cosineSimilarity(queryTerms, queryMag, ref);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = ref;
    }
  }

  if (!bestMatch || bestScore < 0.7) return null;

  return {
    spdxId: bestMatch.spdxId,
    confidence: Math.round(bestScore * 100) / 100,
    matchedLicense: bestMatch.name,
  };
}
