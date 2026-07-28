// Helpers shared by gates. Not a gate itself: no `.gate.mjs` suffix, so the
// registry does not discover it and no rule can name it as an enforcement
// mechanism.
//
// These exist so the gates cannot drift apart on the things an adopter has to
// reason about across all of them: how scope is expressed, and how a violation
// is reported.

/**
 * Scope: which paths a gate applies to. Expressed as regular expressions
 * rather than globs, because globs would need a dependency and their
 * semantics vary between tools; a regex means exactly one thing.
 *
 * Omitting `include` means every path, which is the only sane default for a
 * gate whose config is already entirely the adopter's choice.
 */
export function compileScope({ include, exclude } = {}) {
  const compile = (list, label) => {
    if (list === undefined) return null;
    if (!Array.isArray(list)) throw new TypeError(`${label} must be an array of regex strings`);
    return list.map((p) => {
      try {
        return new RegExp(p);
      } catch (cause) {
        throw new TypeError(`${label} contains an invalid regex: ${p}`, { cause });
      }
    });
  };
  return { include: compile(include, 'include'), exclude: compile(exclude, 'exclude') };
}

export function inScope(path, scope) {
  if (!path) return true;
  if (scope.exclude?.some((re) => re.test(path))) return false;
  if (scope.include && !scope.include.some((re) => re.test(path))) return false;
  return true;
}

/**
 * Build a violation. `message` must describe the finding WITHOUT quoting the
 * offending text: violations reach CI logs and pull request comments, and
 * echoing banned content there republishes the thing being kept out.
 */
export function violation(gateId, message, { path, line } = {}) {
  return { gateId, message, ...(path ? { path } : {}), ...(line ? { line } : {}) };
}

/** Split text into lines once, so every text gate numbers lines identically. */
export function lines(text) {
  return String(text ?? '').split('\n');
}

/**
 * Reject config keys a gate does not understand. A silently ignored key is a
 * rule the adopter believes is enforced and is not, which is the failure this
 * whole engine exists to prevent, reproduced one level down.
 */
export function rejectUnknownKeys(params, allowed, gateId) {
  const unknown = Object.keys(params).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    throw new TypeError(
      `${gateId}: unknown config key(s) ${unknown.join(', ')}. ` +
        `Known keys: ${allowed.join(', ')}.`,
    );
  }
}
