import { createHash } from 'node:crypto';

export const RESPONSE_EXPECTATION_ENGINE_ID = 'RESPONSE-EXPECTATION-ENGINE-001';

export class ResponseExpectationEngineError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'ResponseExpectationEngineError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new ResponseExpectationEngineError(code, message, details);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail('EXPECTATION_SCHEMA_INVALID', `${label} must be non-empty text`);
  }
  return value;
}

function requiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('EXPECTATION_SCHEMA_INVALID', `${label} must be an object`);
  }
  return value;
}

function uniqueTextArray(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail('EXPECTATION_SCHEMA_INVALID', `${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array`);
  }
  const result = value.map((entry, index) => requiredText(entry, `${label}[${index}]`));
  if (new Set(result).size !== result.length) {
    fail('EXPECTATION_SCHEMA_INVALID', `${label} must not contain duplicates`);
  }
  return result;
}

function normalizePolicy(policy) {
  requiredObject(policy, 'policy');
  const classes = requiredObject(policy.classes, 'policy.classes');
  const classNames = Object.keys(classes);
  if (classNames.length === 0) fail('EXPECTATION_SCHEMA_INVALID', 'policy.classes must not be empty');

  const normalizedClasses = {};
  for (const className of classNames) {
    requiredText(className, 'response class');
    const definition = requiredObject(classes[className], `policy.classes.${className}`);
    const requiredHeadings = uniqueTextArray(definition.required_headings, `policy.classes.${className}.required_headings`);
    const forbiddenHeadings = uniqueTextArray(definition.forbidden_headings ?? [], `policy.classes.${className}.forbidden_headings`, { allowEmpty: true });
    const requiredLabelsByHeading = definition.required_labels_by_heading ?? {};
    requiredObject(requiredLabelsByHeading, `policy.classes.${className}.required_labels_by_heading`);
    const normalizedLabels = {};
    for (const [heading, labels] of Object.entries(requiredLabelsByHeading)) {
      if (!requiredHeadings.includes(heading)) {
        fail('EXPECTATION_SCHEMA_INVALID', `${className} label section ${heading} must be a required heading`);
      }
      normalizedLabels[heading] = uniqueTextArray(labels, `policy.classes.${className}.required_labels_by_heading.${heading}`);
    }
    normalizedClasses[className] = {
      required_headings: requiredHeadings,
      forbidden_headings: forbiddenHeadings,
      required_labels_by_heading: normalizedLabels
    };
  }

  const firstLineAllowlistByHeading = policy.first_line_allowlist_by_heading ?? {};
  requiredObject(firstLineAllowlistByHeading, 'policy.first_line_allowlist_by_heading');
  const normalizedAllowlists = {};
  for (const [heading, values] of Object.entries(firstLineAllowlistByHeading)) {
    const presentInAllClasses = classNames.every((className) => normalizedClasses[className].required_headings.includes(heading));
    if (!presentInAllClasses) {
      fail('EXPECTATION_SCHEMA_INVALID', `allowlisted first-line heading ${heading} must be required by every class`);
    }
    normalizedAllowlists[heading] = uniqueTextArray(values, `policy.first_line_allowlist_by_heading.${heading}`);
  }

  return Object.freeze({
    classes: Object.freeze(normalizedClasses),
    first_line_allowlist_by_heading: Object.freeze(normalizedAllowlists)
  });
}

function headingLines(responseText) {
  return responseText.split(/\r?\n/).filter((line) => /^## [^#].*$/.test(line));
}

function sectionContent(responseText, heading, nextHeading) {
  const start = responseText.indexOf(heading);
  if (start < 0) return null;
  const from = start + heading.length;
  const end = nextHeading ? responseText.indexOf(nextHeading, from) : responseText.length;
  return responseText.slice(from, end < 0 ? responseText.length : end).trim();
}

function validateHeadings(responseText, responseClass, definition) {
  const lines = headingLines(responseText);
  let cursor = -1;
  for (const heading of definition.required_headings) {
    const occurrences = lines.filter((line) => line === heading).length;
    if (occurrences !== 1) {
      fail('EXPECTATION_REQUIRED_HEADING_INVALID', `${heading} must occur exactly once`, { response_class: responseClass, occurrences });
    }
    const index = lines.indexOf(heading);
    if (index <= cursor) {
      fail('EXPECTATION_HEADING_ORDER_INVALID', `${heading} is out of order`, { response_class: responseClass });
    }
    cursor = index;
  }

  for (const heading of lines) {
    if (definition.forbidden_headings.includes(heading)) {
      fail('EXPECTATION_FORBIDDEN_HEADING', `${responseClass} cannot contain forbidden heading ${heading}`, { response_class: responseClass, heading });
    }
  }

  for (let index = 0; index < definition.required_headings.length; index += 1) {
    const heading = definition.required_headings[index];
    const nextHeading = definition.required_headings[index + 1] ?? null;
    if (!sectionContent(responseText, heading, nextHeading)) {
      fail('EXPECTATION_SECTION_EMPTY', `${heading} must contain content`, { response_class: responseClass, heading });
    }
  }
  return lines;
}

function validateFirstLines(responseText, definition, allowlists) {
  for (const [heading, allowedValues] of Object.entries(allowlists)) {
    const index = definition.required_headings.indexOf(heading);
    const nextHeading = definition.required_headings[index + 1] ?? null;
    const body = sectionContent(responseText, heading, nextHeading) ?? '';
    const firstLine = body.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
    if (!allowedValues.includes(firstLine)) {
      fail('EXPECTATION_FIRST_LINE_INVALID', `${heading} must begin with an allowed value`, { heading, observed: firstLine });
    }
  }
}

function validateRequiredLabels(responseText, definition) {
  for (const [heading, labels] of Object.entries(definition.required_labels_by_heading)) {
    const index = definition.required_headings.indexOf(heading);
    const nextHeading = definition.required_headings[index + 1] ?? null;
    const body = sectionContent(responseText, heading, nextHeading) ?? '';
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(`(^|\\n)${escaped}:\\s*\\S`, 'm').test(body)) {
        fail('EXPECTATION_REQUIRED_LABEL_MISSING', `${heading} requires ${label}:`, { heading, label });
      }
    }
  }
}

export function responseExpectationPolicyDigest(policy) {
  return digest(normalizePolicy(policy));
}

export function evaluateResponseExpectations({ responseText, responseClass, policy }) {
  requiredText(responseText, 'responseText');
  const normalizedPolicy = normalizePolicy(policy);
  const definition = normalizedPolicy.classes[responseClass];
  if (!definition) {
    fail('EXPECTATION_CLASS_INVALID', `responseClass must be one of: ${Object.keys(normalizedPolicy.classes).join(', ')}`);
  }

  const observedHeadings = validateHeadings(responseText, responseClass, definition);
  validateFirstLines(responseText, definition, normalizedPolicy.first_line_allowlist_by_heading);
  validateRequiredLabels(responseText, definition);

  return Object.freeze({
    status: 'PASS',
    engine_id: RESPONSE_EXPECTATION_ENGINE_ID,
    response_class: responseClass,
    policy_digest: digest(normalizedPolicy),
    observed_headings: Object.freeze([...observedHeadings])
  });
}

export function assertResponseExpectations(input) {
  evaluateResponseExpectations(input);
  return true;
}
