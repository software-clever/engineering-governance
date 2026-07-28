#!/usr/bin/env node
// Rule register validator.
//
// A register is an adopter's set of rule records: what they enforce, why, and
// by what mechanism. The register itself is layer 3 and lives in the adopter's
// own repository, so this engine holds only the shape and the checks and never
// depends on anyone's register existing.
//
// The record shape is defined below in executable form rather than as a
// separate JSON Schema file. This engine carries no runtime dependencies, so
// nothing would validate such a file, and a schema nothing enforces is
// decoration of the kind this project exists to reject. `FIELDS` is therefore
// the single source of truth for both validation and documentation.
//
// The check that matters, and the reason this file exists at all:
//
//   A rule may not claim `status: enforced` unless its `enforcement` names a
//   gate that actually exists.
//
// Without it a register degrades into the optimistic prose it replaces, which
// is worse than no register because the claim now looks audited.
//
// Usage: registry-check.mjs [--register <path>] [--gates <id,id,...>]

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverGateIds } from '../gates/registry.mjs';

// Field labels in a register are matched case-insensitively with punctuation
// folded, so "Superseded by" and "superseded-by" both reach `supersededBy`.
export const FIELDS = {
  statement: { required: true, describe: 'What the rule requires, in one sentence.' },
  rationale: { required: true, describe: 'Why it exists. The part that survives a rewrite.' },
  kind: { required: true, values: ['hard', 'soft'] },
  enforcement: { required: true, describe: 'A gate id, or "none".' },
  status: { required: true, values: ['prose', 'partial', 'enforced'] },
  precedence: { required: true, integer: true, describe: 'Higher wins when rules collide.' },
  scope: { required: true, describe: 'Where the rule applies.' },
  provenance: { required: true, values: ['stated', 'inferred', 'open'] },
  lifecycle: { required: true, values: ['active', 'superseded'] },
  supersededBy: { required: false, describe: 'The rule id that replaced this one.' },
};

const HEADING = /^###\s+([A-Z][A-Z0-9]*-\d+)\s*:\s*(.+?)\s*$/;
const FIELD = /^[-*]\s+([A-Za-z][A-Za-z \-_]*?)\s*:\s*(.*)$/;
const NO_GATE = 'none';

function fieldKey(label) {
  const folded = label.toLowerCase().replace(/[^a-z0-9]+/g, '');
  for (const key of Object.keys(FIELDS)) {
    if (key.toLowerCase() === folded) return key;
  }
  return null;
}

/**
 * Parse a register into records. Structure only; judgement is the caller's, so
 * that parsing and validating can be tested apart.
 */
export function parseRegister(text) {
  const rules = [];
  const problems = [];
  let current = null;

  text.split('\n').forEach((raw, i) => {
    const lineNo = i + 1;
    const heading = HEADING.exec(raw);
    if (heading) {
      current = { id: heading[1], title: heading[2], line: lineNo, fields: {} };
      rules.push(current);
      return;
    }
    // A malformed heading is reported rather than ignored: silently skipping it
    // would drop a whole rule from every check that follows.
    if (raw.startsWith('### ')) {
      problems.push({
        line: lineNo,
        message: 'heading is not "### <ID>: <title>" with an id like R-1',
      });
      return;
    }
    const field = FIELD.exec(raw);
    if (!field || !current) return;

    const key = fieldKey(field[1]);
    if (!key) return; // Prose bullets are allowed; only known labels are read.
    if (current.fields[key] !== undefined) {
      problems.push({ line: lineNo, id: current.id, message: `duplicate field "${key}"` });
      return;
    }
    current.fields[key] = field[2].trim();
  });

  return { rules, problems };
}

/**
 * Validate parsed records. `knownGates` is the set of gate ids that exist.
 * Returns problems; an empty array means the register is sound.
 */
