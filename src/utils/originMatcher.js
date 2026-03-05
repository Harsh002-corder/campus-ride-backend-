const LAN_IPV4_ORIGIN_REGEX = /^http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i;

function normalizeHostname(hostname) {
  return String(hostname || "").trim().toLowerCase();
}

function isValidWildcardPattern(pattern) {
  if (!pattern.startsWith("*.")) {
    return false;
  }
  if (pattern.includes("://") || pattern.includes(":") || pattern.includes("/") || pattern.includes("*", 1)) {
    return false;
  }
  const baseDomain = pattern.slice(2);
  if (!baseDomain || !baseDomain.includes(".")) {
    return false;
  }
  return /^[a-z0-9.-]+$/i.test(baseDomain);
}

function matchesWildcardHost(hostname, pattern) {
  const normalizedHost = normalizeHostname(hostname);
  const baseDomain = normalizeHostname(pattern.slice(2));

  if (!normalizedHost || !baseDomain) {
    return false;
  }

  if (normalizedHost === baseDomain) {
    return false;
  }

  return normalizedHost.endsWith(`.${baseDomain}`);
}

function matchesPattern(origin, pattern) {
  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  if (!parsedOrigin.hostname) {
    return false;
  }

  if (!isValidWildcardPattern(pattern)) {
    return false;
  }

  return matchesWildcardHost(parsedOrigin.hostname, pattern);
}

export function parseOriginList(rawValue = "") {
  return String(rawValue)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isAllowedOrigin({
  origin,
  exactOrigins = [],
  wildcardHostPatterns = [],
  nodeEnv = "development",
  allowLanOrigins = false,
}) {
  if (!origin) {
    return true;
  }

  if (exactOrigins.includes(origin)) {
    return true;
  }

  if (wildcardHostPatterns.some((pattern) => matchesPattern(origin, pattern))) {
    return true;
  }

  if (nodeEnv !== "production" && allowLanOrigins && LAN_IPV4_ORIGIN_REGEX.test(origin)) {
    return true;
  }

  return false;
}