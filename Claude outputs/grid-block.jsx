// ================================================================
// ORBIT GRID  (Morph tab)
// Replicates the selected layer into a grid that stays live: every
// cell's Position is an expression reading sliders on a controller
// null, so dragging Columns or Radius in AE rebuilds the layout
// without touching this panel again.
//
// Written against AE's own scripting and expression API. The cell
// maths — row/column from a single index, a circle from an angle
// step, a Fibonacci sphere — is standard, and none of it is taken
// from another vendor's script or preset.
//
// Effect properties are read by index, effect("Columns")(1), rather
// than by the property name "Slider", because that name is
// localised and the expression would break on a non-English AE.
// ================================================================

var COMPX_GRID_RIG = "Orbit Grid Rig";
var COMPX_GRID_MAX = 300;

function compxGridSlider(layer, name, value) {
  var fx = layer.property("ADBE Effect Parade");
  var existing = null;
  try { existing = fx.property(name); } catch (e) { existing = null; }
  if (!existing) {
    existing = fx.addProperty("ADBE Slider Control");
    existing.name = name;
  }
  try { existing.property(1).setValue(value); } catch (e) { compxAuditFallback("HOST_GRID_SLIDER_001", e); }
  return existing;
}

function compxGridFindRig(comp) {
  var i, layer;
  for (i = 1; i <= comp.numLayers; i++) {
    layer = comp.layer(i);
    if (layer.name === COMPX_GRID_RIG) return layer;
    try { if (String(layer.comment || "").indexOf("COMPX_GRID_RIG") >= 0) return layer; } catch (e) { compxAuditFallback("HOST_GRID_FINDRIG_001", e); }
  }
  return null;
}

// Cells sit under the rig, so their Position is already relative to it —
// the layout only has to say where each index lands around the origin.
function compxGridExpression(mode, total) {
  var head =
    "// COMPX_GRID\n" +
    "try {\n" +
    '  var rig = thisComp.layer("' + COMPX_GRID_RIG + '");\n' +
    '  var i = thisLayer.effect("Grid Index")(1);\n' +
    "  var n = " + total + ";\n";
  var tail = "\n} catch (err) {\n  value;\n}";

  if (mode === "radial") {
    return head +
      '  var r = rig.effect("Radius")(1);\n' +
      '  var a0 = rig.effect("Angle")(1);\n' +
      "  var ang = degreesToRadians((i / n) * 360 + a0);\n" +
      "  [Math.cos(ang) * r, Math.sin(ang) * r, 0];" + tail;
  }

  if (mode === "sphere") {
    // Fibonacci placement: each point steps one golden angle round the
    // axis while y walks evenly from pole to pole, which spreads them
    // without the crowding you get from a lat/long grid.
    return head +
      '  var r = rig.effect("Radius")(1);\n' +
      '  var a0 = degreesToRadians(rig.effect("Angle")(1));\n' +
      "  var off = 2 / n;\n" +
      "  var inc = Math.PI * (3 - Math.sqrt(5));\n" +
      "  var y = i * off - 1 + off / 2;\n" +
      "  var rad = Math.sqrt(Math.max(0, 1 - y * y));\n" +
      "  var phi = i * inc + a0;\n" +
      "  [Math.cos(phi) * rad * r, y * r, Math.sin(phi) * rad * r];" + tail;
  }

  return head +
    '  var cols = Math.max(1, Math.round(rig.effect("Columns")(1)));\n' +
    '  var sx = rig.effect("Spacing X")(1);\n' +
    '  var sy = rig.effect("Spacing Y")(1);\n' +
    "  var rows = Math.ceil(n / cols);\n" +
    "  var col = i % cols;\n" +
    "  var row = Math.floor(i / cols);\n" +
    "  [ (col - (cols - 1) / 2) * sx, (row - (rows - 1) / 2) * sy, 0 ];" + tail;
}

