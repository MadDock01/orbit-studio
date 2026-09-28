/* ============================================================
   AE 3D RIG — host side (After Effects ExtendScript)

   Fixed version. What changed and why:

   * Every tool runs inside one undo group that is always closed,
     even on an error or an early "select a comp" return (before,
     several paths left the group open and scrambled Ctrl+Z).
   * Errors are reported with an alert instead of stopping silently.
   * Shape -> mask conversion now uses the real group and layer
     transforms. Layer.toComp() does not exist in ExtendScript (it is
     an expression method), so the old code always fell back to
     "add the layer position" and masks landed in the wrong place
     whenever the layer was scaled, rotated, parented or had a moved
     anchor. E3D Boilerplate did not transform the paths at all.
   * Mask holders are comp-sized solids (layer space == comp space),
     so the mask coordinates are exact. Masks on a 100x100 null were
     offset by the null's anchor.
   * Camera Rig: the camera was locked before its expressions were
     set; After Effects refuses edits on a locked layer, so the rig
     stopped half-built. It is now locked last.
   * Camera Rig / Light Rig get unique names, and the expressions
     point at that name, so building a second rig no longer hijacks
     the first one.
   * Light Rig: Point of Interest used hasProperty(), which is not an
     expression method, so picking a target layer broke the lights.
   * Stacker: the preset is applied once (re-running used to stack a
     new copy of the effect on the master every time), expressions
     use thisComp (renaming the comp no longer breaks them), cameras,
     lights and the master itself are skipped, and layers with
     separated dimensions get the offset on Z Position.
   * Clean asks before deleting every layer in the comp.
   * Transform properties are addressed by match name, so the tools
     also work in a non-English After Effects.
   * All tools live under AE3DRIG_* names; the generic globals
     (CAMERA, CLEAN, ...) could collide with other panels, which share
     one ExtendScript engine.
   ============================================================ */

/* ---------- shared helpers ---------- */

function AE3DRIG_comp() {
    var comp = app.project ? app.project.activeItem : null;
    return (comp && comp instanceof CompItem) ? comp : null;
}

// Runs fn inside one undo group that is always closed, and turns any
// error into an alert instead of a silent stop.
function AE3DRIG_run(title, fn) {
    var open = false;
    try {
        app.beginUndoGroup(title);
        open = true;
        fn();
    } catch (e) {
        alert(title + " failed:\n" + e.toString() + (e.line ? " (line " + e.line + ")" : ""));
    } finally {
        if (open) {
            try { app.endUndoGroup(); } catch (eEnd) { /* already closed */ }
        }
    }
}

function AE3DRIG_file(extPath, name) {
    return new File(String(extPath || "").replace(/'/g, "") + "/" + name);
}

// "Camera Rig", then "Camera Rig 2", "Camera Rig 3" ... so every rig's
// expressions can name their own controller.
function AE3DRIG_uniqueName(comp, base) {
    var name = base, n = 1, taken;
    do {
        taken = false;
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name === name) { taken = true; break; }
        }
        if (taken) { n++; name = base + " " + n; }
    } while (taken);
    return name;
}

function AE3DRIG_tr(layer) {
    return layer.property("ADBE Transform Group");
}

function AE3DRIG_esc(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/* ---------- shape path -> comp space ---------- */

// 2D affine matrices as [a, b, c, d, tx, ty]:
//   x' = a*x + c*y + tx,  y' = b*x + d*y + ty
function AE3DRIG_mul(m, n) {
    return [
        m[0] * n[0] + m[2] * n[1],
        m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3],
        m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4],
        m[1] * n[4] + m[3] * n[5] + m[5]
    ];
}

function AE3DRIG_apply(pt, m) {
    return [pt[0] * m[0] + pt[1] * m[2] + m[4], pt[0] * m[1] + pt[1] * m[3] + m[5]];
}

// translate(pos) * rotate(rot) * scale(scale) * translate(-anchor)
function AE3DRIG_affine(pos, anchor, scale, rotDeg) {
    var r = rotDeg * Math.PI / 180;
    var sx = scale[0] / 100, sy = scale[1] / 100;
    var a = Math.cos(r) * sx, b = Math.sin(r) * sx;
    var c = -Math.sin(r) * sy, d = Math.cos(r) * sy;
    return [a, b, c, d,
        pos[0] - (anchor[0] * a + anchor[1] * c),
        pos[1] - (anchor[0] * b + anchor[1] * d)];
}

