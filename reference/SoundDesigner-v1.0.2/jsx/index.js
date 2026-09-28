(function (thisObj) {// ----- EXTENDSCRIPT INCLUDES ------ //"object"!=typeof JSON&&(JSON={}),function(){"use strict";var rx_one=/^[\],:{}\s]*$/,rx_two=/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,rx_three=/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,rx_four=/(?:^|:|,)(?:\s*\[)+/g,rx_escapable=/[\\\"\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,rx_dangerous=/[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,gap,indent,meta,rep;function f(t){return t<10?"0"+t:t}function this_value(){return this.valueOf()}function quote(t){return rx_escapable.lastIndex=0,rx_escapable.test(t)?'"'+t.replace(rx_escapable,function(t){var e=meta[t];return"string"==typeof e?e:"\\u"+("0000"+t.charCodeAt(0).toString(16)).slice(-4)})+'"':'"'+t+'"'}function str(t,e){var r,n,o,u,f,a=gap,i=e[t];switch(i&&"object"==typeof i&&"function"==typeof i.toJSON&&(i=i.toJSON(t)),"function"==typeof rep&&(i=rep.call(e,t,i)),typeof i){case"string":return quote(i);case"number":return isFinite(i)?String(i):"null";case"boolean":case"null":return String(i);case"object":if(!i)return"null";if(gap+=indent,f=[],"[object Array]"===Object.prototype.toString.apply(i)){for(u=i.length,r=0;r<u;r+=1)f[r]=str(r,i)||"null";return o=0===f.length?"[]":gap?"[\n"+gap+f.join(",\n"+gap)+"\n"+a+"]":"["+f.join(",")+"]",gap=a,o}if(rep&&"object"==typeof rep)for(u=rep.length,r=0;r<u;r+=1)"string"==typeof rep[r]&&(o=str(n=rep[r],i))&&f.push(quote(n)+(gap?": ":":")+o);else for(n in i)Object.prototype.hasOwnProperty.call(i,n)&&(o=str(n,i))&&f.push(quote(n)+(gap?": ":":")+o);return o=0===f.length?"{}":gap?"{\n"+gap+f.join(",\n"+gap)+"\n"+a+"}":"{"+f.join(",")+"}",gap=a,o}}"function"!=typeof Date.prototype.toJSON&&(Date.prototype.toJSON=function(){return isFinite(this.valueOf())?this.getUTCFullYear()+"-"+f(this.getUTCMonth()+1)+"-"+f(this.getUTCDate())+"T"+f(this.getUTCHours())+":"+f(this.getUTCMinutes())+":"+f(this.getUTCSeconds())+"Z":null},Boolean.prototype.toJSON=this_value,Number.prototype.toJSON=this_value,String.prototype.toJSON=this_value),"function"!=typeof JSON.stringify&&(meta={"\b":"\\b","\t":"\\t","\n":"\\n","\f":"\\f","\r":"\\r",'"':'\\"',"\\":"\\\\"},JSON.stringify=function(t,e,r){var n;if(gap="",indent="","number"==typeof r)for(n=0;n<r;n+=1)indent+=" ";else"string"==typeof r&&(indent=r);if(rep=e,e&&"function"!=typeof e&&("object"!=typeof e||"number"!=typeof e.length))throw new Error("JSON.stringify");return str("",{"":t})}),"function"!=typeof JSON.parse&&(JSON.parse=function(text,reviver){var j;function walk(t,e){var r,n,o=t[e];if(o&&"object"==typeof o)for(r in o)Object.prototype.hasOwnProperty.call(o,r)&&(void 0!==(n=walk(o,r))?o[r]=n:delete o[r]);return reviver.call(t,e,o)}if(text=String(text),rx_dangerous.lastIndex=0,rx_dangerous.test(text)&&(text=text.replace(rx_dangerous,function(t){return"\\u"+("0000"+t.charCodeAt(0).toString(16)).slice(-4)})),rx_one.test(text.replace(rx_two,"@").replace(rx_three,"]").replace(rx_four,"")))return j=eval("("+text+")"),"function"==typeof reviver?walk({"":j},""):j;throw new SyntaxError("JSON.parse")})}();// ---------------------------------- //// ----- EXTENDSCRIPT PONYFILLS -----function __objectFreeze(obj) { return obj; }// ---------------------------------- //var config = {
  id: "com.rksound.designer"};

var ns = config.id;

var helloVoid = function helloVoid() {
  alert("test");
};
var helloError = function helloError(str) {
  // Intentional Error for Error Handling Demonstration
  
  throw new Error("We're throwing an error");
};
var helloStr = function helloStr(str) {
  alert("ExtendScript received a string: ".concat(str));
  return str;
};
var helloNum = function helloNum(n) {
  alert("ExtendScript received a number: ".concat(n.toString()));
  return n;
};
var helloArrayStr = function helloArrayStr(arr) {
  alert("ExtendScript received an array of ".concat(arr.length, " strings: ").concat(arr.toString()));
  return arr;
};
var helloObj = function helloObj(obj) {
  alert("ExtendScript received an object: ".concat(JSON.stringify(obj)));
  return {
    y: obj.height,
    x: obj.width
  };
};

/** Returns the saved project location used for project-scoped SoundDesigner media. */
function getProjectContext$1() {
  var projectFile;
  var projectName;
  try {
    if (!app.project) {
      return {
        ok: false,
        host: "aftereffects",
        message: "Open an After Effects project before downloading audio."
      };
    }
    if (!app.project.file) {
      return {
        ok: false,
        host: "aftereffects",
        message: "Save the After Effects project before downloading project audio."
      };
    }
    projectFile = app.project.file;
    projectName = String(projectFile.displayName || projectFile.name || "After Effects Project").replace(/\.[^.]+$/, "");
    return {
      ok: true,
      host: "aftereffects",
      projectPath: String(projectFile.fsName),
      projectDirectory: String(projectFile.parent.fsName),
      projectName: projectName,
      message: "Project storage is available."
    };
  } catch (error) {
    return {
      ok: false,
      host: "aftereffects",
      message: error && error.toString ? error.toString() : "The After Effects project location could not be read."
    };
  }
}
function normalizedFilePath(file) {
  var normalized = String(file.fsName || "").replace(/\\/g, "/");
  if (String($.os || "").toLowerCase().indexOf("windows") >= 0) normalized = normalized.toLowerCase();
  return normalized;
}
function findFootageByPath(sourceFile) {
  var targetPath = normalizedFilePath(sourceFile);
  var index;
  var item;
  var footage;
  var footageFile;
  for (index = 1; index <= app.project.numItems; index += 1) {
    item = app.project.item(index);
    if (item instanceof FootageItem) {
      footage = item;
      try {
        footageFile = footage.mainSource.file;
        if (footageFile && normalizedFilePath(footageFile) === targetPath) return footage;
      } catch (_error) {
        // Solids and generated footage do not expose a source file.
      }
    }
  }
  return null;
}
function findOrCreateSoundDesignerFolder() {
  var index;
  var item;
  for (index = 1; index <= app.project.numItems; index += 1) {
    item = app.project.item(index);
    if (item instanceof FolderItem && item.name === "SoundDesigner" && item.parentFolder.id === app.project.rootFolder.id) {
      return item;
    }
  }
  return app.project.items.addFolder("SoundDesigner");
}
function isInsideFolder(item, folder) {
  var parent = item.parentFolder;
  while (parent) {
    if (parent.id === folder.id) return true;
    if (parent.id === app.project.rootFolder.id) return false;
    parent = parent.parentFolder;
  }
  return false;
}
function moveAllFootageToSoundDesigner(sourceFile) {
  var targetPath = normalizedFilePath(sourceFile);
  var matches = [];
  var targetFolder;
  var index;
  var item;
  var footageFile;
  var moved = 0;
  for (index = 1; index <= app.project.numItems; index += 1) {
    item = app.project.item(index);
    if (!(item instanceof FootageItem)) continue;
    try {
      footageFile = item.mainSource.file;
      if (footageFile && normalizedFilePath(footageFile) === targetPath) matches.push(item);
    } catch (_error) {
      // Solids and generated footage do not expose a source file.
    }
  }
  if (!matches.length) return 0;
  targetFolder = findOrCreateSoundDesignerFolder();
  for (index = 0; index < matches.length; index += 1) {
    if (!isInsideFolder(matches[index], targetFolder)) {
      matches[index].parentFolder = targetFolder;
      moved += 1;
    }
  }
  return moved;
}
function countCompositionLayersByPath(composition, sourceFile) {
  var targetPath = normalizedFilePath(sourceFile);
  var count = 0;
  var index;
  var layer;
  var source;
  var footageFile;
  for (index = 1; index <= composition.numLayers; index += 1) {
    layer = composition.layer(index);
    if (!(layer instanceof AVLayer)) continue;
    source = layer.source;
    if (!(source instanceof FootageItem)) continue;
    try {
      footageFile = source.mainSource.file;
      if (footageFile && normalizedFilePath(footageFile) === targetPath) count += 1;
    } catch (_error) {
      // Solids and generated footage do not expose a source file.
    }
  }
  return count;
}

/** Snapshot used to de-duplicate native CEP drops and the AE insertion fallback. */
function getAudioDragState(request) {
  var sourceFile;
  var composition;
  try {
    if (!request || typeof request.path !== "string" || request.path.length === 0) {
      return {
        ok: false,
        host: "aftereffects",
        layerCount: 0,
        message: "No audio file path was provided."
      };
    }
    sourceFile = new File(request.path);
    if (!sourceFile.exists) {
      return {
        ok: false,
        host: "aftereffects",
        layerCount: 0,
        message: "The selected audio file no longer exists."
      };
    }
    if (!app.project || !(app.project.activeItem instanceof CompItem)) {
      return {
        ok: false,
        host: "aftereffects",
        layerCount: 0,
        message: "Activate a composition before dragging audio."
      };
    }
    composition = app.project.activeItem;
    return {
      ok: true,
      host: "aftereffects",
      compositionId: Number(composition.id),
      layerCount: countCompositionLayersByPath(composition, sourceFile),
      message: "After Effects composition is ready for audio drop."
    };
  } catch (error) {
    return {
      ok: false,
      host: "aftereffects",
      layerCount: 0,
      message: error && error.toString ? error.toString() : "Could not inspect the active composition."
    };
  }
}

/** Moves host-imported audio into the shared SoundDesigner Project-panel folder. */
function organizeAudioMedia$1(request) {
  var sourceFile;
  var footage;
  var moved;
  var undoOpen = false;
  try {
    if (!request || typeof request.path !== "string" || request.path.length === 0) {
      return {
        ok: false,
        host: "aftereffects",
        message: "No audio file path was provided."
      };
    }
    sourceFile = new File(request.path);
    if (!app.project) {
      return {
        ok: false,
        host: "aftereffects",
        message: "Open an After Effects project before organizing audio."
      };
    }
    footage = findFootageByPath(sourceFile);
    if (!footage) {
      return {
        ok: false,
        host: "aftereffects",
        message: "The audio project item is not available yet."
      };
    }
    app.beginUndoGroup("SoundDesigner: Organize Audio");
    undoOpen = true;
    moved = moveAllFootageToSoundDesigner(sourceFile) > 0;
    return {
      ok: true,
      host: "aftereffects",
      imported: false,
      message: moved ? "Audio moved into the SoundDesigner folder." : "Audio is already in the SoundDesigner folder."
    };
  } catch (error) {
    return {
      ok: false,
      host: "aftereffects",
      message: error && error.toString ? error.toString() : "Could not organize the After Effects project item."
    };
  } finally {
    if (undoOpen) app.endUndoGroup();
  }
}

/**
 * After Effects host adapter. This TypeScript is compiled to ES3 before CEP loads it.
 * The public function accepts and returns plain JSON-compatible objects only.
 */
function insertAudioClip$1(request) {
  var sourceFile;
  var composition;
  var footage;
  var imported = false;
  var layer;
  var importOptions;
  var undoOpen = false;
  var insertionTime;
  var selectedLayers;
  var selectedIndex;
  try {
    if (!request || typeof request.path !== "string" || request.path.length === 0) {
      return {
        ok: false,
        host: "aftereffects",
        message: "No audio file path was provided."
      };
    }
    sourceFile = new File(request.path);
    if (!sourceFile.exists) {
      return {
        ok: false,
        host: "aftereffects",
        message: "The selected audio file no longer exists."
      };
    }
    if (!app.project) {
      return {
        ok: false,
        host: "aftereffects",
        message: "Open an After Effects project before inserting audio."
      };
    }
    if (!(app.project.activeItem instanceof CompItem)) {
      return {
        ok: false,
        host: "aftereffects",
        message: "Activate a composition before inserting audio."
      };
    }
    composition = app.project.activeItem;
    insertionTime = composition.time;
    if (request.insertionTarget === "selected-clip") {
      selectedLayers = composition.selectedLayers;
      if (!selectedLayers || selectedLayers.length === 0) {
        return {
          ok: false,
          host: "aftereffects",
          message: "Select a composition layer before inserting at the selected layer."
        };
      }
      insertionTime = Number(selectedLayers[0].inPoint);
      for (selectedIndex = 1; selectedIndex < selectedLayers.length; selectedIndex += 1) {
        if (Number(selectedLayers[selectedIndex].inPoint) < insertionTime) {
          insertionTime = Number(selectedLayers[selectedIndex].inPoint);
        }
      }
    }
    app.beginUndoGroup("SoundDesigner: Insert Audio");
    undoOpen = true;
    footage = findFootageByPath(sourceFile);
    if (!footage) {
      importOptions = new ImportOptions(sourceFile);
      footage = app.project.importFile(importOptions);
      imported = true;
    }
    if (!footage) {
      throw new Error("After Effects did not return imported footage.");
    }
    moveAllFootageToSoundDesigner(sourceFile);
    layer = composition.layers.add(footage);
    layer.startTime = insertionTime;
    return {
      ok: true,
      host: "aftereffects",
      imported: imported,
      message: (request.name || sourceFile.displayName) + (request.insertionTarget === "selected-clip" ? " added at the selected layer start." : " added at composition time.")
    };
  } catch (error) {
    return {
      ok: false,
      host: "aftereffects",
      message: error && error.toString ? error.toString() : "Unknown After Effects error."
    };
  } finally {
    if (undoOpen) app.endUndoGroup();
  }
}

var aeft = /*#__PURE__*/__objectFreeze({
  __proto__: null,
  getAudioDragState: getAudioDragState,
  getProjectContext: getProjectContext$1,
  helloArrayStr: helloArrayStr,
  helloError: helloError,
  helloNum: helloNum,
  helloObj: helloObj,
  helloStr: helloStr,
  helloVoid: helloVoid,
  insertAudioClip: insertAudioClip$1,
  organizeAudioMedia: organizeAudioMedia$1
});

/** Returns the saved project location used for project-scoped SoundDesigner media. */
function getProjectContext() {
  var projectPath;
  var projectFile;
  var projectName;
  try {
    if (!app.project) {
      return {
        ok: false,
        host: "premiere",
        message: "Open a Premiere Pro project before downloading audio."
      };
    }
    projectPath = String(app.project.path || "");
    if (!projectPath) {
      return {
        ok: false,
        host: "premiere",
        message: "Save the Premiere Pro project before downloading project audio."
      };
    }
    projectFile = new File(projectPath);
    projectName = String(projectFile.displayName || projectFile.name || "Premiere Project").replace(/\.[^.]+$/, "");
    return {
      ok: true,
      host: "premiere",
      projectPath: String(projectFile.fsName),
      projectDirectory: String(projectFile.parent.fsName),
      projectName: projectName,
      message: "Project storage is available."
    };
  } catch (error) {
    return {
      ok: false,
      host: "premiere",
      message: error && error.toString ? error.toString() : "The Premiere Pro project location could not be read."
    };
  }
}
function normalizePath(value) {
  var normalized = String(value || "").replace(/\\/g, "/");
  if (String($.os || "").toLowerCase().indexOf("windows") >= 0) normalized = normalized.toLowerCase();
  return normalized;
}
function findProjectItem(parent, mediaPath) {
  var children;
  var index;
  var child;
  var childPath;
  var nested;
  try {
    children = parent.children;
    if (!children) return null;
    for (index = 0; index < children.numItems; index += 1) {
      child = children[index];
      try {
        childPath = child.getMediaPath();
        if (childPath && normalizePath(childPath) === mediaPath) return child;
      } catch (_mediaError) {
        // Bins and offline items may not expose a media path.
      }
      try {
        if (child.children && child.children.numItems > 0) {
          nested = findProjectItem(child, mediaPath);
          if (nested) return nested;
        }
      } catch (_childrenError) {
        // Leaf project items do not have traversable children in every version.
      }
    }
  } catch (_error) {
    return null;
  }
  return null;
}
function findOrCreateSoundDesignerBin(root) {
  var children = root.children;
  var index;
  var item;
  for (index = 0; index < children.numItems; index += 1) {
    item = children[index];
    if (item && item.name === "SoundDesigner") {
      try {
        if (item.children) return item;
      } catch (_error) {
        // Continue and create a real bin if a clip has the reserved name.
      }
    }
  }
  return root.createBin("SoundDesigner");
}
function collectProjectItemsOutsideBin(parent, excludedBin, mediaPath, matches) {
  var children;
  var index;
  var child;
  var childPath;
  try {
    if (parent.nodeId === excludedBin.nodeId) return;
    children = parent.children;
    if (!children) return;
    for (index = 0; index < children.numItems; index += 1) {
      child = children[index];
      try {
        childPath = child.getMediaPath();
        if (childPath && normalizePath(childPath) === mediaPath) matches.push(child);
      } catch (_mediaError) {
        // Bins and offline items may not expose a media path.
      }
      try {
        if (child.children && child.children.numItems > 0) {
          collectProjectItemsOutsideBin(child, excludedBin, mediaPath, matches);
        }
      } catch (_childrenError) {
        // Leaf project items do not have traversable children in every version.
      }
    }
  } catch (_error) {
    // Ignore project branches that Premiere cannot currently traverse.
  }
}
function moveProjectItemsToSoundDesigner(root, normalizedPath, targetBin) {
  var matches = [];
  var index;
  collectProjectItemsOutsideBin(root, targetBin, normalizedPath, matches);
  for (index = 0; index < matches.length; index += 1) matches[index].moveBin(targetBin);
  return matches.length;
}
function getAudioDurationSeconds(projectItem) {
  var inPoint;
  var outPoint;
  var duration;
  try {
    inPoint = projectItem.getInPoint();
    outPoint = projectItem.getOutPoint(2);
    duration = Number(outPoint.seconds) - Number(inPoint.seconds);
    if (duration > 0) return duration;
  } catch (_audioDurationError) {
    // Fall back to point occupancy when a Premiere importer exposes no duration.
  }
  return 0.001;
}
function trackAcceptsRange(track, startSeconds, endSeconds) {
  var clips;
  var index;
  var clip;
  var clipStart;
  var clipEnd;
  try {
    if (track.isLocked()) return false;
    clips = track.clips;
    for (index = 0; index < clips.numItems; index += 1) {
      clip = clips[index];
      clipStart = Number(clip.start.seconds);
      clipEnd = Number(clip.end.seconds);
      if (startSeconds < clipEnd && endSeconds > clipStart) return false;
    }
    return true;
  } catch (_trackReadError) {
    return false;
  }
}
function findAvailableAudioTrack(sequence, requestedIndex, startSeconds, endSeconds) {
  var index;
  if (requestedIndex >= 0 && requestedIndex < sequence.audioTracks.numTracks) {
    if (trackAcceptsRange(sequence.audioTracks[requestedIndex], startSeconds, endSeconds)) return requestedIndex;
  }
  for (index = 0; index < sequence.audioTracks.numTracks; index += 1) {
    if (index !== requestedIndex && trackAcceptsRange(sequence.audioTracks[index], startSeconds, endSeconds)) return index;
  }
  return -1;
}
function findSelectedClipStartSeconds(sequence) {
  var earliest = -1;
  var trackIndex;
  var clipIndex;
  var clips;
  var clip;
  var startSeconds;
  var inspectTracks = function inspectTracks(tracks) {
    for (trackIndex = 0; trackIndex < tracks.numTracks; trackIndex += 1) {
      clips = tracks[trackIndex].clips;
      for (clipIndex = 0; clipIndex < clips.numItems; clipIndex += 1) {
        clip = clips[clipIndex];
        if (!clip.isSelected()) continue;
        startSeconds = Number(clip.start.seconds);
        if (earliest < 0 || startSeconds < earliest) earliest = startSeconds;
      }
    }
  };
  inspectTracks(sequence.videoTracks);
  inspectTracks(sequence.audioTracks);
  return earliest;
}
function createAudioTrack(sequence) {
  var previousCount = sequence.audioTracks.numTracks;
  var qeSequence;
  try {
    app.enableQE();
    if (typeof qe === "undefined" || !qe.project) return -1;
    qeSequence = qe.project.getActiveSequence();
    if (!qeSequence || typeof qeSequence.addTracks !== "function") return -1;
    // QE addTracks(0) adds one standard audio track and no video tracks.
    qeSequence.addTracks(0);
    if (sequence.audioTracks.numTracks > previousCount) return sequence.audioTracks.numTracks - 1;
    // The public DOM collection can stay stale until activeSequence is fetched again.
    // The caller re-reads the sequence and validates this prospective index.
    return previousCount;
  } catch (_qeTrackError) {
    return -1;
  }
}

/** Moves host-imported audio into the shared SoundDesigner Project-panel bin. */
function organizeAudioMedia(request) {
  var project;
  var sourceFile;
  var normalizedPath;
  var projectItem;
  var targetBin;
  var moved;
  try {
    if (!request || typeof request.path !== "string" || request.path.length === 0) {
      return {
        ok: false,
        host: "premiere",
        message: "No audio file path was provided."
      };
    }
    sourceFile = new File(request.path);
    if (!app.project) {
      return {
        ok: false,
        host: "premiere",
        message: "Open a Premiere Pro project before organizing audio."
      };
    }
    project = app.project;
    normalizedPath = normalizePath(sourceFile.fsName);
    projectItem = findProjectItem(project.rootItem, normalizedPath);
    if (!projectItem) {
      return {
        ok: false,
        host: "premiere",
        message: "The audio project item is not available yet."
      };
    }
    targetBin = findOrCreateSoundDesignerBin(project.rootItem);
    moved = moveProjectItemsToSoundDesigner(project.rootItem, normalizedPath, targetBin) > 0;
    return {
      ok: true,
      host: "premiere",
      imported: false,
      message: moved ? "Audio moved into the SoundDesigner bin." : "Audio is already in the SoundDesigner bin."
    };
  } catch (error) {
    return {
      ok: false,
      host: "premiere",
      message: error && error.toString ? error.toString() : "Could not organize the Premiere Pro project item."
    };
  }
}

/**
 * Premiere Pro host adapter. This TypeScript is compiled to ES3 before CEP loads it.
 * The public function accepts and returns plain JSON-compatible objects only.
 */
function insertAudioClip(request) {
  var project;
  var sequence;
  var sourceFile;
  var normalizedPath;
  var projectItem;
  var targetBin;
  var imported = false;
  var trackIndex;
  var playhead;
  var playheadSeconds;
  var insertionSeconds;
  var clipEndSeconds;
  var createdTrack = false;
  var insertResult;
  try {
    if (!request || typeof request.path !== "string" || request.path.length === 0) {
      return {
        ok: false,
        host: "premiere",
        message: "No audio file path was provided."
      };
    }
    sourceFile = new File(request.path);
    if (!sourceFile.exists) {
      return {
        ok: false,
        host: "premiere",
        message: "The selected audio file no longer exists."
      };
    }
    if (!app.project) {
      return {
        ok: false,
        host: "premiere",
        message: "Open a Premiere Pro project before inserting audio."
      };
    }
    project = app.project;
    sequence = project.activeSequence;
    if (!sequence) {
      return {
        ok: false,
        host: "premiere",
        message: "Open or activate a sequence before inserting audio."
      };
    }
    normalizedPath = normalizePath(sourceFile.fsName);
    targetBin = findOrCreateSoundDesignerBin(project.rootItem);
    projectItem = findProjectItem(project.rootItem, normalizedPath);
    if (!projectItem) {
      if (!project.importFiles([sourceFile.fsName], true, targetBin, false)) {
        return {
          ok: false,
          host: "premiere",
          message: "Premiere Pro could not import this audio file."
        };
      }
      imported = true;
      projectItem = findProjectItem(project.rootItem, normalizedPath);
    }
    if (!projectItem) {
      return {
        ok: false,
        host: "premiere",
        message: "The file imported, but its project item could not be resolved."
      };
    }
    moveProjectItemsToSoundDesigner(project.rootItem, normalizedPath, targetBin);
    projectItem = findProjectItem(targetBin, normalizedPath) || projectItem;
    playhead = sequence.getPlayerPosition();
    playheadSeconds = Number(playhead.seconds);
    insertionSeconds = playheadSeconds;
    if (request.insertionTarget === "selected-clip") {
      insertionSeconds = findSelectedClipStartSeconds(sequence);
      if (insertionSeconds < 0) {
        return {
          ok: false,
          host: "premiere",
          message: "Select a timeline clip before inserting at the selected clip."
        };
      }
    }
    clipEndSeconds = insertionSeconds + getAudioDurationSeconds(projectItem);
    trackIndex = findAvailableAudioTrack(sequence, Number(request.targetAudioTrack), insertionSeconds, clipEndSeconds);
    if (trackIndex < 0) {
      trackIndex = createAudioTrack(sequence);
      if (trackIndex >= 0) {
        sequence = project.activeSequence;
        if (!sequence || trackIndex >= sequence.audioTracks.numTracks) {
          trackIndex = -1;
        } else {
          createdTrack = true;
        }
      }
    }
    if (trackIndex < 0) {
      return {
        ok: false,
        host: "premiere",
        message: "Every available audio track overlaps this sound, and Premiere could not create a new audio track."
      };
    }
    insertResult = sequence.audioTracks[trackIndex].overwriteClip(projectItem, insertionSeconds);
    if (insertResult === false) {
      return {
        ok: false,
        host: "premiere",
        message: "Premiere Pro rejected the timeline insertion."
      };
    }
    return {
      ok: true,
      host: "premiere",
      imported: imported,
      trackIndex: trackIndex,
      message: (request.name || sourceFile.displayName) + " inserted on A" + String(trackIndex + 1) + (request.insertionTarget === "selected-clip" ? " at the selected clip" : " at the playhead") + (createdTrack ? " (new track)." : ".")
    };
  } catch (error) {
    return {
      ok: false,
      host: "premiere",
      message: error && error.toString ? error.toString() : "Unknown Premiere Pro error."
    };
  }
}

var ppro = /*#__PURE__*/__objectFreeze({
  __proto__: null,
  getProjectContext: getProjectContext,
  helloArrayStr: helloArrayStr,
  helloError: helloError,
  helloNum: helloNum,
  helloObj: helloObj,
  helloStr: helloStr,
  helloVoid: helloVoid,
  insertAudioClip: insertAudioClip,
  organizeAudioMedia: organizeAudioMedia
});

var host = typeof $ !== "undefined" ? $ : window;

// A safe way to get the app name since some versions of Adobe Apps broken BridgeTalk in various places (e.g. After Effects 24-25)
// in that case we have to do various checks per app to deterimine the app name

var getAppNameSafely = function getAppNameSafely() {
  var compare = function compare(a, b) {
    return a.toLowerCase().indexOf(b.toLowerCase()) > -1;
  };
  var exists = function exists(a) {
    return typeof a !== "undefined";
  };
  var isBridgeTalkWorking = typeof BridgeTalk !== "undefined" && typeof BridgeTalk.appName !== "undefined";
  if (isBridgeTalkWorking) {
    return BridgeTalk.appName;
  } else if (app) {
    
    if (exists(app.name)) {
      
      var name = app.name;
      if (compare(name, "photoshop")) return "photoshop";
      if (compare(name, "illustrator")) return "illustrator";
      if (compare(name, "audition")) return "audition";
      if (compare(name, "bridge")) return "bridge";
      if (compare(name, "indesign")) return "indesign";
    }
    
    if (exists(app.appName)) {
      
      var appName = app.appName;
      if (compare(appName, "after effects")) return "aftereffects";
      if (compare(appName, "animate")) return "animate";
    }
    
    if (exists(app.path)) {
      
      var path = app.path;
      if (compare(path, "premiere")) return "premierepro";
    }
    
    if (exists(app.getEncoderHost) && exists(AMEFrontendEvent)) {
      return "ame";
    }
  }
  return "unknown";
};
switch (getAppNameSafely()) {
  case "aftereffects":
  case "aftereffectsbeta":
    host[ns] = aeft;
    break;
  case "premierepro":
  case "premiereprobeta":
    host[ns] = ppro;
    break;
}
// prettier-ignore

// https://extendscript.docsforadobe.dev/interapplication-communication/bridgetalk-class.html?highlight=bridgetalk#appname
})(this);