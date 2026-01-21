/**
 * Surge Airports v1.5
 *   by @janlay
 *
 * Install
 *   1. Place this file along with the config file.
 *   2. Prepare the subscription URL and panel's title
 *   3. Add following code to your iOS/macOS config file:
 *
 * ---- config starts ----
 * [Panel]
 * Airport 1 = content="Refresh to load data.", script-name=airport1
 * Airport 2 = content="Refresh to load data.", script-name=foo
 * Airport 3 = content="Refresh to load data.", script-name=bar
 * Airport 4 = content="Refresh to load data.", script-name=airport-method-get
 *
 * [Script]
 * airport1 = script-path=https://raw.githubusercontent.com/janlay/surge-airports/master/airport-bar.js, type=generic, argument=https://example.com/subscribe/path
 * foo = script-path=https://raw.githubusercontent.com/janlay/surge-airports/master/airport-bar.js, type=generic, argument=https://example.com/subscribe/path;0
 * bar = script-path=https://raw.githubusercontent.com/janlay/surge-airports/master/airport-bar.js, type=generic, argument=https://example.com/subscribe/token?header=true;-1
 * airport-method-get = script-path=https://raw.githubusercontent.com/janlay/surge-airports/master/airport-bar.js, type=generic, argument=https://example.com/subscribe/token?header=true;;;get
 * ---- config ends ----
 *
 * `argument` in Section `Script`:
 *   format: url[;interval;period;method]
 *     - `url`: required. URL of the subscription.
 *     - `interval`: optional. Interval of reset time of the plan
 *     - `period`: optional. Period of reset time of the plan
 *     - `method`: optional. HTTP method, either "head" (default) or "get"
 *   defaults:
 *     - `interval`: `1`
 *     - `period`: `month`
 *     - `method`: `head`
 *   special intervals:
 *     `period` is not required for special intervals.
 *     - `0` for endless plan, no estimated traffic information
 *     - `-1` for plans resetting at the beginning of each month
 */

/******************
 * Configuration *
 ******************/
const CONFIG = {
  bar: {
    length: 16,
    blocks: {
      avail: "◼︎",
      used: "☑︎",
      estimated: "✪",
      blank: "◻︎",
    },
  },
  colors: {
    good: "#34C759",
    normal: "#007AFF",
    warning: "#FFD60A",
    error: "#FF3B30",
  },
  icons: {
    default: "airplane",
    departure: "airplane.departure",
    arrival: "airplane.arrival",
    error: "xmark.circle",
  },
  thresholds: {
    traffic: { warning: 100, good: 200 }, // in GB
    rate: { safe: 0.3 },
  },
  defaults: {
    period: "m",
    interval: 1,
  },
  units: {
    gb: 1024 * 1024 * 1024,
    bytes: ["B", "kB", "MB", "GB", "TB"],
  },
};

/******************
 * State Management *
 ******************/
const state = {
  title: $input.panelName,
  icon: CONFIG.icons.default,
  iconColor: CONFIG.colors.error,
  content: "",
  planPeriod: CONFIG.defaults.period,
  planInterval: CONFIG.defaults.interval,
  method: "head",
};

/******************
 * Core Functions *
 ******************/

/**
 * Main entry point
 */
function main(global) {
  const [url, interval, period, method] = parseArgument(global.$argument);
  state.planInterval = interval;
  state.planPeriod = period;
  state.method = method;

  fetchSubscription(url);
}

/**
 * Parse argument string into url, interval, period, and method
 */
function parseArgument(arg) {
  if (!arg) raiseError("Argument for subscription URL is not provided.");

  const parts = arg.split(";");
  const url = parts[0];
  if (!url) raiseError("Argument should start with a URL.");

  const interval = parseInt(parts[1]) ?? CONFIG.defaults.interval;
  const period = parts[2] ?? CONFIG.defaults.period;
  const method = parts[3] ?? "head";

  return [url, interval, period, method.toLowerCase()];
}

/**
 * Fetch subscription headers
 */
function fetchSubscription(url) {
  const headers = { "User-Agent": "Clash/1.8" };
  const method = state.method.toLowerCase() || "head";

  $httpClient[method]({ url, headers }, (error, response) => {
    try {
      if (error) throw error;
      handleHeaders(response.headers);
    } catch (err) {
      raiseError(err);
    }
  });
}

/**
 * Handle subscription headers
 */
