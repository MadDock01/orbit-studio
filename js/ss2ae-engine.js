/* CompX Orbit Studio — Screenshot -> Motion : layout detection engine
 *
 * Adapted from the Flex GUI Pro ss2ae_engine (v1.8.0) that the user owns and
 * asked to bring into CompX. Splits a flat UI screenshot into individual
 * elements. No AI service, no API key, no network — classic layout analysis
 * running on the pixels.
 *
 * The whole design turns on one distinction:
 *
 *   siblings are found against the PARENT's background,
 *   children are found against the ELEMENT's own background.
 *
 * Collapsing those two into "the region's own border colour" is what breaks a
 * naive implementation: trim a region down to a solid blue button and its
 * border ring IS blue, so the button becomes its own background, its ink count
 * drops to zero, and it vanishes. Hence:
 *
 *   1. flood-fill the background inward from the region border. Anything the
 *      fill cannot reach is an element — this catches a white card on a
 *      #f5f6f8 page, 7 units of contrast, which thresholding never would.
 *   2. connected components of that ink = the sibling elements.
 *   3. merge components that read as one line of type, so words and letters do
 *      not shatter into separate layers.
 *   4. recurse INTO each element using its own interior background to find its
 *      children; the container is emitted too, so a card and its contents both
 *      become layers.
 *
 * Pure function of the pixels: identical in the panel and in Node, which is how
 * it gets scored against ground truth.
 */
