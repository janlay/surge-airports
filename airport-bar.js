/**
 * Surge Airports v1.0
 *   by @janlay
 * 
 * Install
 *   1. Place this file along with the config file.
 *   2. Prepare the subscription URL and panel's title
 *   3. Add following code to your iOS config file:
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
 *   format: url[;interval;period]
 *     - `url`: required. URL of the subscription.
 *     - `interval`: optional. Interval of reset time of the plan
 *     - `period`: optional. Period of reset time of the plan
 *   defaults:
 *     - `interval`: `1`
 *     - `period`: `month`
 *   special intervals:
 *     `period` is not required for special intervals.
 *     - `0` for endless plan, no estimated traffic information
 *     - `-1` for plans resetting at the beginning of each month
 */

// options
const BAR_LENGTH = 16;
const BLOCK_AVAIL = '◼︎', BLOCK_USED = '☑︎', BLOCK_ESTIMATED = '✪', BLOCK_BLANK = '◻︎';
const GOOD_COLOR = '#34C759', NORMAL_COLOR = '#007AFF', WARNING_COLOR = '#FFD60A', ERROR_COLOR = '#FF3B30';
const DEFAULT_PLAN_PERIOD = 'm', DEFAULT_PLAN_INTERVAL = 1;

// private vars
let title = $input.panelName;
let icon = 'airplane';
let iconColor = ERROR_COLOR;
let content = '';
let planPeriod, planInterval;

(function (global) {
    // revealObject(global);
    // revealObject($script);

    !!global.$argument || raiseError('Error: Argument for subscription URL is not provided.');
    let url;
    [url, planInterval, planPeriod, method] = $argument.split(';');
    if (!url) raiseError('Error: Argument should start with a URL.');
    planPeriod = planPeriod || DEFAULT_PLAN_PERIOD;
    planInterval = parseInt(planInterval || DEFAULT_PLAN_INTERVAL);

    const headers = { 'User-Agent': 'Clash/1.8' };
    $httpClient[method || "head"]({ url, headers }, (error, response) => {
        try {
            // revealObject(this);
            if (error) throw error;

            handle(response.headers['subscription-userinfo'] || response.headers['Subscription-Userinfo']);
        } catch (err) {
            raiseError(err);
        }
    });
})(this);

function handle(info) {
    // parse response
    if (!info) throw 'Missing HTTP Header: subscription-userinfo';

    const uploaded = extractInfo(info, 'upload');
    const downloaded = extractInfo(info, 'download');
    const total = extractInfo(info, 'total');
    const totalUsed = uploaded + downloaded;
    const trafficUsed = totalUsed / total;
    const GB_FACTOR = 1024 * 1024 * 1024;
    const avail = (total - totalUsed) / GB_FACTOR;

    let trafficEst = 0, rateGap = 0;
    const now = new Date(), exp = extractInfo(info, 'expire') * 1000;
    if (exp > 0 && exp < now.getTime()) throw 'Subscription has expired.';

    const isTimeLimited = exp > 0 || planInterval == 0;
    if (isTimeLimited) {
        let started, reset;
        if (planInterval < 0) {
            started = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
            reset = new Date(started);
            reset.setMonth(reset.getUTCMonth() + 1);
        } else {
            started = new Date(exp);
            if (planPeriod[0].toLowerCase() == 'd') {
                while (started > now) started.setUTCDate(started.getUTCDate() - planInterval);
                reset = new Date(started.getTime());
                reset.setUTCDate(reset.getUTCDate() + planInterval);
            } else {
                while (started > now) started.setUTCMonth(started.getUTCMonth() - planInterval);
                reset = new Date(started.getTime());
                reset.setUTCMonth(reset.getUTCMonth() + planInterval);
            }
        }

        const dateElapsed = (now - started) / (reset - started);
        trafficRate = (dateElapsed - trafficUsed) / dateElapsed;
        trafficEst = totalUsed / dateElapsed;
        // content = `${started.toISOString()} - ${reset.toISOString()}\n${trafficRate.toFixed(2)}%, ${formatBytes(trafficEst)}\n`;
    }

    // render
    title += ` (${formatBytes(total)})`;
    if (avail <= 0)
        iconColor = ERROR_COLOR;
    else if (avail < 100)
        iconColor = WARNING_COLOR;
    else if (avail > 200)
        iconColor = GOOD_COLOR;
    else
        iconColor = NORMAL_COLOR;

    const maxValue = Math.max(total, trafficEst);
    const blocks = Array(BAR_LENGTH);
    if (isTimeLimited) {
        blocks.fill(BLOCK_BLANK)
            .fill(BLOCK_AVAIL, 0, Math.ceil(total / maxValue * BAR_LENGTH));
        const index = (trafficEst > total ? BAR_LENGTH : Math.ceil(trafficEst / maxValue * BAR_LENGTH)) - 1;
        blocks.fill(BLOCK_ESTIMATED, index, index + 1);

        if (iconColor == GOOD_COLOR)
            icon = total > trafficEst ? 'airplane.departure' : 'airplane.arrival';
        else
            icon = trafficRate < .3 ? 'airplane.arrival' : 'airplane';
    } else {
        blocks.fill(BLOCK_AVAIL);
        // always display as normal for a unlimited-time plan
        iconColor = NORMAL_COLOR;
    }
    blocks.fill(BLOCK_USED, 0, Math.ceil(totalUsed / maxValue * BAR_LENGTH));

    // output
    content += `[ ${blocks.join('')} ]`;
    content += `\n${BLOCK_USED} ${formatBytes(totalUsed)}`;
    if (isTimeLimited) content += ` / ${BLOCK_ESTIMATED} ${formatBytes(trafficEst)} est.`;

    $done({ title, content, icon, 'icon-color': iconColor });
};

/***** utils *****/
function revealObject(obj) {
    console.log(Object.entries(obj).map(item => item[0]).join(', '));
}

function extractInfo(info, key) {
    const re = new RegExp(`(?<=\\b${key}=)\\d+`, 'i');
    return re.test(info) ? parseInt(info.match(re)[0]) : 0;
}

function formatDate(date) {
    date.setHours(date.getHours() + 8);
    return date.toISOString().replace('T', ' ').replace(/\..+/, '');
}

// https://stackoverflow.com/a/20732091
function formatBytes(size) {
    const i = Math.floor(Math.log(size) / Math.log(1024));
    return (size / Math.pow(1024, i)).toFixed(2) * 1 + ' ' + ['B', 'kB', 'MB', 'GB', 'TB'][i];
};

function raiseError(err) {
    $done({ title, content: err.toString(), icon: 'xmark.circle', 'icon-color': ERROR_COLOR });
    // exits immediately
    throw err;
}