// Group-local -> layer space: every Transform on the way up to Contents.
function AE3DRIG_groupMatrix(group) {
    var m = [1, 0, 0, 1, 0, 0];
    while (group && group.matchName !== "ADBE Root Vectors Group") {
        var tr = null;
        try { tr = group.property("ADBE Vector Transform Group"); } catch (e) { tr = null; }
        if (tr) {
            var pos = tr.property("ADBE Vector Position").value;
            var anchor = tr.property("ADBE Vector Anchor") ? tr.property("ADBE Vector Anchor").value : [0, 0];
            var scale = tr.property("ADBE Vector Scale") ? tr.property("ADBE Vector Scale").value : [100, 100];
            var rot = tr.property("ADBE Vector Rotation") ? tr.property("ADBE Vector Rotation").value : 0;
            m = AE3DRIG_mul(AE3DRIG_affine(pos, anchor, scale, rot), m);
        }
        group = group.parentProperty;
    }
    return m;
}

// Layer space -> comp space, through the parent chain. 3D layers are
// flattened (their X/Y and Z rotation), which is what a mask needs.
function AE3DRIG_layerMatrix(layer, t) {
    var tr = AE3DRIG_tr(layer);
    var posProp = tr.property("ADBE Position");
    var pos;
    if (posProp.dimensionsSeparated) {
        pos = [tr.property("ADBE Position_0").valueAtTime(t, false), tr.property("ADBE Position_1").valueAtTime(t, false)];
    } else {
        pos = posProp.valueAtTime(t, false);
    }
    var anchor = tr.property("ADBE Anchor Point").valueAtTime(t, false);
    var scale = tr.property("ADBE Scale").valueAtTime(t, false);
    var rot = tr.property("ADBE Rotate Z").valueAtTime(t, false);
    var m = AE3DRIG_affine(pos, anchor, scale, rot);
    if (layer.parent) m = AE3DRIG_mul(AE3DRIG_layerMatrix(layer.parent, t), m);
    return m;
}

// One "Path" of a shape layer as a Shape in comp coordinates.
function AE3DRIG_pathToComp(pathGroup, layerMatrix) {
    var pathProp = pathGroup.property("ADBE Vector Shape");
    if (!pathProp) return null;
    var shape = pathProp.value;
    var verts = shape.vertices, ins = shape.inTangents, outs = shape.outTangents;
    if (!verts || !verts.length) return null;
    var m = AE3DRIG_mul(layerMatrix, AE3DRIG_groupMatrix(pathGroup.parentProperty));
    var v = [], vi = [], vo = [];
    for (var i = 0; i < verts.length; i++) {
        var p = AE3DRIG_apply(verts[i], m);
        var pi = AE3DRIG_apply([verts[i][0] + ins[i][0], verts[i][1] + ins[i][1]], m);
        var po = AE3DRIG_apply([verts[i][0] + outs[i][0], verts[i][1] + outs[i][1]], m);
        v.push(p);
        vi.push([pi[0] - p[0], pi[1] - p[1]]);
        vo.push([po[0] - p[0], po[1] - p[1]]);
    }
    var out = new Shape();
    out.vertices = v;
    out.inTangents = vi;
    out.outTangents = vo;
    out.closed = shape.closed;
    return out;
}

// The group a path belongs to, for naming its mask.
function AE3DRIG_groupName(pathGroup) {
    var g = pathGroup.parentProperty;                 // Contents
    if (g && g.parentProperty && g.parentProperty.matchName === "ADBE Vector Group") return g.parentProperty.name;
    return pathGroup.name;
}

// Copy every path under `group` onto `holder` as Add masks. Returns the count.
function AE3DRIG_copyPaths(group, holder, layerMatrix) {
    var made = 0;
    for (var i = 1; i <= group.numProperties; i++) {
        var p = group.property(i);
        if (p.matchName === "ADBE Vector Group" || p.matchName === "ADBE Vectors Group") {
            made += AE3DRIG_copyPaths(p, holder, layerMatrix);
        } else if (p.matchName === "ADBE Vector Shape - Group") {
            var shape = AE3DRIG_pathToComp(p, layerMatrix);
            if (!shape) continue;
            var mask = holder.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
            mask.name = AE3DRIG_groupName(p) + "_mask";
            mask.property("ADBE Mask Shape").setValue(shape);
            try { mask.maskMode = MaskMode.ADD; } catch (eM) { /* default is Add */ }
            made++;
        }
    }
    return made;
}