(function (factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.CompXSS2AE = api;
}(function () {
    'use strict';

    /* ── pixel helpers ───────────────────────────────────────────────────── */

    function colorDist(data, i, c) {
        var dr = data[i] - c[0], dg = data[i + 1] - c[1], db = data[i + 2] - c[2];
        if (dr < 0) dr = -dr;
        if (dg < 0) dg = -dg;
        if (db < 0) db = -db;
        return (dr * 3 + dg * 4 + db * 2) >> 3;      /* green-weighted Manhattan */
    }

    function modeColor(samples) {
        var counts = {}, best = -1, bestN = 0, key, i;
        for (i = 0; i < samples.length; i += 3) {
            key = ((samples[i] >> 4) << 8) | ((samples[i + 1] >> 4) << 4) | (samples[i + 2] >> 4);
            counts[key] = (counts[key] || 0) + 1;
            if (counts[key] > bestN) { bestN = counts[key]; best = key; }
        }
        var r = 0, g = 0, b = 0, n = 0;
        for (i = 0; i < samples.length; i += 3) {
            key = ((samples[i] >> 4) << 8) | ((samples[i + 1] >> 4) << 4) | (samples[i + 2] >> 4);
            if (key === best) { r += samples[i]; g += samples[i + 1]; b += samples[i + 2]; n++; }
        }
        return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [255, 255, 255];
    }

    /* Colour dominating a region's border ring. Valid as a background only for
       a container we are looking INSIDE of — never for locating that container
       among its siblings. */
    function ringBackground(img, reg) {
        var data = img.data, W = img.width, samples = [], x, y, i;
        var ring = Math.max(1, Math.min(3, Math.floor(Math.min(reg.w, reg.h) / 8)));
        for (y = reg.y; y < reg.y + reg.h; y++) {
            var edgeRow = (y < reg.y + ring) || (y >= reg.y + reg.h - ring);
            for (x = reg.x; x < reg.x + reg.w; x++) {
                if (!edgeRow && x >= reg.x + ring && x < reg.x + reg.w - ring) { x = reg.x + reg.w - ring - 1; continue; }
                i = (y * W + x) << 2;
                samples.push(data[i], data[i + 1], data[i + 2]);
            }
        }
        return modeColor(samples);
    }

    /* Colour dominating the inside of a region — the card's own fill. */
    function innerBackground(img, reg) {
        var data = img.data, W = img.width, samples = [], x, y, i;
        var stepX = Math.max(1, Math.floor(reg.w / 40)), stepY = Math.max(1, Math.floor(reg.h / 40));
        for (y = reg.y; y < reg.y + reg.h; y += stepY) {
            for (x = reg.x; x < reg.x + reg.w; x += stepX) {
                i = (y * W + x) << 2;
                samples.push(data[i], data[i + 1], data[i + 2]);
            }
        }
        return modeColor(samples);
    }

    /* ── background model ────────────────────────────────────────────────── */

    /* Solve a small normal-equation system by Gaussian elimination. */
    function solve(A, b, n) {
        var i, j, k, piv, t, x = new Float64Array(n);
        for (i = 0; i < n; i++) {
            piv = i;
            for (j = i + 1; j < n; j++) if (Math.abs(A[j * n + i]) > Math.abs(A[piv * n + i])) piv = j;
            if (Math.abs(A[piv * n + i]) < 1e-9) return null;
            if (piv !== i) {
                for (k = 0; k < n; k++) { t = A[i * n + k]; A[i * n + k] = A[piv * n + k]; A[piv * n + k] = t; }
                t = b[i]; b[i] = b[piv]; b[piv] = t;
            }
            for (j = i + 1; j < n; j++) {
                var f = A[j * n + i] / A[i * n + i];
                if (!f) continue;
                for (k = i; k < n; k++) A[j * n + k] -= f * A[i * n + k];
                b[j] -= f * b[i];
            }
        }
        for (i = n - 1; i >= 0; i--) {
            t = b[i];
            for (k = i + 1; k < n; k++) t -= A[i * n + k] * x[k];
            x[i] = t / A[i * n + i];
        }
        return x;
    }

    /* Fit a quadratic surface per channel to the region's background.
     *
     * This replaces "compare every pixel to one colour", which cannot survive a
     * gradient hero — the gradient drifts hundreds of units across the page, the
     * fill dies at the first pixel and the whole page returns as one blob.
     *
     * It deliberately does NOT do the other obvious thing either: letting the
     * fill hop between pixels that barely differ. Anti-aliasing turns every real
     * edge into a ramp of small steps, so on a true screenshot that walks
     * straight through elements and marks the entire page as background —
     * detecting nothing at all.
     *
     * A fitted surface has no such failure mode: there is no hop rule to exploit,
     * a flat page fits a constant (identical to the original behaviour) and a
     * gradient fits its slope. The fit is made robust by refitting on inliers, so
     * elements sitting on the background do not drag the surface toward them.
     */
    var BASIS = 6;

    function fitBackground(img, reg) {
        var data = img.data, W = img.width, w = reg.w, h = reg.h;
        var stepX = Math.max(1, Math.floor(w / 90)), stepY = Math.max(1, Math.floor(h / 90));
        var xs = [], ys = [], rs = [], gs = [], bs = [], x, y, i;

        for (y = 0; y < h; y += stepY) {
            for (x = 0; x < w; x += stepX) {
                i = ((reg.y + y) * W + (reg.x + x)) << 2;
                xs.push(w > 1 ? (x / (w - 1)) * 2 - 1 : 0);
                ys.push(h > 1 ? (y / (h - 1)) * 2 - 1 : 0);
                rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
            }
        }

        var n = xs.length;
        if (!n) return null;
        var keep = new Uint8Array(n);
        for (i = 0; i < n; i++) keep[i] = 1;

        var coef = null, round, ch;
        var channels = [rs, gs, bs];

        for (round = 0; round < 3; round++) {
            var out = [];
            for (ch = 0; ch < 3; ch++) {
                var A = new Float64Array(BASIS * BASIS), bv = new Float64Array(BASIS);
                for (i = 0; i < n; i++) {
                    if (!keep[i]) continue;
                    var px = xs[i], py = ys[i];
                    var t = [1, px, py, px * px, px * py, py * py];
                    for (var a = 0; a < BASIS; a++) {
                        bv[a] += t[a] * channels[ch][i];
                        for (var b2 = 0; b2 < BASIS; b2++) A[a * BASIS + b2] += t[a] * t[b2];
                    }
                }
                var sol = solve(A, bv, BASIS);
                if (!sol) return null;
                out.push(sol);
            }
            coef = out;

            /* residuals -> keep the inliers, so elements stop pulling the surface */
            var res = [];
            for (i = 0; i < n; i++) {
                var e = 0;
                for (ch = 0; ch < 3; ch++) {
                    var v = evalPoly(coef[ch], xs[i], ys[i]);
                    var dd = channels[ch][i] - v;
                    if (dd < 0) dd = -dd;
                    if (dd > e) e = dd;
                }
                res.push(e);
            }
            var sorted = res.slice().sort(function (p, q) { return p - q; });
            var med = sorted[sorted.length >> 1];
            var thr = Math.max(5, med * 2.5);
            var kept = 0;
            for (i = 0; i < n; i++) { keep[i] = res[i] <= thr ? 1 : 0; kept += keep[i]; }
            if (kept < n * 0.15) break;      /* mostly elements: stop refining */
        }
        return coef;
    }

    function evalPoly(c, x, y) {
        return c[0] + c[1] * x + c[2] * y + c[3] * x * x + c[4] * x * y + c[5] * y * y;
    }

    /* ── ink mask ────────────────────────────────────────────────────────── */

    /* Flood the modelled background inward from the border; everything the fill
       cannot reach is an element. Connectivity still matters: a pixel that
       happens to match the background but is enclosed by an element stays ink. */
    function inkMask(img, reg, bg, tol, coef) {
        var data = img.data, W = img.width, w = reg.w, h = reg.h, n = w * h;
        var filled = new Uint8Array(n), seen = new Uint8Array(n);
        var stack = new Int32Array(n), sp = 0;
        var x, y, q, idx;

        /* Per-pixel background. With no fitted surface this is a constant and
           the whole thing reduces to the original, proven flat-page path. */
        var model = new Uint8Array(n * 3);
        for (y = 0; y < h; y++) {
            var ny = h > 1 ? (y / (h - 1)) * 2 - 1 : 0;
            for (x = 0; x < w; x++) {
                var nx = w > 1 ? (x / (w - 1)) * 2 - 1 : 0, m = (y * w + x) * 3;
                if (coef) {
                    for (var ch = 0; ch < 3; ch++) {
                        var v = evalPoly(coef[ch], nx, ny);
                        model[m + ch] = v < 0 ? 0 : v > 255 ? 255 : v;
                    }
                } else {
                    model[m] = bg[0]; model[m + 1] = bg[1]; model[m + 2] = bg[2];
                }
            }
        }

        function consider(lx, ly) {
            if (lx < 0 || ly < 0 || lx >= w || ly >= h) return;
            var p = ly * w + lx;
            if (seen[p]) return;
            seen[p] = 1;
            var i = ((reg.y + ly) * W + (reg.x + lx)) << 2, m = p * 3;
            var dr = data[i] - model[m], dg = data[i + 1] - model[m + 1], db = data[i + 2] - model[m + 2];
            if (dr < 0) dr = -dr;
            if (dg < 0) dg = -dg;
            if (db < 0) db = -db;
            var dist = (dr * 3 + dg * 4 + db * 2) >> 3;
            if (data[i + 3] < 128 || dist <= tol) { filled[p] = 1; stack[sp++] = p; }
        }

        for (x = 0; x < w; x++) { consider(x, 0); consider(x, h - 1); }
        for (y = 0; y < h; y++) { consider(0, y); consider(w - 1, y); }

        while (sp > 0) {
            q = stack[--sp];
            x = q % w; y = (q - x) / w;
            consider(x - 1, y); consider(x + 1, y); consider(x, y - 1); consider(x, y + 1);
        }

        var mask = new Uint8Array(n), total = 0;
        for (q = 0; q < n; q++) if (!filled[q]) { mask[q] = 1; total++; }
        return { mask: mask, total: total, model: model };
    }

    /* ── connected components ────────────────────────────────────────────── */

    function components(mask, w, h, minSide) {
        var labels = new Int32Array(w * h), out = [], queue = new Int32Array(w * h);
        var next = 1, i, x, y, p, qx, qy, head, tail, dx, dy;

        for (y = 0; y < h; y++) {
            for (x = 0; x < w; x++) {
                i = y * w + x;
                if (!mask[i] || labels[i]) continue;
                var id = next++, minX = x, maxX = x, minY = y, maxY = y, area = 0;
                head = 0; tail = 0;
                queue[tail++] = i; labels[i] = id;
                while (head < tail) {
                    p = queue[head++];
                    qx = p % w; qy = (p - qx) / w;
                    area++;
                    if (qx < minX) minX = qx;
                    if (qx > maxX) maxX = qx;
                    if (qy < minY) minY = qy;
                    if (qy > maxY) maxY = qy;
                    /* 8-connectivity keeps diagonal antialiasing in one piece */
                    for (dy = -1; dy <= 1; dy++) {
                        for (dx = -1; dx <= 1; dx++) {
                            var nx = qx + dx, ny = qy + dy;
                            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                            var np = ny * w + nx;
                            if (mask[np] && !labels[np]) { labels[np] = id; queue[tail++] = np; }
                        }
                    }
                }
                var bw = maxX - minX + 1, bh = maxY - minY + 1;
                if (bw >= minSide && bh >= minSide) out.push({ x: minX, y: minY, w: bw, h: bh, area: area });
            }
        }
        return out;
    }

    /* ── grouping type into lines ────────────────────────────────────────── */

    function overlapRatio(a, b) {
        var top = Math.max(a.y, b.y), bottom = Math.min(a.y + a.h, b.y + b.h);
        if (bottom <= top) return 0;
        return (bottom - top) / Math.min(a.h, b.h);
    }

    /* Roughly square and filled: an icon or avatar. It must never be glued to
       the label beside it, or a whole sidebar row collapses into one element. */
    function isIconish(c, scale) {
        var density = c.area / (c.w * c.h);
        var ratio = c.w / c.h;
        return density > 0.55 && ratio > 0.7 && ratio < 1.45 && c.h >= 10 * scale;
    }

    /* Filled and wider than it is tall: a chip, button or bar — never a letter.
       Height must NOT be part of this test: a 32px chip sits under any workable
       height floor, and a row of chips then merges into one box. Density alone
       cannot be the test either (a bold "I" is solid), but glyphs are narrow, so
       the aspect requirement covers them. */
    function isSolidBlock(c, scale) {
        var density = c.area / (c.w * c.h);
        return density > 0.75 && c.w >= c.h * 1.2 && c.w > 16 * scale;
    }

    /* Letters and words sit on a shared baseline with small gaps. Merge those;
       leave genuinely separate elements alone. */
    function mergeLines(boxes, gapFactor, textMax, solidScale) {
        var list = boxes.slice(), merged = true, i, j;
        while (merged) {
            merged = false;
            for (i = 0; i < list.length && !merged; i++) {
                for (j = i + 1; j < list.length; j++) {
                    var a = list[i], b = list[j];
                    /* only ever glue type together: two cards side by side share
                       a line and a small gap, and must stay separate layers */
                    if (a.h > textMax || b.h > textMax) continue;
                    /* A height cap alone is not enough — on a large page a 56px
                       button sits under it, and two side-by-side CTAs merge into
                       one layer. Buttons are wide, tall and SOLID; a glyph is
                       narrow, so density alone cannot be the test (a bold "I" is
                       solid too). */
                    if (isSolidBlock(a, solidScale) || isSolidBlock(b, solidScale)) continue;
                    if (overlapRatio(a, b) < 0.55) continue;               /* not the same line */
                    if (Math.max(a.h, b.h) / Math.min(a.h, b.h) > 2.4) continue;
                    var gap = (b.x > a.x) ? b.x - (a.x + a.w) : a.x - (b.x + b.w);
                    if (gap > gapFactor * Math.max(a.h, b.h)) continue;    /* too far apart */
                    var nx = Math.min(a.x, b.x), ny = Math.min(a.y, b.y);
                    var nr = Math.max(a.x + a.w, b.x + b.w), nb = Math.max(a.y + a.h, b.y + b.h);
                    list[i] = { x: nx, y: ny, w: nr - nx, h: nb - ny, area: a.area + b.area };
                    list.splice(j, 1);
                    merged = true;
                    break;
                }
            }
        }
        return list;
    }

    /* ── typing ──────────────────────────────────────────────────────────── */

    function transitions(mask, w, box) {
        var rowsSampled = 0, count = 0, step = Math.max(1, Math.floor(box.h / 10)), x, y, prev, on;
        for (y = box.y; y < box.y + box.h; y += step) {
            prev = false; rowsSampled++;
            for (x = box.x; x < box.x + box.w; x++) {
                on = !!mask[y * w + x];
                if (on !== prev) { count++; prev = on; }
            }
        }
        return rowsSampled ? count / rowsSampled : 0;
    }

    function colorSpread(img, box) {
        var data = img.data, W = img.width, seen = {}, n = 0;
        var stepX = Math.max(1, Math.floor(box.w / 22)), stepY = Math.max(1, Math.floor(box.h / 22));
        for (var y = box.y; y < box.y + box.h; y += stepY) {
            for (var x = box.x; x < box.x + box.w; x += stepX) {
                var i = (y * W + x) << 2;
                var key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
                if (!seen[key]) { seen[key] = 1; n++; }
            }
        }
        return n;
    }

    function classify(img, box, trans, scale) {
        var density = box.area / (box.w * box.h);
        var ratio = box.w / box.h;
        var spread = colorSpread(img, box);

        /* a line of type: short, airy, many strokes across each row */
        if (box.h <= 52 * scale && density < 0.8 && trans >= 4) return 'text';
        if (spread >= 24 && box.w > 26 * scale && box.h > 26 * scale) return 'image';
        if (ratio > 0.72 && ratio < 1.4 && box.w <= 80 * scale) return 'icon';
        if (density > 0.72) return 'shape';
        if (spread >= 14) return 'image';
        return 'shape';
    }

    /* Does this region hold children, or is it artwork?
     *
     * Refusing to look inside anything typed 'image' protects photos from being
     * shattered into gradient bands — but a content panel full of colourful
     * thumbnails types as 'image' too, and then the entire page inside it is
     * never detected. Size cannot decide it either; a hero image can be huge.
     * What actually separates the two: a container has a flat background BETWEEN
     * its children, a photograph does not. */
    function looksLikeContainer(img, reg, tol) {
        /* Judged on size alone. A "does it have flat background" test sounds
           better but misfires on any photograph with a sky or a plain backdrop,
           which then gets recursed into and yields a phantom box almost the size
           of the photo itself. A photograph occupying a third of a UI screenshot
           is rare; a content column that size is ordinary, and refusing to look
           inside one hides every element on the page. */
        return (reg.w * reg.h) > 0.28 * img.width * img.height;
    }

    /* ── main ────────────────────────────────────────────────────────────── */

    function detect(img, options) {
        var opts = options || {};
        var detail = Math.max(1, Math.min(5, opts.detail || 2));
        var scale = Math.max(0.5, Math.min(3, img.width / 900));
        var tol = opts.tolerance || 6;          /* must stop at a 7-unit card edge */
        var MODEL_TOL = opts.modelTolerance || 18;   /* fitted surface carries some error */
        var maxDepth = detail >= 4 ? 5 : 4;
        /* 4 CSS px is too coarse once scale follows a retina screenshot: a 4px
           hamburger bar becomes 8 device px and gets filtered away entirely. */
        var minSide = Math.max(2, Math.round(2 * scale));
        /* coarse detail glues whole lines together, fine detail keeps words apart */
        /* Word spaces run wider than the measured glyph height, so joining a line
           needs a generous gap. Icons and solid blocks are guarded separately
           above, which is what makes a generous value safe here. */
        var gapFactor = [2.4, 1.7, 1.0, 0.6, 0.36][detail - 1];

        var found = [];
        var useModel = false;      /* decided once, from how the flat path does */

        function walk(reg, bg, depth) {
            var ink = inkMask(img, reg, bg, tol, useModel ? fitBackground(img, reg) : null);
            if (!ink.total) return;

            var comps = components(ink.mask, reg.w, reg.h, minSide);
            if (!comps.length) return;
            comps = mergeLines(comps, gapFactor, 52 * scale, scale);

            for (var i = 0; i < comps.length; i++) {
                var c = comps[i];
                /* the whole region came back as one blob: nothing was separated */
                if (depth > 0 && c.w >= reg.w - 1 && c.h >= reg.h - 1) continue;
                /* Inside a container, anything clinging to the edge is the
                   rounded corner showing the page through, not a child. */
                if (c.area < Math.max(9, 14 * scale * scale) && c.w < 8 * scale && c.h < 8 * scale) continue;
                if (depth > 0 && c.area < 0.2 * reg.w * reg.h &&
                    (c.x <= 0 || c.y <= 0 || c.x + c.w >= reg.w || c.y + c.h >= reg.h)) continue;

                var abs = { x: reg.x + c.x, y: reg.y + c.y, w: c.w, h: c.h, area: c.area };
                var type = classify(img, abs, transitions(ink.mask, reg.w, c), scale);

                var slot = found.length;
                found.push({ box: abs, type: type, depth: depth });

                /* Look inside containers only — never inside type, and inside
                   something typed 'image' only when it reads as a panel rather
                   than a photograph. */
                if (depth < maxDepth && type !== 'text' &&
                    (type !== 'image' || looksLikeContainer(img, abs, tol)) &&
                    abs.w > 40 * scale && abs.h > 30 * scale) {
                    /* step inside the corner radius before looking for children */
                    var inset = Math.max(2, Math.round(Math.min(abs.w, abs.h) * 0.06));
                    var innerReg = {
                        x: abs.x + inset, y: abs.y + inset,
                        w: abs.w - 2 * inset, h: abs.h - 2 * inset
                    };
                    var childrenBefore = found.length;
                    if (innerReg.w > 16 && innerReg.h > 12) {
                        /* The container's own fill lives at its BORDER RING, not
                           in the mode of its interior: a panel packed with
                           thumbnails has them as ~89% of its area, so the mode
                           returns a thumbnail colour, the fill seeds nothing,
                           and the panel comes back as one blob with no children. */
                        walk(innerReg, ringBackground(img, abs), depth + 1);
                    }
                    /* A page-wide strip — a nav bar, a row of cards — is page
                       structure, not an element. Once its children are found it
                       would only add a slab layer spanning the whole width, so
                       drop it and keep the children. Cards keep their background. */
                    if (found.length - childrenBefore >= 2 && abs.w > img.width * 0.7) {
                        found[slot].suppressed = true;
                    }
                }
            }
        }

        var page = { x: 0, y: 0, w: img.width, h: img.height };
        var pageBg = ringBackground(img, page);

        /* A flat background is one colour, so the constant path is right and is
           what the flat fixtures are tuned on. A gradient hero defeats it
           completely: almost nothing matches the single colour, so nearly the
           whole page comes back as ink and collapses into one component. That
           signature — not the image itself — is what selects the fitted surface,
           which means a flat page can never be pushed down the other path. */
        var probe = inkMask(img, page, pageBg, tol, null);

        /* Ink volume alone CANNOT tell a gradient page from a dense one: a
           YouTube-style grid and a gradient hero both come back ~77% ink. What
           separates them is how that ink breaks up. When one colour genuinely
           fails to describe the background, the page collapses into a handful of
           enormous blobs (~8); when the background is fine and the page is just
           busy, the same 77% resolves into scores of real elements (~128).
           Getting this wrong is expensive in one direction: the modelled path
           runs a much looser tolerance, and on a dark UI that swallows every
           panel and card sitting a few units off the page colour. */
        if (probe.total > img.width * img.height * 0.6 &&
            components(probe.mask, page.w, page.h, minSide).length < 30) {
            useModel = true;
            tol = MODEL_TOL;
        }

        /* The page-level pass gives the mask used to lift elements out and to
           rebuild the backdrop. */
        var root = inkMask(img, page, pageBg, tol, useModel ? fitBackground(img, page) : null);
        var pw = img.width, ph = img.height, np = pw * ph;

        /* Grow the mask: anti-aliased fringes sit just outside an element and
           would otherwise stay behind as ghosting. */
        var grown = new Uint8Array(np), gx, gy, gi, ox, oy;
        for (gy = 0; gy < ph; gy++) {
            for (gx = 0; gx < pw; gx++) {
                if (!root.mask[gy * pw + gx]) continue;
                for (oy = -1; oy <= 1; oy++) {
                    for (ox = -1; ox <= 1; ox++) {
                        var ax = gx + ox, ay = gy + oy;
                        if (ax >= 0 && ay >= 0 && ax < pw && ay < ph) grown[ay * pw + ax] = 1;
                    }
                }
            }
        }

        /* Rebuild the backdrop by INPAINTING, not by evaluating the fitted
           surface. The surface is only ever a rough global trend: on a busy page
           it bends to fit content it cannot represent and leaves dark smears
           where elements used to be. Diffusing real neighbouring background
           inward instead follows whatever is actually there — flat, gradient or
           textured — and stays local, so one region cannot contaminate another.
           Done on a small pyramid level: the result is a smooth backdrop, so
           full resolution buys nothing and costs a great deal. */
        var sw = Math.max(24, Math.min(256, pw)), sh = Math.max(16, Math.round(ph * sw / pw));
        var acc = new Float64Array(sw * sh * 3), cnt = new Int32Array(sw * sh);
        var sx, sy, si;

        for (gy = 0; gy < ph; gy++) {
            sy = Math.min(sh - 1, (gy * sh / ph) | 0);
            for (gx = 0; gx < pw; gx++) {
                gi = gy * pw + gx;
                if (grown[gi]) continue;                       /* element pixel: unknown */
                sx = Math.min(sw - 1, (gx * sw / pw) | 0);
                si = sy * sw + sx;
                var di = gi << 2;
                acc[si * 3] += img.data[di];
                acc[si * 3 + 1] += img.data[di + 1];
                acc[si * 3 + 2] += img.data[di + 2];
                cnt[si]++;
            }
        }

        var small = new Float64Array(sw * sh * 3), known = new Uint8Array(sw * sh);
        for (si = 0; si < sw * sh; si++) {
            if (!cnt[si]) continue;
            known[si] = 1;
            small[si * 3] = acc[si * 3] / cnt[si];
            small[si * 3 + 1] = acc[si * 3 + 1] / cnt[si];
            small[si * 3 + 2] = acc[si * 3 + 2] / cnt[si];
        }

        /* Onion-peel: every pass grows the known region by one cell. */
        var remaining = true, guard = 0;
        while (remaining && guard++ < sw + sh) {
            remaining = false;
            var next = new Uint8Array(known);
            for (sy = 0; sy < sh; sy++) {
                for (sx = 0; sx < sw; sx++) {
                    si = sy * sw + sx;
                    if (known[si]) continue;
                    var r = 0, g = 0, b = 0, k = 0;
                    for (oy = -1; oy <= 1; oy++) {
                        for (ox = -1; ox <= 1; ox++) {
                            var nx2 = sx + ox, ny2 = sy + oy;
                            if (nx2 < 0 || ny2 < 0 || nx2 >= sw || ny2 >= sh) continue;
                            var ni = ny2 * sw + nx2;
                            if (!known[ni]) continue;
                            r += small[ni * 3]; g += small[ni * 3 + 1]; b += small[ni * 3 + 2]; k++;
                        }
                    }
                    if (k) {
                        small[si * 3] = r / k; small[si * 3 + 1] = g / k; small[si * 3 + 2] = b / k;
                        next[si] = 1;
                    } else remaining = true;
                }
            }
            known = next;
        }

        /* The peel meets itself in the middle of a large hole and leaves a faint
           diamond seam. A few averaging passes over only the filled cells clear
           it without touching real background. */
        var filledCells = new Uint8Array(sw * sh);
        for (si = 0; si < sw * sh; si++) filledCells[si] = cnt[si] ? 0 : 1;
        for (var pass = 0; pass < 6; pass++) {
            var copy = new Float64Array(small);
            for (sy = 0; sy < sh; sy++) {
                for (sx = 0; sx < sw; sx++) {
                    si = sy * sw + sx;
                    if (!filledCells[si]) continue;
                    var ar = 0, ag = 0, ab = 0, an = 0;
                    for (oy = -1; oy <= 1; oy++) {
                        for (ox = -1; ox <= 1; ox++) {
                            var mx = sx + ox, my = sy + oy;
                            if (mx < 0 || my < 0 || mx >= sw || my >= sh) continue;
                            var mi = my * sw + mx;
                            ar += copy[mi * 3]; ag += copy[mi * 3 + 1]; ab += copy[mi * 3 + 2]; an++;
                        }
                    }
                    small[si * 3] = ar / an; small[si * 3 + 1] = ag / an; small[si * 3 + 2] = ab / an;
                }
            }
        }

        var plate = new Uint8ClampedArray(sw * sh * 4);
        for (si = 0; si < sw * sh; si++) {
            plate[si * 4] = small[si * 3];
            plate[si * 4 + 1] = small[si * 3 + 1];
            plate[si * 4 + 2] = small[si * 3 + 2];
            plate[si * 4 + 3] = 255;
        }

        walk(page, pageBg, 0);

        /* Returning nothing is never a useful answer, so if a page defeats the
           chosen path entirely, try the other one before giving up. */
        if (!found.length) {
            useModel = !useModel;
            tol = useModel ? MODEL_TOL : (opts.tolerance || 6);
            walk(page, pageBg, 0);
        }

        /* ── emit ────────────────────────────────────────────────────────── */
        var out = [], counters = {}, i, f, b, type;
        for (i = 0; i < found.length; i++) {
            f = found[i]; b = f.box;
            if (f.suppressed) continue;
            if (b.w >= img.width * 0.985 && b.h >= img.height * 0.985) continue;   /* the page itself */
            type = f.type;
            counters[type] = (counters[type] || 0) + 1;
            out.push({
                x: b.x, y: b.y, w: b.w, h: b.h,
                type: type,
                depth: f.depth,
                name: type.charAt(0).toUpperCase() + type.slice(1) + ' ' + counters[type],
                /* anchor at the element's own centre so scale and rotation feel right */
                anchor: { x: b.x + b.w / 2, y: b.y + b.h / 2 }
            });
        }

        /* reading order: banded top-to-bottom, then left-to-right */
        out.sort(function (a, b) {
            var band = Math.max(8, Math.round(12 * scale));
            var ay = Math.round(a.y / band), by = Math.round(b.y / band);
            return ay !== by ? ay - by : a.x - b.x;
        });

        return {
            width: img.width,
            height: img.height,
            background: '#' + ((1 << 24) + (pageBg[0] << 16) + (pageBg[1] << 8) + pageBg[2]).toString(16).slice(1),
            /* Backdrop rebuilt by inpainting, at pyramid resolution — the caller
               scales it up and shows it only through the mask, so untouched
               background keeps its original detail. */
            plate: { width: sw, height: sh, data: plate },
            inkMask: { width: pw, height: ph, data: grown },
            elements: out
        };
    }

    return { detect: detect, version: '1.8.0-compx' };
}));