export function validate(rules, knownGates = []) {
  const problems = [];
  const gates = new Set(knownGates);
  const ids = new Set();
  const say = (rule, message) => problems.push({ line: rule.line, id: rule.id, message });

  for (const rule of rules) {
    if (ids.has(rule.id)) say(rule, `duplicate rule id "${rule.id}"`);
    ids.add(rule.id);

    for (const [key, spec] of Object.entries(FIELDS)) {
      const value = rule.fields[key];
      if (value === undefined || value === '') {
        if (spec.required) say(rule, `missing required field "${key}"`);
        continue;
      }
      if (spec.values && !spec.values.includes(value)) {
        say(rule, `"${key}" is "${value}", expected one of ${spec.values.join(', ')}`);
      }
      if (spec.integer && !/^-?\d+$/.test(value)) {
        say(rule, `"${key}" is "${value}", expected an integer`);
      }
    }
  }

  // Cross-record checks run in a second pass so every id is known first.
  for (const rule of rules) {
    const { status, enforcement, lifecycle, supersededBy } = rule.fields;

    // The self-check. A claim of enforcement must name a mechanism that exists.
    // "partial" is held to the same standard as "enforced": it means the gate
    // is real but not yet everywhere, so a gate that does not exist makes it
    // just as false a claim.
    const claimsEnforcement = status === 'enforced' || status === 'partial';
    if (claimsEnforcement && enforcement === NO_GATE) {
      say(rule, `status "${status}" with enforcement "none": a claim with no mechanism`);
    }
    if (claimsEnforcement && enforcement && enforcement !== NO_GATE && !gates.has(enforcement)) {
      say(
        rule,
        `status "${status}" names gate "${enforcement}", which is not registered. ` +
          'Lower it to "prose" until the gate exists.',
      );
    }

    // Supersede, never delete. A superseded rule keeps pointing at its
    // replacement, so the history of a decision stays readable.
    if (lifecycle === 'superseded') {
      if (!supersededBy) {
        say(rule, 'lifecycle "superseded" without "supersededBy"');
      } else if (supersededBy === rule.id) {
        say(rule, 'supersededBy points at itself');
      } else if (!ids.has(supersededBy)) {
        say(rule, `supersededBy "${supersededBy}" is not a rule in this register`);
      }
    } else if (supersededBy) {
      say(rule, `lifecycle "${lifecycle}" but supersededBy is set`);
    }
  }

  return problems;
}

export function resolveRegisterPath(argv = [], env = {}) {
  const i = argv.indexOf('--register');
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  if (env.GOVERNANCE_REGISTER) return env.GOVERNANCE_REGISTER;
  // Relative to where it is run, not to this engine: the register belongs to
  // the caller's repository, never to this one.
  return resolve(process.cwd(), 'governance', 'rules.md');
}

function extraGates(argv) {
  const i = argv.indexOf('--gates');
  if (i === -1 || !argv[i + 1]) return [];
  return argv[i + 1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function main() {
  const argv = process.argv.slice(2);
  const registerPath = resolveRegisterPath(argv, process.env);

  if (!existsSync(registerPath)) {
    console.error('registry: no register found.');
    console.error(`  looked for: ${registerPath}`);
    console.error('');
    console.error('Point at it with --register <path> or $GOVERNANCE_REGISTER.');
    console.error('Start one from register.example.md.');
    process.exit(2);
  }

  const { rules, problems: parseProblems } = parseRegister(readFileSync(registerPath, 'utf8'));
  const knownGates = [...discoverGateIds(), ...extraGates(argv)];
  const problems = [...parseProblems, ...validate(rules, knownGates)];

  if (problems.length > 0) {
    console.error(`registry: ${problems.length} problem(s) in ${registerPath}`);
    for (const p of problems) {
      console.error(`  ${registerPath}:${p.line}${p.id ? ` [${p.id}]` : ''} ${p.message}`);
    }
    process.exit(1);
  }

  const enforced = rules.filter((r) => r.fields.status === 'enforced').length;
  const active = rules.filter((r) => r.fields.lifecycle === 'active').length;
  console.log(`registry: ${rules.length} rule(s), ${active} active, ${enforced} enforced.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