// A comp-sized solid, so its layer space is the comp space.
function AE3DRIG_maskHolder(comp, name, color) {
    return comp.layers.addSolid(color || [1, 1, 1], name, comp.width, comp.height, comp.pixelAspect, comp.duration);
}

function AE3DRIG_selectedShape(comp) {
    var sel = comp.selectedLayers;
    for (var i = 0; i < sel.length; i++) if (sel[i].matchName === "ADBE Vector Layer") return sel[i];
    return null;
}

/* ---------- Shape Mask (click) ---------- */

// Every path of the selected shape layer as masks on one hidden solid.
function AE3DRIG_E3D() {
    var comp = AE3DRIG_comp();
    if (!comp) { alert("Select a composition first."); return; }
    var layer = AE3DRIG_selectedShape(comp);
    if (!layer) { alert("Select a shape layer first."); return; }

    AE3DRIG_run("Shape Mask", function () {
        var m = AE3DRIG_layerMatrix(layer, comp.time);
        var holder = AE3DRIG_maskHolder(comp, layer.name + "_Masks");
        var count = AE3DRIG_copyPaths(layer.property("ADBE Root Vectors Group"), holder, m);
        if (!count) {
            holder.remove();
            alert("That shape layer has no Path shapes. Convert rectangles/ellipses to Bezier paths first (right-click > Convert to Bezier Path).");
            return;
        }
        holder.moveBefore(layer);
        holder.enabled = false;     // a mask source for Element 3D, not something to see
    });
}

/* ---------- Shape Mask (Ctrl/Cmd+click): one solid per top-level group ---------- */

function AE3DRIG_aE3D() {
    var comp = AE3DRIG_comp();
    if (!comp) { alert("Select a composition first."); return; }
    var layer = AE3DRIG_selectedShape(comp);
    if (!layer) { alert("Select a shape layer first."); return; }

    AE3DRIG_run("Shape Mask per Group", function () {
        var m = AE3DRIG_layerMatrix(layer, comp.time);
        var root = layer.property("ADBE Root Vectors Group");
        var made = 0;
        for (var g = 1; g <= root.numProperties; g++) {
            var grp = root.property(g);
            if (!grp || grp.matchName !== "ADBE Vector Group") continue;
            var solid = AE3DRIG_maskHolder(comp, "Mask_" + grp.name);
            if (AE3DRIG_copyPaths(grp, solid, m)) {
                solid.moveBefore(layer);
                made++;
            } else {
                solid.remove();
            }
        }
        if (!made) alert("No groups with Path shapes were found in that layer.");
    });
}

/* ---------- Light Rig ---------- */