function handleHeaders(headers) {
  if (!headers) raiseError("Invalid response headers");

  const value =
    headers["subscription-userinfo"] || headers["Subscription-Userinfo"];
  if (!value?.length) raiseError("Missing HTTP Header: subscription-userinfo");

  processSubscriptionInfo(value);
}

/**
 * Process subscription information and render output
 */
function processSubscriptionInfo(info) {
  if (!info) raiseError("Missing HTTP Header: subscription-userinfo");

  // Extract traffic data
  const traffic = extractTrafficData(info);

  // Validate expiration
  validateExpiration(info);

  // Calculate projections for time-limited plans
  const projection = calculateProjection(info, traffic);

  // Render output
  renderOutput(traffic, projection);
}

/**********************
 * Data Extraction *
 **********************/

/**
 * Extract traffic data from subscription info
 */
function extractTrafficData(info) {
  const uploaded = extractInfo(info, "upload");
  const downloaded = extractInfo(info, "download");
  const total = extractInfo(info, "total");

  if (!total || total <= 0) raiseError("Missing or invalid total field");

  return {
    uploaded,
    downloaded,
    total,
    used: uploaded + downloaded,
    avail: (total - uploaded - downloaded) / CONFIG.units.gb,
  };
}

/**
 * Extract field value from subscription info string
 */
function extractInfo(info, key) {
  const re = new RegExp(`(?<=\\b${key}=)\\d+`, "i");
  return re.test(info) ? parseInt(info.match(re)[0]) : 0;
}

/**********************
 * Validation *
 **********************/

/**
 * Validate subscription expiration
 */
function validateExpiration(info) {
  const exp = extractInfo(info, "expire") * 1000;
  const now = Date.now();

  if (exp > 0 && exp < now) raiseError("Subscription has expired.");

  return exp;
}

/**********************
 * Date Calculations *
 **********************/

/**
 * Calculate start and reset dates for the plan
 */
function calculatePlanDates(expireTimestamp, planInterval, planPeriod) {
  const now = new Date();

  // Special case: monthly reset
  if (planInterval < 0) {
    return calculateMonthlyResetDates(now);
  }

  // Calculate from expiration date
  return calculateDatesFromExpiration(
    now,
    expireTimestamp,
    planInterval,
    planPeriod,
  );
}

/**
 * Calculate dates for monthly reset plans
 */
function calculateMonthlyResetDates(now) {
  const started = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const reset = new Date(
    Date.UTC(started.getUTCFullYear(), started.getUTCMonth() + 1, 1),
  );

  return { started, reset };
}

/**
 * Calculate dates by backing up from expiration date
 */
function calculateDatesFromExpiration(
  now,
  expireTimestamp,
  planInterval,
  planPeriod,
) {
  const started = new Date(expireTimestamp);
  const isDaily = planPeriod[0].toLowerCase() === "d";

  // Roll back until start date is before or equal to now
  while (started > now) {
    if (isDaily) {
      started.setUTCDate(started.getUTCDate() - planInterval);
    } else {
      started.setUTCMonth(started.getUTCMonth() - planInterval);
    }
  }

  // Calculate reset date
  const reset = new Date(started.getTime());
  if (isDaily) {
    reset.setUTCDate(reset.getUTCDate() + planInterval);
  } else {
    reset.setUTCMonth(reset.getUTCMonth() + planInterval);
  }

  return { started, reset };
}

/**********************
 * Projection Calculation *
 **********************/

/**
 * Calculate traffic projection for time-limited plans
 */
function calculateProjection(info, traffic) {
  const exp = extractInfo(info, "expire") * 1000;

  // No projection if no expiry date or endless plan
  if (exp <= 0 || state.planInterval === 0) {
    return null;
  }

  const { started, reset } = calculatePlanDates(
    exp,
    state.planInterval,
    state.planPeriod,
  );
  const dateElapsed = (Date.now() - started) / (reset - started);

  return {
    estimated: traffic.used / dateElapsed,
    rate: (dateElapsed - traffic.used / traffic.total) / dateElapsed,
    isTimeLimited: true,
    started,
    reset,
  };
}

/**********************
 * Visual Calculations *
 **********************/

/**
 * Determine icon based on traffic status
 */
function determineIcon(traffic, projection) {
  if (!projection) return CONFIG.icons.default;

  if (state.iconColor === CONFIG.colors.good) {
    return traffic.total > projection.estimated
      ? CONFIG.icons.departure
      : CONFIG.icons.arrival;
  }

  return projection.rate < CONFIG.thresholds.rate.safe
    ? CONFIG.icons.arrival
    : CONFIG.icons.default;
}

