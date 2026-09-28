function E3D() {
    app.beginUndoGroup("Convert Paths to Masks (Preserve True Position v2)");

    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
        alert("Select a composition first.");
        return;
    }

    var sel = comp.selectedLayers;
    if (sel.length < 1) {
        alert("Select a shape layer first.");
        return;
    }

    var layer = sel[0];
    if (layer.matchName !== "ADBE Vector Layer") {
        alert("Selected layer is not a shape layer.");
        return;
    }

    // make sure we have an AVLayer reference (avoid accidental shadowing)
    var avLayer = comp.layer(layer.index);

    var nullLayer = comp.layers.addNull();
    nullLayer.name = layer.name + "_Masks";

    var root = layer.property("ADBE Root Vectors Group");

    // 2D affine matrix multiply/compose helpers
    function mulMat(a, b) {
        // a and b are [a,b,c,d,tx,ty] (row-major 2x3)
        return [
            a[0] * b[0] + a[2] * b[1],
            a[1] * b[0] + a[3] * b[1],
            a[0] * b[2] + a[2] * b[3],
            a[1] * b[2] + a[3] * b[3],
            a[0] * b[4] + a[2] * b[5] + a[4],
            a[1] * b[4] + a[3] * b[5] + a[5]
        ];
    }
    function applyMat(pt, m) {
        return [pt[0] * m[0] + pt[1] * m[2] + m[4],
                pt[0] * m[1] + pt[1] * m[3] + m[5]];
    }

    // accumulate transforms from current group up to root (group-local transforms)
    function getGroupMatrix(group) {
        var m = [1,0,0,1,0,0];
        while (group && group.matchName !== "ADBE Root Vectors Group") {
            var tr = group.property("ADBE Vector Transform Group");
            if (tr) {
                var pos = tr.property("ADBE Vector Position").value;
                var anchor = (tr.property("ADBE Vector Anchor") ? tr.property("ADBE Vector Anchor").value : [0,0]);
                var scale = (tr.property("ADBE Vector Scale") ? tr.property("ADBE Vector Scale").value : [100,100]);
                var rot = (tr.property("ADBE Vector Rotation") ? tr.property("ADBE Vector Rotation").value : 0) * Math.PI/180;

                var scx = scale[0]/100, scy = scale[1]/100;
                var cosr = Math.cos(rot), sinr = Math.sin(rot);

                // local matrix that accounts for anchor (translate(-anchor) -> scale/rotate -> translate(pos + anchor-adjust))
                // build matrix as [a,b,c,d,tx,ty]
                var a =  cosr * scx;
                var b =  sinr * scx;
                var c = -sinr * scy;
                var d =  cosr * scy;
                var tx = pos[0] - (anchor[0]*a + anchor[1]*c);
                var ty = pos[1] - (anchor[0]*b + anchor[1]*d);

                var lm = [a,b,c,d,tx,ty];
                m = mulMat(lm, m); // lm * m
            }
            group = group.parentProperty;
        }
        return m;
    }

    // safe toComp wrapper using avLayer; falls back to approximate transform if toComp throws
    function safeToComp(pt2d) {
        try {
            // ensure array [x,y] or [x,y,z]
            return avLayer.toComp([pt2d[0], pt2d[1], 0]);
        } catch (e) {
            // fallback: add layer position (approximate; for most 2D cases)
            var p = avLayer.property("Transform").property("Position").value;
            return [pt2d[0] + p[0], pt2d[1] + p[1], 0];
        }
    }

    function copyShapePaths(group, targetLayer) {
        for (var i = 1; i <= group.numProperties; i++) {
            var prop = group.property(i);

            if (prop.matchName === "ADBE Vector Group" || prop.matchName === "ADBE Vectors Group") {
                copyShapePaths(prop, targetLayer);
            } else if (prop.matchName === "ADBE Vector Shape - Group") {
                var pathProp = prop.property("ADBE Vector Shape");
                if (!pathProp) continue;

                var shape = pathProp.value;
                var parentGroup = prop.parentProperty;
                var groupMatrix = getGroupMatrix(parentGroup); // transform from group-local to layer-local

                var verts = shape.vertices;
                var inTang = shape.inTangents;
                var outTang = shape.outTangents;

                if (!verts || verts.length === 0) continue;

                var newVerts = [], newIn = [], newOut = [];

                for (var v = 0; v < verts.length; v++) {
                    var localV = verts[v];
                    var localIn = [localV[0] + inTang[v][0], localV[1] + inTang[v][1]];
                    var localOut = [localV[0] + outTang[v][0], localV[1] + outTang[v][1]];

                    // apply group matrix -> layer-local coords
                    var layerV = applyMat(localV, groupMatrix);
                    var layerIn = applyMat(localIn, groupMatrix);
                    var layerOut = applyMat(localOut, groupMatrix);

                    // convert layer-local -> comp
                    var compV = safeToComp(layerV);
                    var compIn = safeToComp(layerIn);
                    var compOut = safeToComp(layerOut);

                    // mask vertices are 2D; toComp returns [x,y,z]
                    var compV2 = [compV[0], compV[1]];
                    newVerts.push(compV2);

                    newIn.push([compIn[0] - compV[0], compIn[1] - compV[1]]);
                    newOut.push([compOut[0] - compV[0], compOut[1] - compV[1]]);
                }

                var newShape = new Shape();
                newShape.vertices = newVerts;
                newShape.inTangents = newIn;
                newShape.outTangents = newOut;
                newShape.closed = shape.closed;

                var mask = targetLayer.Masks.addProperty("ADBE Mask Atom");
                mask.name = parentGroup.name + "_mask";
                mask.property("ADBE Mask Shape").setValue(newShape);
            }
        }
    }

    copyShapePaths(root, nullLayer);

    app.endUndoGroup();
}