function AE3DRIG_LIGHTRIG(extPath) {
    var comp = AE3DRIG_comp();
    if (!comp) { alert("Please select a composition."); return; }
    var preset = AE3DRIG_file(extPath, "Light.ffx");
    if (!preset.exists) { alert("Light.ffx was not found next to the panel:\n" + preset.fsName); return; }

    AE3DRIG_run("Light Rig", function () {
        var renderer = comp.renderer;
        var rigName = AE3DRIG_uniqueName(comp, "Light Rig");
        var rig = comp.layers.addNull();
        rig.applyPreset(preset);
        rig.name = rigName;
        AE3DRIG_tr(rig).property("ADBE Position").setValue([comp.width / 2, comp.height / 2]);

        var fx = rig.property("ADBE Effect Parade").property("Pseudo/gg.light");
        if (!fx) throw new Error("Light.ffx did not add its controls.");

        var lights = [];
        for (var k = 1; k <= 3; k++) {
            var L = comp.layers.addLight(AE3DRIG_uniqueName(comp, rigName + " - Light " + k), [comp.width / 2, comp.height / 2]);
            L.lightType = LightType.PARALLEL;
            L.shy = true;
            lights.push(L);
        }

        fx.property("Pseudo/gg.light-0012").setValue(120);
        fx.property("Pseudo/gg.light-0019").setValue(240);
        fx.property("Pseudo/gg.light-0001").setValue(2000);
        fx.property("Pseudo/gg.light-0008").setValue(100);
        fx.property("Pseudo/gg.light-0015").setValue(100);
        fx.property("Pseudo/gg.light-0022").setValue(100);
        fx.property("Pseudo/gg.light-0026").setValue(
            (renderer === "ADBE Advanced 3d" || renderer === "ADBE Calder") ? 50 : 2500);

        var i;
        var angles = ["Pseudo/gg.light-0005", "Pseudo/gg.light-0012", "Pseudo/gg.light-0019"];
        for (i = 0; i < angles.length; i++) {
            fx.property(angles[i]).expression =
                "value + effect('Pseudo/gg.light')('Pseudo/gg.light-0025');";
        }
        var intensities = ["Pseudo/gg.light-0008", "Pseudo/gg.light-0015", "Pseudo/gg.light-0022"];
        for (i = 0; i < intensities.length; i++) {
            fx.property(intensities[i]).expression =
                "value + effect('Pseudo/gg.light')('Pseudo/gg.light-0026');";
        }

        var R = "thisComp.layer('" + AE3DRIG_esc(rigName) + "')";
        var ids = [
            { angle: "0005", distance: "0007", height: "0006", intensity: "0008", color: "0009" },
            { angle: "0012", distance: "0014", height: "0013", intensity: "0015", color: "0016" },
            { angle: "0019", distance: "0021", height: "0020", intensity: "0022", color: "0023" }
        ];
        for (i = 0; i < 3; i++) {
            var id = ids[i], L2 = lights[i];
            var E = R + ".effect('Pseudo/gg.light')('Pseudo/gg.light-";
            AE3DRIG_tr(L2).property("ADBE Position").expression =
                "var center = " + R + ".transform.position;\n" +
                "var radius = " + E + "0001');\n" +
                "var angle = " + E + id.angle + "');\n" +
                "var distance = " + E + id.distance + "');\n" +
                "var height = " + E + id.height + "');\n" +
                "var rigHeight = " + E + "0002');\n" +
                "var flip = " + E + "0027');\n" +
                "var r = degreesToRadians(angle);\n" +
                "var x = center[0] + Math.cos(r) * (radius + distance);\n" +
                "(flip == 1)\n" +
                "  ? [x, center[1] - rigHeight - height, Math.sin(r) * (radius + distance)]\n" +
                "  : [x, center[1] + Math.sin(r) * (radius + distance), -rigHeight - height];";

            // Point of Interest (match name ADBE Anchor Point on a light).
            AE3DRIG_tr(L2).property("ADBE Anchor Point").expression =
                "var rig = " + R + ";\n" +
                "var idx = Math.round(rig.effect('Pseudo/gg.light')('Pseudo/gg.light-0003'));\n" +
                "var p = rig.transform.position;\n" +
                "if (idx > 0 && idx <= thisComp.numLayers && idx != index) {\n" +
                "  try { p = thisComp.layer(idx).toWorld(thisComp.layer(idx).anchorPoint); } catch (e) {}\n" +
                "}\n" +
                "p;";

            var opts = L2.property("ADBE Light Options Group");
            opts.property("ADBE Light Intensity").expression = E + id.intensity + "');";
            opts.property("ADBE Light Color").expression = E + id.color + "');";
            try { opts.property("ADBE Light Falloff Type").setValue(3); } catch (eF) { /* older AE */ }
        }
        try { lights[2].property("ADBE Light Options Group").property("ADBE Casts Shadows").setValue(1); } catch (eS) { /* parallel shadows need a 3D renderer */ }

        comp.hideShyLayers = true;
        rig.selected = true;
    });
}

/* ---------- Stacker ---------- */