/**
 * Determine icon color based on available traffic
 */
function determineIconColor(availGb) {
  if (availGb <= 0) return CONFIG.colors.error;
  if (availGb < CONFIG.thresholds.traffic.warning) return CONFIG.colors.warning;
  if (availGb > CONFIG.thresholds.traffic.good) return CONFIG.colors.good;
  return CONFIG.colors.normal;
}

/**
 * Build the visual bar array
 */
function buildBar(traffic, projection) {
  const { length, blocks } = CONFIG.bar;
  const maxValue = projection
    ? Math.max(traffic.total, projection.estimated)
    : traffic.total;
  const barArray = Array(length);

  if (projection?.isTimeLimited) {
    // Time-limited plan: show available + estimated
    barArray.fill(blocks.blank);
    barArray.fill(
      blocks.avail,
      0,
      Math.ceil((traffic.total / maxValue) * length),
    );

    const estIndex =
      Math.min(Math.ceil((projection.estimated / maxValue) * length), length) -
      1;
    barArray.fill(blocks.estimated, estIndex, estIndex + 1);
  } else {
    // Unlimited plan: all available
    barArray.fill(blocks.avail);
  }

  // Fill used portion
  barArray.fill(blocks.used, 0, Math.ceil((traffic.used / maxValue) * length));

  return barArray;
}

/**
 * Build the content string
 */
function buildContent(traffic, projection, barArray) {
  const { blocks } = CONFIG.bar;
  let content = "";

  if (projection?.isTimeLimited) {
    content += `${projection.started.toLocaleDateString()} - ${projection.reset.toLocaleDateString()}\n`;
  }

  content += `[ ${barArray.join("")} ]`;
  content += `\n${blocks.used} ${formatBytes(traffic.used)}`;

  if (projection?.isTimeLimited) {
    content += ` / ${blocks.estimated} ${formatBytes(projection.estimated)} est.`;
  }

  return content;
}

/**********************
 * Rendering *
 **********************/

/**
 * Render and output the panel
 */
function renderOutput(traffic, projection) {
  // Update title with total traffic
  state.title += ` (${formatBytes(traffic.total)})`;

  // Determine visual style
  state.iconColor = projection
    ? determineIconColor(traffic.avail)
    : CONFIG.colors.normal;
  state.icon = determineIcon(traffic, projection);

  // Build bar and content
  const barArray = buildBar(traffic, projection);
  state.content = buildContent(traffic, projection, barArray);

  // Output result
  $done({
    title: state.title,
    content: state.content,
    icon: state.icon,
    "icon-color": state.iconColor,
  });
}

/**********************
 * Utility Functions *
 **********************/

/**
 * Format bytes into human-readable string
 */
function formatBytes(size) {
  const i = Math.floor(Math.log(size) / Math.log(1024));
  return (
    (size / Math.pow(1024, i)).toFixed(2) * 1 + " " + CONFIG.units.bytes[i]
  );
}

/**
 * Format date string (utility function, currently unused)
 */
function formatDate(date) {
  date.setHours(date.getHours() + 8);
  return date.toISOString().replace("T", " ").replace(/\..+/, "");
}

/**
 * Debug: reveal object keys
 */
function revealObject(obj) {
  console.log(
    Object.entries(obj)
      .map((item) => item[0])
      .join(", "),
  );
}

/**
 * Raise and display error
 */
function raiseError(err) {
  const message = err.toString();
  const content = message.startsWith("ERROR: ") ? message : "ERROR: " + message;
  $done({
    title: state.title,
    content: content,
    icon: CONFIG.icons.error,
    "icon-color": CONFIG.colors.error,
  });
  throw err;
}

/**********************
 * Module Exports *
 **********************/
if (typeof module !== "undefined" && module.exports !== undefined) {
  // Node.js/CommonJS environment - export functions for testing
  module.exports = {
    processSubscriptionInfo,
    extractTrafficData,
    extractInfo,
    calculatePlanDates,
    calculateMonthlyResetDates,
    calculateDatesFromExpiration,
    calculateProjection,
    determineIconColor,
    determineIcon,
    buildBar,
    buildContent,
    formatBytes,
    CONFIG,
  };
} else {
  // Surge environment - auto-execute
  main(this);
}