// 1. BUILD — replicate the selected layer into a live grid
function ae_gridBuild(mode, cols, rows, count, spacing, radius) {
  var undoOpen = false;
  try {
    if (!isAfterEffects()) return toolResult(false, "Grid is available in After Effects only.");
    var comp = getActiveComp();
    if (!comp) return toolResult(false, "Open a composition first.");
    var layers = getSelectedLayers(comp);
    if (layers.length === 0) return toolResult(false, "Select the layer to build the grid from.");

    var kind = String(mode || "rect");
    if (kind !== "radial" && kind !== "sphere") kind = "rect";

    var nCols = Math.max(1, Math.min(60, Math.round(Number(cols) || 5)));
    var nRows = Math.max(1, Math.min(60, Math.round(Number(rows) || 5)));
    var nCount = Math.max(2, Math.min(COMPX_GRID_MAX, Math.round(Number(count) || 12)));
    var gap = Math.max(1, Number(spacing) || 120);
    var rad = Math.max(1, Number(radius) || 300);

    var total = kind === "rect" ? nCols * nRows : nCount;
    if (total > COMPX_GRID_MAX) {
      return toolResult(false, "That is " + total + " cells. Keep it to " + COMPX_GRID_MAX + " or fewer.");
    }

    var source = layers[0];
    if (source.locked) return toolResult(false, "The selected layer is locked.");

    app.beginUndoGroup("Orbit Grid");
    undoOpen = true;

    var rig = compxGridFindRig(comp);
    if (!rig) {
      rig = comp.layers.addNull(comp.duration);
      rig.name = COMPX_GRID_RIG;
      rig.property("ADBE Transform Group").property("ADBE Position")
         .setValue([comp.width / 2, comp.height / 2, 0]);
      rig.moveToBeginning();
    }
    rig.threeDLayer = true;
    compxMorphTag(rig, "COMPX_GRID_RIG " + COMPX_MORPH_GEN);

    compxGridSlider(rig, "Columns", nCols);
    compxGridSlider(rig, "Spacing X", gap);
    compxGridSlider(rig, "Spacing Y", gap);
    compxGridSlider(rig, "Radius", rad);
    compxGridSlider(rig, "Angle", 0);

    var expr = compxGridExpression(kind, total);
    var made = 0, i;

    for (i = 0; i < total; i++) {
      var cell = source.duplicate();
      cell.name = source.name + " " + (i + 1);
      // Sphere places cells on the z axis, so those have to be 3D.
      if (kind === "sphere") cell.threeDLayer = true;
      try { cell.parent = rig; } catch (eP) { compxAuditFallback("HOST_GRID_PARENT_001", eP); }
      compxGridSlider(cell, "Grid Index", i);
      var posProp = cell.property("ADBE Transform Group").property("ADBE Position");
      try {
        posProp.expression = expr;
      } catch (eE) { compxAuditFallback("HOST_GRID_EXPR_001", eE); }
      compxMorphTag(cell, COMPX_MORPH_GEN);
      made++;
    }

    source.enabled = false;
    compxMorphTag(source, COMPX_MORPH_TAG);
    try { rig.selected = true; } catch (eS) { compxAuditFallback("HOST_GRID_SEL_001", eS); }

    app.endUndoGroup();
    undoOpen = false;

    var label = kind === "rect" ? nCols + " x " + nRows + " grid" : (kind === "sphere" ? "sphere" : "ring") + " of " + total;
    return toolResult(true, label + " built. The sliders on " + COMPX_GRID_RIG + " drive it live.");
  } catch (e) {
    if (undoOpen) try { app.endUndoGroup(); } catch (eEnd) { compxAuditFallback("HOST_GRID_UNDO_001", eEnd); }
    return toolResult(false, "Grid error: " + String(e));
  }
}

// 2. PROXIMITY — a null that swells or fades the cells nearest it
function ae_gridProximity(falloff, strength, affect) {
  var undoOpen = false;
  try {
    if (!isAfterEffects()) return toolResult(false, "Proximity is available in After Effects only.");
    var comp = getActiveComp();
    if (!comp) return toolResult(false, "Open a composition first.");

    var rig = compxGridFindRig(comp);
    if (!rig) return toolResult(false, "Build a grid first — proximity drives the cells under " + COMPX_GRID_RIG + ".");

    var range = Math.max(10, Number(falloff) || 400);
    var power = Math.max(-200, Math.min(200, Number(strength) || 60));
    var target = String(affect || "scale");

    app.beginUndoGroup("Orbit Grid Proximity");
    undoOpen = true;

    // Number the effectors so several can push on the same grid.
    var n = 1, i, layer;
    for (i = 1; i <= comp.numLayers; i++) {
      layer = comp.layer(i);
      if (layer.name.indexOf("Grid Effector ") === 0) n++;
    }
    var name = "Grid Effector " + n;

    var effector = comp.layers.addNull(comp.duration);
    effector.name = name;
    effector.threeDLayer = true;
    effector.property("ADBE Transform Group").property("ADBE Position")
            .setValue([comp.width / 2, comp.height / 2, 0]);
    compxGridSlider(effector, "Falloff", range);
    compxGridSlider(effector, "Strength", power);
    compxMorphTag(effector, COMPX_MORPH_GEN);

    // Distance is measured in comp space so it stays right whatever the
    // rig's own position, rotation or scale happen to be.
    var head =
      "// COMPX_GRID_PROX\n" +
      "try {\n" +
      '  var e = thisComp.layer("' + name + '");\n' +
      '  var R = Math.max(1, e.effect("Falloff")(1));\n' +
      '  var S = e.effect("Strength")(1) / 100;\n' +
      "  var d = length(thisLayer.toComp(thisLayer.transform.anchorPoint), e.toComp([0,0,0]));\n" +
      "  var k = Math.max(0, 1 - d / R);\n";
    var tail = "\n} catch (err) {\n  value;\n}";

    var applied = 0;
    for (i = 1; i <= comp.numLayers; i++) {
      layer = comp.layer(i);
      var parent = null;
      try { parent = layer.parent; } catch (eP) { parent = null; }
      if (!parent || parent !== rig) continue;

      var tr = layer.property("ADBE Transform Group");
      if (target === "opacity") {
        var op = tr.property("ADBE Opacity");
        if (op && !op.expressionEnabled) {
          op.expression = head + "  value * (1 - k * S);" + tail;
          applied++;
        }
      } else {
        var sc = tr.property("ADBE Scale");
        if (sc && !sc.expressionEnabled) {
          sc.expression = head + "  value * (1 + k * S);" + tail;
          applied++;
        }
      }
    }

    app.endUndoGroup();
    undoOpen = false;

    if (applied === 0) return toolResult(false, "No free cells to drive — they may already carry an expression on that property.");
    return toolResult(true, name + " added, driving " + target + " on " + applied + " cells. Move it in the comp to see it work.");
  } catch (e) {
    if (undoOpen) try { app.endUndoGroup(); } catch (eEnd) { compxAuditFallback("HOST_GRID_PROX_UNDO_001", eEnd); }
    return toolResult(false, "Proximity error: " + String(e));
  }
}