function AE3DRIG_STACKER(extPath) {
    var comp = AE3DRIG_comp();
    if (!comp) { alert("Please select a composition."); return; }
    var MASTER = "Master Layer";

    var picked = [], i;
    for (i = 0; i < comp.selectedLayers.length; i++) {
        var l = comp.selectedLayers[i];
        if (l.name === MASTER) continue;
        if (l instanceof CameraLayer || l instanceof LightLayer) continue;
        picked.push(l);
    }
    if (!picked.length) { alert("Please select at least one layer (cameras and lights are skipped)."); return; }
    var preset = AE3DRIG_file(extPath, "Stacker.ffx");

    AE3DRIG_run("Z Stacker", function () {
        var master = null;
        for (i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name === MASTER) { master = comp.layer(i); break; }
        }
        if (!master) {
            master = comp.layers.addShape();
            master.name = MASTER;
            master.moveToEnd();
        }
        // Only apply the preset when its controls are missing; re-applying
        // stacked another copy of the effect on every run.
        if (!master.property("ADBE Effect Parade").property("Pseudo/gg.stacker")) {
            if (!preset.exists) throw new Error("Stacker.ffx was not found next to the panel:\n" + preset.fsName);
            for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
            master.selected = true;
            master.applyPreset(preset);
        }

        var M = "thisComp.layer('" + AE3DRIG_esc(MASTER) + "').effect('Pseudo/gg.stacker')('Pseudo/gg.stacker-";
        var count = picked.length;
        for (i = 0; i < count; i++) {
            var layer = picked[i];
            if (layer.locked) continue;
            if (!layer.threeDLayer) layer.threeDLayer = true;
            var zExpr =
                "var mode = " + M + "0001');\n" +
                "var padding = " + M + "0002');\n" +
                "var mult = " + M + "0003');\n" +
                "var baseZ = " + M + "0004');\n" +
                "var idx = " + i + ";\n" +
                "var count = " + count + ";\n" +
                "function stacked(end, dir) {\n" +
                "  var val = 0;\n" +
                "  for (var j = 0; j <= end; j++) val += padding * ((mode == 1) ? 1 : Math.pow(mult / 50, j));\n" +
                "  return val * dir;\n" +
                "}\n" +
                "var z = 0;\n" +
                "if (mode == 1) z = baseZ + padding * idx;\n" +
                "else if (mode == 2) z = baseZ + stacked(idx, 1);\n" +
                "else if (mode == 3) z = baseZ + stacked(count - 1 - idx, 1);\n" +
                "else if (mode == 4) {\n" +
                "  var center = Math.floor(count / 2);\n" +
                "  z = baseZ + stacked(Math.abs(idx - center), idx >= center ? 1 : -1);\n" +
                "}\n";
            var tr = AE3DRIG_tr(layer);
            if (tr.property("ADBE Position").dimensionsSeparated) {
                tr.property("ADBE Position_2").expression = zExpr + "value + z;";
            } else {
                tr.property("ADBE Position").expression = zExpr + "value + [0, 0, z];";
            }
        }

        for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
        for (i = 0; i < picked.length; i++) picked[i].selected = true;
    });
}

/* ---------- E3D Boilerplate ---------- */

function AE3DRIG_E3DB(extPath) {
    var comp = AE3DRIG_comp();
    if (!comp) { alert("Select a composition first."); return; }
    var selected = [], i;
    for (i = 0; i < comp.selectedLayers.length; i++) selected.push(comp.selectedLayers[i]);

    AE3DRIG_run("E3D Boilerplate", function () {
        var maskLayers = [], textureLayers = [], textLayers = [];

        for (i = 0; i < selected.length; i++) {
            var l = selected[i];
            if (l.matchName === "ADBE Text Layer") {
                textLayers.push(l);
            } else if (l.matchName === "ADBE Vector Layer") {
                // Shape -> masks on a comp-sized solid, with the real transforms.
                var holder = AE3DRIG_maskHolder(comp, "E3D Mask " + l.name);
                if (AE3DRIG_copyPaths(l.property("ADBE Root Vectors Group"), holder, AE3DRIG_layerMatrix(l, comp.time))) {
                    holder.moveBefore(l);
                    l.enabled = false;
                    maskLayers.push(holder);
                } else {
                    holder.remove();
                }
            } else if (l.property("ADBE Mask Parade") && l.property("ADBE Mask Parade").numProperties > 0) {
                // A null or solid that already carries masks (e.g. from Shape Mask).
                maskLayers.push(l);
            } else if (l.matchName === "ADBE AV Layer" && !l.nullLayer) {
                textureLayers.push(l);
            }
        }

        var e3dSolid = comp.layers.addSolid([0.3, 0.3, 0.3], AE3DRIG_uniqueName(comp, "Element 3D"),
            comp.width, comp.height, comp.pixelAspect, comp.duration);
        var e3d = e3dSolid.property("ADBE Effect Parade").addProperty("VIDEOCOPILOT 3DArray");
        if (!e3d) throw new Error("Element 3D is not installed.");
        try { e3d.property("VIDEOCOPILOT 3DArray-1252").setValue(true); } catch (e1) { /* older Element */ }
        try { e3d.property("VIDEOCOPILOT 3DArray-5102").setValue(true); } catch (e2) { /* older Element */ }
        try { e3d.property("VIDEOCOPILOT 3DArray-0302").setValue(true); } catch (e3) { /* older Element */ }

        // Layer parameters take the layer index; read it after all the
        // layers above have been added.
        if (textureLayers.length) try { e3d.property("VIDEOCOPILOT 3DArray-1852").setValue(textureLayers[0].index); } catch (e4) { /* param moved */ }
        if (maskLayers.length) try { e3d.property("VIDEOCOPILOT 3DArray-1802").setValue(maskLayers[0].index); } catch (e5) { /* param moved */ }
        if (textLayers.length) try { e3d.property("VIDEOCOPILOT 3DArray-1902").setValue(textLayers[0].index); } catch (e6) { /* param moved */ }

        for (i = 0; i < maskLayers.length; i++) maskLayers[i].enabled = false;
        for (i = 0; i < textureLayers.length; i++) textureLayers[i].enabled = false;
        for (i = 0; i < textLayers.length; i++) textLayers[i].enabled = false;
    });
}