function aE3D() {

app.beginUndoGroup("Create Masks From Selected Shape");

var sel = app.project.activeItem.selectedLayers[0];
if (!sel || sel.matchName !== "ADBE Vector Layer") {
    alert("Select a shape layer first.");
} else {
    var comp = app.project.activeItem;
    var shapeLayer = sel;
    var root = shapeLayer.property("ADBE Root Vectors Group");
    var maskLayers = [];

    // --- helpers ---
    function mulMat(a, b) {
        return [
            a[0]*b[0] + a[2]*b[1],
            a[1]*b[0] + a[3]*b[1],
            a[0]*b[2] + a[2]*b[3],
            a[1]*b[2] + a[3]*b[3],
            a[0]*b[4] + a[2]*b[5] + a[4],
            a[1]*b[4] + a[3]*b[5] + a[5]
        ];
    }
    function applyMat(pt, m) {
        return [pt[0]*m[0] + pt[1]*m[2] + m[4], pt[0]*m[1] + pt[1]*m[3] + m[5]];
    }
    function getGroupMatrix(group) {
        var m = [1,0,0,1,0,0];
        while (group && group.matchName !== "ADBE Root Vectors Group") {
            var tr = group.property("ADBE Vector Transform Group");
            if (tr) {
                var pos = tr.property("ADBE Vector Position").value;
                var anchor = tr.property("ADBE Vector Anchor") ? tr.property("ADBE Vector Anchor").value : [0,0];
                var scale = tr.property("ADBE Vector Scale") ? tr.property("ADBE Vector Scale").value : [100,100];
                var rot = tr.property("ADBE Vector Rotation") ? tr.property("ADBE Vector Rotation").value : 0;
                rot *= Math.PI/180;
                var scx = scale[0]/100, scy = scale[1]/100;
                var cosr = Math.cos(rot), sinr = Math.sin(rot);
                var a = cosr*scx, b = sinr*scx, c = -sinr*scy, d = cosr*scy;
                var tx = pos[0] - (anchor[0]*a + anchor[1]*c);
                var ty = pos[1] - (anchor[0]*b + anchor[1]*d);
                m = mulMat([a,b,c,d,tx,ty], m);
            }
            group = group.parentProperty;
        }
        return m;
    }
    function safeToComp(pt2d) {
        try { return shapeLayer.toComp([pt2d[0], pt2d[1], 0]); }
        catch (e) {
            var p = shapeLayer.property("Transform").property("Position").value;
            return [pt2d[0]+p[0], pt2d[1]+p[1], 0];
        }
    }

    function copyAllShapes(group, targetLayer) {
        for (var i = 1; i <= group.numProperties; i++) {
            var p = group.property(i);
            if (p.matchName === "ADBE Vector Shape - Group") {
                var pathProp = p.property("ADBE Vector Shape");
                if (!pathProp) continue;
                var path = pathProp.value;
                var m = getGroupMatrix(p.parentProperty);
                var verts = path.vertices, inTang = path.inTangents, outTang = path.outTangents;
                if (!verts || verts.length === 0) continue;

                var newVerts = [], newIn = [], newOut = [];
                for (var v = 0; v < verts.length; v++) {
                    var lv = verts[v];
                    var lin = [lv[0]+inTang[v][0], lv[1]+inTang[v][1]];
                    var lout = [lv[0]+outTang[v][0], lv[1]+outTang[v][1]];

                    var layerV = applyMat(lv, m);
                    var layerIn = applyMat(lin, m);
                    var layerOut = applyMat(lout, m);

                    var cv = safeToComp(layerV);
                    var ci = safeToComp(layerIn);
                    var co = safeToComp(layerOut);

                    newVerts.push([cv[0], cv[1]]);
                    newIn.push([ci[0]-cv[0], ci[1]-cv[1]]);
                    newOut.push([co[0]-cv[0], co[1]-cv[1]]);
                }

                var newShape = new Shape();
                newShape.vertices = newVerts;
                newShape.inTangents = newIn;
                newShape.outTangents = newOut;
                newShape.closed = path.closed;

                var mask = targetLayer.Masks.addProperty("Mask");
                mask.name = p.parentProperty.name + "_mask";
                mask.property("ADBE Mask Shape").setValue(newShape);
                var modeProp = mask.property("ADBE Mask Mode");
                if (modeProp) modeProp.setValue(1); // Add
            } else if (p.matchName === "ADBE Vector Group" || p.matchName === "ADBE Vectors Group") {
                copyAllShapes(p, targetLayer);
            }
        }
    }

    // --- per top-level group ---
    for (var g = 1; g <= root.numProperties; g++) {
        var grp = root.property(g);
        if (!grp || grp.matchName !== "ADBE Vector Group") continue;

        var solid = comp.layers.addSolid([1,1,1], "Mask_" + grp.name, comp.width, comp.height, comp.pixelAspect, comp.duration);
        copyAllShapes(grp, solid);
        solid.moveBefore(shapeLayer);
        maskLayers.push(solid);
    }

}

app.endUndoGroup();


}





