/* ---------- Camera Rig ---------- */

function AE3DRIG_CAMERA(extPath) {
    var comp = AE3DRIG_comp();
    if (!comp) { alert("Please select a composition."); return; }
    var preset = AE3DRIG_file(extPath, "Camera.ffx");
    if (!preset.exists) { alert("Camera.ffx was not found next to the panel:\n" + preset.fsName); return; }

    AE3DRIG_run("Camera Rig", function () {
        var w = comp.width / 2, h = comp.height / 2;
        var rigName = AE3DRIG_uniqueName(comp, "Camera Rig");
        var R = "thisComp.layer('" + AE3DRIG_esc(rigName) + "')";

        var master = comp.layers.addShape();
        master.guideLayer = true;
        master.name = rigName;
        master.threeDLayer = true;
        master.applyPreset(preset);

        var fx = master.property("ADBE Effect Parade").property("Pseudo/gg.camera2");
        if (!fx) throw new Error("Camera.ffx did not add its controls.");
        fx.property("Pseudo/gg.camera2-0008").setValue(0);
        fx.property("Pseudo/gg.camera2-0009").setValue(10);
        fx.property("Pseudo/gg.camera2-0021").setValue(5);
        fx.property("Pseudo/gg.camera2-0022").setValue(1);
        fx.name = "Camera Rig";
        var CAM = R + ".effect('Camera Rig')";

        function axisNull(name, parent, after, rotMatch, ctl) {
            var n = comp.layers.addShape();
            n.name = AE3DRIG_uniqueName(comp, rigName + " - " + name);
            n.guideLayer = true;
            n.threeDLayer = true;
            n.shy = true;
            n.enabled = false;
            n.parent = parent;
            n.moveAfter(after);
            AE3DRIG_tr(n).property(rotMatch).expression =
                "var cam = " + CAM + ";\n" +
                "cam('" + ctl + " Rotation') + time * cam('" + ctl + " Rotate');";
            return n;
        }
        // Names kept from the original rig: X Rotation drives Y rotate, etc.
        var nx = axisNull("X", master, master, "ADBE Rotate Y", "X");
        var ny = axisNull("Y", nx, nx, "ADBE Rotate X", "Y");
        var nz = axisNull("Z", ny, ny, "ADBE Rotate Z", "Z");
        comp.hideShyLayers = true;

        var cam = comp.layers.addCamera(AE3DRIG_uniqueName(comp, rigName + " - Camera"), [w, h]);
        cam.parent = nz;
        cam.moveAfter(nz);

        var mt = AE3DRIG_tr(master);
        mt.property("ADBE Position").dimensionsSeparated = true;
        var axes = [["ADBE Position_0", "X"], ["ADBE Position_1", "Y"], ["ADBE Position_2", "Z"]];
        for (var a = 0; a < axes.length; a++) {
            mt.property(axes[a][0]).expression =
                "var cam = " + CAM + ";\n" +
                "cam('" + axes[a][1] + " Position') + time * cam('" + axes[a][1] + " Movement') * cam('Speed');";
        }
        mt.property("ADBE Orientation").expression =
            "var chk = " + R + ".effect('Camera Rig')('Pseudo/gg.camera2-0024');\n" +
            "chk == 1 ? [45, 35, 30] : value;";

        var ct = AE3DRIG_tr(cam);
        ct.property("ADBE Position").setValue([0, 0, 0]);
        ct.property("ADBE Anchor Point").setValue([0, 0, 0]);            // Point of Interest
        ct.property("ADBE Anchor Point").expression = "transform.position;";
        ct.property("ADBE Position").expression =
            "var cam = " + CAM + ";\n" +
            "var pos = -[0, 0, cameraOption.zoom] + [0, 0, cam('Zoom')] +\n" +
            "  [cam('X Position'), cam('Y Position'), cam('Z Position')];\n" +
            "pos + wiggle(cam('Frequency'), cam('Amplitude'), cam('Complexity'), 1, time);";
        cam.property("ADBE Camera Options Group").property("ADBE Camera Zoom").expression =
            "var FOV = " + CAM + "('Focal Length');\n" +
            "thisComp.width / (2 * Math.tan(degreesToRadians(FOV / 2)));";

        // Lock last: After Effects refuses edits on a locked layer, which is
        // what used to stop the rig half-built.
        cam.selected = false;
        master.selected = true;
        cam.locked = true;
    });
}

/* ---------- Clean ---------- */

function AE3DRIG_CLEAN() {
    var comp = AE3DRIG_comp();
    if (!comp) { alert("Select a composition first."); return; }
    if (!comp.numLayers) { alert("This composition is already empty."); return; }
    if (!confirm("Delete ALL " + comp.numLayers + " layers in \"" + comp.name + "\"?\nLocked and shy layers are deleted too. You can undo this.")) return;

    AE3DRIG_run("Delete All Layers", function () {
        comp.hideShyLayers = false;
        for (var i = comp.numLayers; i >= 1; i--) {
            var layer = comp.layer(i);
            layer.locked = false;
            layer.remove();
        }
    });
}

/* ---------- Floor / backdrop ---------- */

function AE3DRIG_FLOOR() {
    var comp = AE3DRIG_comp();
    if (!comp) { alert("Please select a composition."); return; }

    AE3DRIG_run("Floor", function () {
        var solid = comp.layers.addSolid([0.2, 0.2, 0.2], AE3DRIG_uniqueName(comp, "Background"),
            comp.width, comp.height, comp.pixelAspect, comp.duration);
        solid.threeDLayer = true;
        AE3DRIG_tr(solid).property("ADBE Position").setValue([comp.width / 2, comp.height / 2, 500]);
        // So the Light Rig's shadows land on it.
        try { solid.property("ADBE Material Options Group").property("ADBE Accepts Shadows").setValue(1); } catch (eSh) { /* renderer without shadows */ }

        var fxs = solid.property("ADBE Effect Parade");
        var fill = fxs.addProperty("ADBE Fill");
        try { fill.property("ADBE Fill-0002").setValue([0.2, 0.2, 0.2, 1]); } catch (eF) {
            try { fill.property("Color").setValue([0.2, 0.2, 0.2]); } catch (eF2) { /* default colour */ }
        }
        var geo = fxs.addProperty("ADBE Geometry2");
        try { geo.property("ADBE Geometry2-0003").setValue(300); } catch (eG) {
            try { geo.property("Scale").setValue(300); } catch (eG2) { /* left at 100 */ }
        }
        // Pattern options, off until the user turns one on.
        var patterns = ["CC HexTile", "ADBE Grid", "ADBE Venetian Blinds", "ADBE Checkerboard"];
        for (var i = 0; i < patterns.length; i++) {
            try { fxs.addProperty(patterns[i]).enabled = false; } catch (eP) { /* effect not installed */ }
        }
        solid.moveToEnd();
    });
}

/* ---------- old entry points (kept so saved scripts still work) ---------- */

function E3D() { AE3DRIG_E3D(); }
function aE3D() { AE3DRIG_aE3D(); }
function LIGHTRIG(p) { AE3DRIG_LIGHTRIG(p); }
function STACKER(p) { AE3DRIG_STACKER(p); }
function E3DB(p) { AE3DRIG_E3DB(p); }
function CAMERA(p) { AE3DRIG_CAMERA(p); }
function CLEAN() { AE3DRIG_CLEAN(); }
function FLOOR() { AE3DRIG_FLOOR(); }