function LIGHTRIG(_path) {
    var path = _path;
    var comp = app.project.activeItem;
    var renderer = comp.renderer;
    if (!(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return;
    }

    var layerPath = path + "/Light.ffx";
    layerPath = layerPath.replace(/'/g, '');

    var orbitController = comp.layers.addNull();
    orbitController.applyPreset(File(layerPath));
    orbitController.name = "Light Rig";

    orbitController.property("Transform").property("Position").setValue([comp.width / 2, comp.height / 2]);

    var light1 = comp.layers.addLight("Light 1", [comp.width / 2, comp.height / 2]);
    light1.lightType = LightType.PARALLEL;
    light1.shy = true;

    var light2 = comp.layers.addLight("Light 2", [comp.width / 2, comp.height / 2]);
    light2.lightType = LightType.PARALLEL;
    light2.shy = true;

    var light3 = comp.layers.addLight("Light 3", [comp.width / 2, comp.height / 2]);
    light3.lightType = LightType.PARALLEL;
    light3.shy = true;

    orbitController.effect("Pseudo/gg.light")("Pseudo/gg.light-0012").setValue(120);
    orbitController.effect("Pseudo/gg.light")("Pseudo/gg.light-0019").setValue(240);
    orbitController.effect("Pseudo/gg.light")("Pseudo/gg.light-0001").setValue(2000);
    orbitController.effect("Pseudo/gg.light")("Pseudo/gg.light-0008").setValue(100);
    orbitController.effect("Pseudo/gg.light")("Pseudo/gg.light-0015").setValue(100);
    orbitController.effect("Pseudo/gg.light")("Pseudo/gg.light-0022").setValue(100);

    if (renderer === "ADBE Advanced 3d" || renderer === "ADBE Calder") {
        orbitController.effect("Pseudo/gg.light")("Pseudo/gg.light-0026").setValue(50);
    } else {
        orbitController.effect("Pseudo/gg.light")("Pseudo/gg.light-0026").setValue(2500);
    }

    // offset expressions
    var sliders_0025 = ["Pseudo/gg.light-0005", "Pseudo/gg.light-0012", "Pseudo/gg.light-0019"];
    for (var i = 0; i < sliders_0025.length; i++) {
        orbitController.property("ADBE Effect Parade")
            .property("Pseudo/gg.light")
            .property(sliders_0025[i]).expression =
            "base = value;\n" +
            "offset = thisLayer.effect('Pseudo/gg.light')('Pseudo/gg.light-0025');\n" +
            "base + offset;";
    }

    var sliders_0026 = ["Pseudo/gg.light-0008", "Pseudo/gg.light-0015", "Pseudo/gg.light-0022"];
    for (var j = 0; j < sliders_0026.length; j++) {
        orbitController.property("ADBE Effect Parade")
            .property("Pseudo/gg.light")
            .property(sliders_0026[j]).expression =
            "base = value;\n" +
            "offset = thisLayer.effect('Pseudo/gg.light')('Pseudo/gg.light-0026');\n" +
            "base + offset;";
    }

    // --- LIGHT 1 EXPRESSION ---
    var light1Expression =
    "var center = thisComp.layer('Light Rig').transform.position;\n" +
    "var radius = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0001');\n" +
    "var angle = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0005');\n" +
    "var distance = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0007');\n" +
    "var height = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0006');\n" +
    "var rigHeight = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0002');\n" +
    "var flip = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0027');\n" +
    "var radians = degreesToRadians(angle);\n" +
    "if (flip == 1) {\n" +
    "  var x = center[0] + Math.cos(radians) * (radius + distance);\n" +
    "  var y = center[1] - rigHeight - height;\n" +
    "  var z = Math.sin(radians) * (radius + distance);\n" +
    "} else {\n" +
    "  var x = center[0] + Math.cos(radians) * (radius + distance);\n" +
    "  var y = center[1] + Math.sin(radians) * (radius + distance);\n" +
    "  var z = -rigHeight - height;\n" +
    "}\n" +
    "[x, y, z];";
    light1.property("Transform").property("Position").expression = light1Expression;

    // --- LIGHT 2 EXPRESSION ---
    var light2Expression =
    "var center = thisComp.layer('Light Rig').transform.position;\n" +
    "var radius = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0001');\n" +
    "var angle = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0012');\n" +
    "var distance = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0014');\n" +
    "var height = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0013');\n" +
    "var rigHeight = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0002');\n" +
    "var flip = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0027');\n" +
    "var radians = degreesToRadians(angle);\n" +
    "if (flip == 1) {\n" +
    "  var x = center[0] + Math.cos(radians) * (radius + distance);\n" +
    "  var y = center[1] - rigHeight - height;\n" +
    "  var z = Math.sin(radians) * (radius + distance);\n" +
    "} else {\n" +
    "  var x = center[0] + Math.cos(radians) * (radius + distance);\n" +
    "  var y = center[1] + Math.sin(radians) * (radius + distance);\n" +
    "  var z = -rigHeight - height;\n" +
    "}\n" +
    "[x, y, z];";
    light2.property("Transform").property("Position").expression = light2Expression;

    // --- LIGHT 3 EXPRESSION ---
    var light3Expression =
    "var center = thisComp.layer('Light Rig').transform.position;\n" +
    "var radius = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0001');\n" +
    "var angle = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0019');\n" +
    "var distance = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0021');\n" +
    "var height = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0020');\n" +
    "var rigHeight = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0002');\n" +
    "var flip = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0027');\n" +
    "var radians = degreesToRadians(angle);\n" +
    "if (flip == 1) {\n" +
    "  var x = center[0] + Math.cos(radians) * (radius + distance);\n" +
    "  var y = center[1] - rigHeight - height;\n" +
    "  var z = Math.sin(radians) * (radius + distance);\n" +
    "} else {\n" +
    "  var x = center[0] + Math.cos(radians) * (radius + distance);\n" +
    "  var y = center[1] + Math.sin(radians) * (radius + distance);\n" +
    "  var z = -rigHeight - height;\n" +
    "}\n" +
    "[x, y, z];";
    light3.property("Transform").property("Position").expression = light3Expression;

    var pointOfInterestExpression =
    "var targetLayerIndex = thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0003');\n" +
    "if (targetLayerIndex > 0 && targetLayerIndex <= thisComp.numLayers) {\n" +
    "  var targetLayer = thisComp.layer(targetLayerIndex);\n" +
    "  if (targetLayer.hasProperty('Transform') && targetLayer.property('Transform').hasProperty('Position')) {\n" +
    "    targetLayer.transform.position;\n" +
    "  } else {\n" +
    "    thisComp.layer('Light Rig').transform.position;\n" +
    "  }\n" +
    "} else {\n" +
    "  thisComp.layer('Light Rig').transform.position;\n" +
    "}";
    
    light1.property("Transform").property("Point of Interest").expression = pointOfInterestExpression;
    light2.property("Transform").property("Point of Interest").expression = pointOfInterestExpression;
    light3.property("Transform").property("Point of Interest").expression = pointOfInterestExpression;

    light1.property("ADBE Light Options Group").property("ADBE Light Intensity").expression = "thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0008');";
    light1.property("ADBE Light Options Group").property("ADBE Light Color").expression = "thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0009');";
    light2.property("ADBE Light Options Group").property("ADBE Light Intensity").expression = "thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0015');";
    light2.property("ADBE Light Options Group").property("ADBE Light Color").expression = "thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0016');";
    light3.property("ADBE Light Options Group").property("ADBE Light Intensity").expression = "thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0022');";
    light3.property("ADBE Light Options Group").property("ADBE Light Color").expression = "thisComp.layer('Light Rig').effect('Pseudo/gg.light')('Pseudo/gg.light-0023');";

    comp.hideShyLayers = true;

    light1.property("ADBE Light Options Group").property("ADBE Light Falloff Type").setValue(3);
    light2.property("ADBE Light Options Group").property("ADBE Light Falloff Type").setValue(3);
    light3.property("ADBE Light Options Group").property("ADBE Light Falloff Type").setValue(3);
    light3.property("ADBE Light Options Group").property("ADBE Casts Shadows").setValue(1);
}





function STACKER(_path) {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return;
    }

    var originalSelection = [];
    for (var i = 0; i < comp.selectedLayers.length; i++) {
        originalSelection.push(comp.selectedLayers[i]);
    }

    if (originalSelection.length === 0) {
        alert("Please select at least one layer.");
        return;
    }

    app.beginUndoGroup("Z STACKER Setup");

    // === MAKE ALL SELECTED LAYERS 3D ===
    for (var i = 0; i < originalSelection.length; i++) {
        var layer = originalSelection[i];
        if (!layer.threeDLayer) {
            layer.threeDLayer = true;
        }
    }

    // === PHASE 1: CREATE MASTER LAYER IF NEEDED ===
    var masterLayer = null;
    for (var i = 1; i <= comp.numLayers; i++) {
        if (comp.layer(i).name === "Master Layer") {
            masterLayer = comp.layer(i);
            break;
        }
    }

    if (!masterLayer) {
        masterLayer = comp.layers.addShape();
        masterLayer.name = "Master Layer";
        masterLayer.moveToEnd();

        var ffxPath = _path + "/Stacker.ffx";
        ffxPath = ffxPath.replace(/'/g, '');
        var ffxFile = new File(ffxPath);

        try {
            masterLayer.applyPreset(ffxFile);
        } catch (e) {
            alert("Error applying preset: " + e.toString());
            app.endUndoGroup();
            return;
        }
    } else {
        for (var i = 1; i <= comp.numLayers; i++) {
            comp.layer(i).selected = false;
        }

        masterLayer.selected = true;

        var ffxPath = _path + "/Stacker.ffx";
        ffxPath = ffxPath.replace(/'/g, '');
        var ffxFile = new File(ffxPath);
        masterLayer.applyPreset(ffxFile);
    }

    // === PHASE 2: APPLY EXPRESSIONS ===
    function getMasterExpr(id) {
        return 'comp("' + comp.name + '").layer("Master Layer")("ADBE Effect Parade")("Pseudo/gg.stacker")("' + id + '")';
    }

    var modeExpr = getMasterExpr("Pseudo/gg.stacker-0001");
    var paddingExpr = getMasterExpr("Pseudo/gg.stacker-0002");
    var multiplierExpr = getMasterExpr("Pseudo/gg.stacker-0003");
    var baseZExpr = getMasterExpr("Pseudo/gg.stacker-0004");

    var totalLayers = originalSelection.length;

    for (var i = 0; i < totalLayers; i++) {
        var layer = originalSelection[i];

        var expr =
        "var mode = " + modeExpr + ";\n" +
        "var padding = " + paddingExpr + ";\n" +
        "var mult = " + multiplierExpr + ";\n" +
        "var baseZ = " + baseZExpr + ";\n" +
        "var idx = " + i + ";\n" +
        "var count = " + totalLayers + ";\n" +
        "var z = 0;\n" +
        "function getStackedZ(start, end, dir) {\n" +
        "  var val = 0;\n" +
        "  for (var i = start; i <= end; i++) {\n" +
        "    val += padding * ((mode == 1) ? 1 : Math.pow(mult/50, i));\n" + // <<< logic change here
        "  }\n" +
        "  return val * dir;\n" +
        "}\n" +
        "if (mode == 1) {\n" + // Uniform mode
        "  z = baseZ + (padding * idx);\n" +
        "} else if (mode == 2) {\n" + // Stacked from top
        "  z = baseZ + getStackedZ(0, idx, 1);\n" +
        "} else if (mode == 3) {\n" + // Stacked from bottom
        "  z = baseZ + getStackedZ(0, count - 1 - idx, 1);\n" +
        "} else if (mode == 4) {\n" + // Center stack
        "  var center = Math.floor(count / 2);\n" +
        "  var offset = Math.abs(idx - center);\n" +
        "  z = baseZ + getStackedZ(0, offset, (idx >= center ? 1 : -1));\n" +
        "}\n" +
        "value + [0,0,z];";

        layer.property("Transform").property("Position").expression = expr;
    }

    // === RESTORE ORIGINAL SELECTION ===
    for (var i = 1; i <= comp.numLayers; i++) {
        comp.layer(i).selected = false;
    }
    for (var i = 0; i < originalSelection.length; i++) {
        originalSelection[i].selected = true;
    }

    app.endUndoGroup();
}







function E3DB(_path) {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
        alert("Select a composition first.");
        return;
    }

    var selectedLayers = comp.selectedLayers;
    app.beginUndoGroup("E3DB");

    var e3dSolid, e3d;
    var maskLayers = [];
    var textureLayers = [];
    var textLayers = [];

    function createE3D() {
        e3dSolid = comp.layers.addSolid([0.3, 0.3, 0.3], "Element 3D", comp.width, comp.height, comp.pixelAspect, comp.duration);
        e3d = e3dSolid.property("ADBE Effect Parade").addProperty("VIDEOCOPILOT 3DArray");
        try { e3d.property("VIDEOCOPILOT 3DArray-1252").setValue(true); } catch (e) {}
        try { e3d.property("VIDEOCOPILOT 3DArray-5102").setValue(true); } catch (e) {}
        try { e3d.property("VIDEOCOPILOT 3DArray-0302").setValue(true); } catch (e) {}
        return e3dSolid;
    }

    function copyShapeToMask(shapeLayer) {
        var solid = comp.layers.addSolid([1, 1, 1], "E3D Mask " + shapeLayer.name, comp.width, comp.height, comp.pixelAspect, comp.duration);
        var rootGroup = shapeLayer.property("ADBE Root Vectors Group");
        function walk(group) {
            for (var i = 1; i <= group.numProperties; i++) {
                var p = group.property(i);
                if (p.matchName === "ADBE Vector Group" || p.matchName === "ADBE Vectors Group") walk(p);
                else if (p.matchName === "ADBE Vector Shape - Group") {
                    var path = p.property("ADBE Vector Shape");
                    if (path) {
                        var m = solid.Masks.addProperty("ADBE Mask Atom");
                        m.name = p.parentProperty.name + "_mask";
                        m.property("ADBE Mask Shape").setValue(path.value);
                    }
                }
            }
        }
        walk(rootGroup);
        solid.moveBefore(shapeLayer);
        shapeLayer.enabled = false;
        return solid;
    }

    // === CASE 1: nothing selected ===
    if (selectedLayers.length === 0) {
        var solid = createE3D();
        return;
    }

    // === CASES 2–6: something selected ===
    for (var i = 0; i < selectedLayers.length; i++) {
        var l = selectedLayers[i];
        if (l.matchName === "ADBE Text Layer") textLayers.push(l);
        else if (l.matchName === "ADBE Vector Layer") maskLayers.push(copyShapeToMask(l));
        else if (l.nullLayer && l.Masks.numProperties > 0) maskLayers.push(l);
        else if (l.matchName === "ADBE AV Layer") textureLayers.push(l);
    }

    // === CASE 6: multiple selections ===
    // This is handled naturally by arrays above

    // Precompose shapes as textures
    for (var j = 0; j < textureLayers.length; j++) {
        var t = textureLayers[j];
        if (t.matchName === "ADBE Vector Layer") {
            var pre = comp.layers.precompose([t.index], "E3D_Texture_" + t.name, true);
            textureLayers[j] = comp.layer("E3D_Texture_" + t.name);
        }
    }

    var solid = createE3D();

    // assign textures
    if (textureLayers.length > 0) {
        try { e3d.property("VIDEOCOPILOT 3DArray-1852").setValue(textureLayers[0].index); } catch (err) {}
    }

    // assign mask (nulls, shapes)
    if (maskLayers.length > 0) {
        try { e3d.property("VIDEOCOPILOT 3DArray-1802").setValue(maskLayers[0].index); } catch (err) {}
    }

    // assign text
    if (textLayers.length > 0) {
        try { e3d.property("VIDEOCOPILOT 3DArray-1902").setValue(textLayers[0].index); } catch (err) {}
    }

    // hide input layers
    for (var h = 0; h < maskLayers.length; h++) maskLayers[h].enabled = false;
    for (var h2 = 0; h2 < textureLayers.length; h2++) textureLayers[h2].enabled = false;
    for (var h3 = 0; h3 < textLayers.length; h3++) textLayers[h3].enabled = false;

    app.endUndoGroup();
}











function CAMERA(_path) {
    var path = _path;
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return;
    }

    var layerPath = path + "/Camera.ffx";
    layerPath = layerPath.replace(/'/g, '');
    var w = comp.width / 2;
    var h = comp.height / 2;

    var nullMaster = comp.layers.addShape();
    nullMaster.guideLayer = true;
    nullMaster.name = "Camera Rig";
    nullMaster.threeDLayer = true;
    nullMaster.applyPreset(File(layerPath));

    var cameraRigEffect = nullMaster.property("ADBE Effect Parade").property("Pseudo/gg.camera2");
    cameraRigEffect.property("Pseudo/gg.camera2-0008").setValue(0);
    cameraRigEffect.property("Pseudo/gg.camera2-0009").setValue(10);
    cameraRigEffect.property("Pseudo/gg.camera2-0021").setValue(5);
    cameraRigEffect.property("Pseudo/gg.camera2-0022").setValue(1);

    nullMaster("Effects")(1).name = "Camera Rig";

    // --- X null ---
    var nullX = comp.layers.addShape();
    nullX.guideLayer = true;
    nullX.name = "Camera X";
    nullX.threeDLayer = true;
    nullX.shy = true;
    nullX.enabled = false;
    nullX.parent = nullMaster;
    nullX.moveAfter(nullMaster);

    nullX.property("Transform").property("ADBE Rotate Y").expression =
        "cam = thisComp.layer('Camera Rig').effect('Camera Rig');\n" +
        "cam('X Rotation') + (time * cam('X Rotate'));";

    // --- Y null ---
    var nullY = comp.layers.addShape();
    nullY.name = "Camera Y";
    nullY.guideLayer = true;
    nullY.threeDLayer = true;
    nullY.shy = true;
    nullY.enabled = false;
    nullY.parent = nullX;
    nullY.moveAfter(nullX);

    nullY.property("Transform").property("ADBE Rotate X").expression =
        "cam = thisComp.layer('Camera Rig').effect('Camera Rig');\n" +
        "cam('Y Rotation') + (time * cam('Y Rotate'));";

    // --- Z null ---
    var nullZ = comp.layers.addShape();
    nullZ.name = "Camera Z";
    nullZ.guideLayer = true;
    nullZ.threeDLayer = true;
    nullZ.shy = true;
    nullZ.enabled = false;
    nullZ.parent = nullY;
    nullZ.moveAfter(nullY);

    nullZ.property("Transform").property("ADBE Rotate Z").expression =
        "cam = thisComp.layer('Camera Rig').effect('Camera Rig');\n" +
        "cam('Z Rotation') + (time * cam('Z Rotate'));";

    comp.hideShyLayers = true;

    var newCam = comp.layers.addCamera("Rigged Camera", [w, h]);
    newCam.parent = nullZ;
    newCam.moveAfter(nullZ);

    nullMaster.property("Position").dimensionsSeparated = true;

    // --- X Position ---
// --- X Position ---
nullMaster.property("Transform").property("X Position").expression =
"cam = thisComp.layer('Camera Rig').effect('Camera Rig');\n" +
"spd = cam('Speed');\n" +
"base = cam('X Position');\n" +
"mov = cam('X Movement');\n" +
"base + time * mov * spd;";

// --- Y Position ---
nullMaster.property("Transform").property("Y Position").expression =
"cam = thisComp.layer('Camera Rig').effect('Camera Rig');\n" +
"spd = cam('Speed');\n" +
"base = cam('Y Position');\n" +
"mov = cam('Y Movement');\n" +
"base + time * mov * spd;";

// --- Z Position ---
nullMaster.property("Transform").property("Z Position").expression =
"cam = thisComp.layer('Camera Rig').effect('Camera Rig');\n" +
"spd = cam('Speed');\n" +
"base = cam('Z Position');\n" +
"mov = cam('Z Movement');\n" +
"base + time * mov * spd;";


    newCam.locked = true;
    newCam.property("Transform").property("Point of Interest").expression =
        "transform.position;";

    newCam.property("ADBE Transform Group").property("ADBE Position").expression =
        "cam = thisComp.layer('Camera Rig').effect('Camera Rig');\n" +
        "pos = -[0, 0, cameraOption.zoom] +\n" +
        "      [0, 0, cam('Zoom')] +\n" +
        "      [cam('X Position'), cam('Y Position'), cam('Z Position')];\n" +
        "pos + wiggle(cam('Frequency'), cam('Amplitude'), cam('Complexity'), 1, time);";

    newCam.property("ADBE Camera Options Group").property("ADBE Camera Zoom").expression =
        "FOV = thisComp.layer('Camera Rig').effect('Camera Rig')('Focal Length');\n" +
        "thisComp.width / (2 * Math.tan(degreesToRadians(FOV / 2)));";

    newCam.position.setValue([0, 0, 0]);
    newCam.pointOfInterest.setValue([0, 0, 0]);
    newCam.selected = false;
    nullMaster.selected = true;

    nullMaster.property("ADBE Transform Group").property("ADBE Orientation").expression =
        "chk = thisComp.layer('Camera Rig').effect('Pseudo/gg.camera2')('Pseudo/gg.camera2-0024');\n" +
        "chk == 1 ? [45, 35, 30] : value;";
}



































function CLEAN() {
    app.beginUndoGroup("Delete All Layers");

    var comp = app.project.activeItem;

    if (comp && comp instanceof CompItem) {
        comp.hideShyLayers = false; // 🔄 Toggle off global shy switch

        for (var i = comp.numLayers; i >= 1; i--) {
            var layer = comp.layer(i);
            layer.locked = false;
            layer.shy = false;
            layer.enabled = true;
            layer.remove();
        }
    }

    app.endUndoGroup();
}


function FLOOR() {

//add accept shadows
//add opacity of checkerobard, venetian blinds size, grid color etc.

    {
        function createDarkGraySolid() {
            var comp = app.project.activeItem;
            if (!(comp instanceof CompItem)) {
                alert("Please select a composition.");
                return;
            }
    
            app.beginUndoGroup("Create Dark Gray Solid with Effects");
    
            // Create the solid
            var solid = comp.layers.addSolid([0.2, 0.2, 0.2], "Background", comp.width, comp.height, 1.0);
            solid.threeDLayer = true; // Make it a 3D layer
            solid.property("Position").setValue([comp.width / 2, comp.height / 2, 500]); // Set Z position to -500
    
            // Add effects
            var fill = solid.property("Effects").addProperty("ADBE Fill");
            fill.property("Color").setValue([0.2, 0.2, 0.2]); // Dark Gray
    
            var transformEffect = solid.property("Effects").addProperty("ADBE Geometry2");
            transformEffect.property("Scale").setValue(300); // Set scale to 300%
    
            var hexTile = solid.property("Effects").addProperty("CC HexTile");
              hexTile.enabled = false; // Correct way to disable the effect
            var grid = solid.property("Effects").addProperty("ADBE Grid");
                grid.enabled = false; // Correct way to disable the effect
            var venetianBlinds = solid.property("Effects").addProperty("ADBE Venetian Blinds");
                    venetianBlinds.enabled = false; // Correct way to disable the effect
    
            var checkerboard = solid.property("Effects").addProperty("ADBE Checkerboard");
            checkerboard.enabled = false; // Correct way to disable the effect
    
            // Correct way to disable effects (Set their first property "Active" to 0)
            solid.moveToEnd();
            app.endUndoGroup();
        }
    
        createDarkGraySolid();
    }
    
}

