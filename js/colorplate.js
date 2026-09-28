/* CompX Color Plate — Color Library only (no picker, no custom, no trending). */
(function () {
  'use strict';
  function bridge() { return window.CompXHostBridge || null; }
  function hostArg(value) { var b=bridge(); return b ? b.arg(value) : JSON.stringify(String(value == null ? "" : value)); }
  function hostCall(script, fallback, onSuccess) {
    var b=bridge();
    if(!b){ if(typeof window.showToast==='function') window.showToast('Host bridge unavailable.', true); return; }
    b.call(script,function(result){
      if(typeof window.showToast==='function') window.showToast(result.message || fallback || (result.success ? 'Applied' : 'Action failed.'), !result.success);
      if(result.success && typeof onSuccess==='function') onSuccess();
    });
  }
  function pushRecent(hex){
    try { if(window.CompXRecentColors && typeof window.CompXRecentColors.add==='function') window.CompXRecentColors.add(hex); } catch(e){}
  }

/* ── SAAS 4-COLOR PALETTES ── */
var SAAS=[{"label":"DEEP NAVY","colors":["050b14","0a192f","112240","233554"]},{"label":"ELECTRIC PURPLE","colors":["1e053a","3a0ca3","4361ee","4cc9f0"]},{"label":"VIBRANT GREEN","colors":["00a344","00c652","33d675","66e598"]},{"label":"WARM ORANGE","colors":["e63946","f07167","ffb703","fb8500"]},{"label":"LIGHT BLUE","colors":["8ecae6","219ebc","023047","126782"]},{"label":"FLORAL BLUE","colors":["08101e","1a365d","2b6cb0","63b3ed"]},{"label":"NEUTRAL GREY","colors":["f8f9fa","e9ecef","dee2e6","ced4da"]},{"label":"STUDIO CRIMSON","colors":["0a0005","1d0312","3b0625","660a3b"]},{"label":"DEEP PLUM","colors":["0a0616","180d2f","2e165e","4e1e96"]},{"label":"VIBRANT MAGENTA","colors":["ff94d1","ff4db8","c529ff","7b1bff"]},{"label":"SOFT LILAC","colors":["ffffff","fcf3ff","f8e2ff","f1c9ff"]},{"label":"DARK VIOLET","colors":["140e24","24193f","392562","563690"]},{"label":"NEON GLOW","colors":["ff1e89","d500f9","651fff","3d00b7"]},{"label":"NEUTRAL GREY 2","colors":["f8f9fa","f1f3f5","e9ecef","dee2e6"]},{"label":"NEON MAGENTA","colors":["ff0055","ff1e89","d500f9","9d00ff"]},{"label":"DEEP VOID","colors":["000000","0a0a0a","141414","222222"]},{"label":"GAMER RGB","colors":["00ffff","3a86ff","8338ec","ff006e"]},{"label":"WING SUNSET","colors":["023047","219ebc","ffb703","fb8500"]},{"label":"AERO BLUE","colors":["48cae4","90e0ef","caf0f8","ffffff"]},{"label":"RETRO SUNSET","colors":["2b2d42","8d99ae","ef233c","d90429"]},{"label":"PASTEL DREAM","colors":["ffb5a7","fcd5ce","f8edeb","f9dec9"]},{"label":"MINT FRESH","colors":["e8f5e9","a5d6a7","66bb6a","43a047"]},{"label":"CYBERPUNK","colors":["0b0c10","1f2833","c5a059","45a29e"]},{"label":"OCEAN DEPTHS","colors":["03045e","0077b6","00b4d8","90e0ef"]},{"label":"FOREST MIST","colors":["1e352f","3e6359","789d90","a9cbb7"]},{"label":"GOLDEN HOUR","colors":["3d2645","8338ec","ff006e","ffbe0b"]},{"label":"LAVENDER HAZE","colors":["312244","4d3b66","846ca8","e0b1cb"]},{"label":"MONOCHROME TECH","colors":["121212","242424","3a3a3a","e0e0e0"]},{"label":"VINTAGE OAT","colors":["d8c3a5","8e8d8a","e98074","e85d04"]},{"label":"SHERBET","colors":["ff9f1c","ffbf69","ffffff","2ec4b6"]},{"label":"DEEP BERRY","colors":["2b1b17","5c2626","9e2a2b","e07a5f"]}];

/* ── MARKETING SOLIDS ── */
var SOLIDS=["ff0055","00d8ff","39ff14","ffcc00","7000ff","0055ff","ffffff","1a1a1a","ff5500","00cc99","f87171","fbcfe8","f43f5e","e11d48","be123c","fda4af","f9a8d4","f472b6","ec4899","db2777","be185d","9d174d","831843","d8b4fe","c084fc","a855f7","9333ea","7e22ce","6b21a8","581c87","c4b5fd","a855f7","8b5cf6","7c3aed","6d28d9","5b21b6","4c1d95","c7d2fe","a78bfa","8b5cf6","7c3aed","6d28d9","5b21b6","4c1d95","bfdbfe","a5b4fc","8b5cf6","7c3aed","6d28d9","5b21b6","4c1d95","bae6fd","93c5fd","60a5fa","3b82f6","2563eb","1d4ed8","1e3a8a","1e3a8a","93c5fd","bfdbfe","93c5fd","60a5fa","3b82f6","2563eb","1d4ed8","1e3a8a","99f6e4","5eead4","2dd4bf","14b8a6","0d9488","0f766e","115e59","a7f3d0","6ee7b7","34d399","10b981","059669","047857","065f46","bbf7d0","86efac","34d399","10b981","059669","047857","065f46","fef08a","fde047","facc15","eab308","ca8a04","a16207","854d0e","fef08a","fde047","facc15","eab308","ca8a04","a16207","854d0e","fed7aa","fde047","facc15","eab308","ca8a04","a16207","854d0e","000000","ff3366","ff6633","33ff66","3366ff","ff33cc","33ffcc","ffff33","ff9933","9933ff","33ff99","0f172a","1e293b","334155","475569","64748b","94a3b8","cbd5e1","f1f5f9","f8fafc","f43f5e","e11d48","ec4899","db2777","d946ef","c084fc","a855f7","8b5cf6","6366f1","4f46e5","3b82f6","2563eb","0ea5e9","0284c7","06b6d4","0891b2","14b8a6","0d9488","10b981","059669","22c55e"];

/* ── WARM COLORS ── */
var WARM=[{"hex":"e8e2d9","name":"Warm Parchment"},{"hex":"a67c52","name":"Caramel Brown"},{"hex":"4a3018","name":"Deep Umber"},{"hex":"c84b31","name":"Earthy Terracotta"},{"hex":"2c3e50","name":"Muted Navy"},{"hex":"1a1a1a","name":"Studio Charcoal"},{"hex":"f4f4f4","name":"Soft White"},{"hex":"ffedd5","name":"Warm Apricot"},{"hex":"fed7aa","name":"Soft Peach"},{"hex":"fdba74","name":"Sandy Gold"},{"hex":"f97316","name":"Bright Tangerine"},{"hex":"ea580c","name":"Burnt Orange"},{"hex":"c2410c","name":"Rust Red"},{"hex":"9a3412","name":"Deep Terracotta"},{"hex":"7c2d12","name":"Dark Brick"},{"hex":"fef3c7","name":"Warm Amber"},{"hex":"fde68a","name":"Butter Cream"},{"hex":"fcd34d","name":"Honey Mustard"},{"hex":"fbbf24","name":"Golden Sun"},{"hex":"f59e0b","name":"Warm Ochre"},{"hex":"d97706","name":"Spiced Ginger"},{"hex":"b45309","name":"Cinnamon"},{"hex":"78350f","name":"Espresso"}];

/* Flex-reference parity plus original production collections. Five-color rows
 * expose every swatch; the play button applies the first four as an AE
 * 4-Color Gradient. */
var TRENDING=[
  {label:'MODERN EDITORIAL',colors:['f4f1de','e07a5f','3d405b','81b29a','f2cc8f']},
  {label:'COASTAL BLUE',colors:['03045e','023e8a','0077b6','0096c7','00b4d8']},
  {label:'DESERT CINEMA',colors:['264653','2a9d8f','e9c46a','f4a261','e76f51']},
  {label:'GRAPHITE RED',colors:['2b2d42','8d99ae','edf2f4','ef233c','d90429']},
  {label:'BOTANICAL',colors:['1b4332','2d6a4f','40916c','52b788','74c69d']},
  {label:'MIDNIGHT GOLD',colors:['000814','001d3d','003566','ffc300','ffd60a']},
  {label:'EMBER',colors:['220901','621708','941b0c','bc3908','f6aa1c']},
  {label:'CRIMSON NOIR',colors:['0b090a','161a1d','a4161a','ba181b','e5383b']},
  {label:'SOFT PEACH',colors:['ffb5a7','fcd5ce','f8edeb','f9dec9','fec89a']},
  {label:'AGED LUXURY',colors:['8c1c13','a44a3f','fbf5f3','f1f0ea','e0a96d']},
  {label:'ROYAL LAVENDER',colors:['312244','4d3b66','685387','846ca8','a085c9']},
  {label:'ELECTRIC GREEN',colors:['004b23','007200','38b000','70e000','ccff33']},
  {label:'BERRY HEAT',colors:['ff5400','ff0054','9e0059','70005f','38003c']},
  {label:'BLACK GOLD',colors:['1a1a1a','2b2b2b','d4af37','e5c158','f3e5ab']},
  {label:'PLUM NIGHT',colors:['0f0f1b','21153b','4b2766','82438c','c064ac']},
  {label:'MINT AIR',colors:['d8f3dc','b7e4c7','95d5b2','74c69d','52b788']},
  {label:'NEON CREATOR',colors:['00f5d4','7b2cbf','9d4edd','ff007f','ff5400']},
  {label:'PASTEL POP',colors:['cdb4db','ffc8dd','ffafcc','bde0fe','a2d2ff']},
  {label:'ARCHITECTURAL',colors:['353535','3c6e71','ffffff','d9d9d9','284b63']},
  {label:'SOCIAL PUNCH',colors:['70d6ff','ff70a6','ff9770','ffd670','e9ff70']}
];
var PRO_LOOKS=[
  {label:'LUXURY PROPERTY',colors:['111111','4b4034','c7a66a','f5efe4']},
  {label:'CLEAN INTERIOR',colors:['f7f5f0','dedbd2','8d99ae','334155']},
  {label:'GOLDEN HOUR HOME',colors:['2b1b14','b85c38','f0a65a','ffe0b2']},
  {label:'DRONE LANDSCAPE',colors:['102a2e','2f6f67','8db580','e7e8d1']},
  {label:'LUXURY NIGHT',colors:['05070d','17213b','52658f','d7b56d']},
  {label:'AIRBNB BRIGHT',colors:['ffffff','eaf4f4','6b9080','f6bd60']},
  {label:'CINEMATIC TEAL',colors:['061a1f','0b5563','3bb3bd','ff784f']},
  {label:'FILM EMULATION',colors:['1d1b19','6b5846','c69c72','e7d8c9']},
  {label:'MINIMAL MONO',colors:['0d0d0d','343434','a3a3a3','f5f5f5']},
  {label:'EDITORIAL BLUE',colors:['0b132b','1c2541','3a506b','5bc0be']},
  {label:'UGC ENERGY',colors:['121212','ff3b30','ffcc00','34c759']},
  {label:'BEAUTY ROSE',colors:['2c1821','9d4b68','e6a4b4','fff0f3']},
  {label:'TECH LAUNCH',colors:['050816','14213d','00d8ff','7cff6b']},
  {label:'SPORT HYPE',colors:['090909','d90429','ffba08','f8f9fa']},
  {label:'DOCUMENTARY',colors:['171a1d','4d5b54','a89984','e8e1d4']},
  {label:'WEDDING IVORY',colors:['2f2722','a67c6b','dfc3b3','fff8f0']}
];

/* ── 2-COLOR GRADIENT LIBRARY (220 Blends) ── */
var GRAD2=[{"name":"Blend 001","c1":"#EA2A2A","c2":"#D1511A"},{"name":"Blend 002","c1":"#EA602A","c2":"#EAC953"},{"name":"Blend 003","c1":"#EA972A","c2":"#81D11A"},{"name":"Blend 004","c1":"#EACD2A","c2":"#5FEA53"},{"name":"Blend 005","c1":"#D0EA2A","c2":"#81D11A"},{"name":"Blend 006","c1":"#9AEA2A","c2":"#5FEA53"},{"name":"Blend 007","c1":"#63EA2A","c2":"#1AD181"},{"name":"Blend 008","c1":"#2DEA2A","c2":"#53E2EA"},{"name":"Blend 009","c1":"#2AEA5D","c2":"#1AD181"},{"name":"Blend 010","c1":"#2AEA93","c2":"#53E2EA"},{"name":"Blend 011","c1":"#2AEACA","c2":"#1A51D1"},{"name":"Blend 012","c1":"#2AD3EA","c2":"#6E53EA"},{"name":"Blend 013","c1":"#2A9DEA","c2":"#1A51D1"},{"name":"Blend 014","c1":"#2A66EA","c2":"#6E53EA"},{"name":"Blend 015","c1":"#2A30EA","c2":"#B21AD1"},{"name":"Blend 016","c1":"#5A2AEA","c2":"#EA53BA"},{"name":"Blend 017","c1":"#902AEA","c2":"#B21AD1"},{"name":"Blend 018","c1":"#C72AEA","c2":"#EA53BA"},{"name":"Blend 019","c1":"#EA2AD7","c2":"#D11A20"},{"name":"Blend 020","c1":"#EA2AA0","c2":"#EA9753"},{"name":"Blend 021","c1":"#EA2A6A","c2":"#D11A20"},{"name":"Blend 022","c1":"#EA2A33","c2":"#EA9753"},{"name":"Blend 023","c1":"#EA562A","c2":"#BED11A"},{"name":"Blend 024","c1":"#EA8D2A","c2":"#92EA53"},{"name":"Blend 025","c1":"#EAC32A","c2":"#BED11A"},{"name":"Blend 026","c1":"#DAEA2A","c2":"#92EA53"},{"name":"Blend 027","c1":"#A3EA2A","c2":"#1AD145"},{"name":"Blend 028","c1":"#6DEA2A","c2":"#53EABF"},{"name":"Blend 029","c1":"#36EA2A","c2":"#1AD145"},{"name":"Blend 030","c1":"#2AEA53","c2":"#53EABF"},{"name":"Blend 031","c1":"#2AEA8A","c2":"#1A8ED1"},{"name":"Blend 032","c1":"#2AEAC0","c2":"#5369EA"},{"name":"Blend 033","c1":"#2ADDEA","c2":"#1A8ED1"},{"name":"Blend 034","c1":"#2AA7EA","c2":"#5369EA"},{"name":"Blend 035","c1":"#2A70EA","c2":"#751AD1"},{"name":"Blend 036","c1":"#2A3AEA","c2":"#E753EA"},{"name":"Blend 037","c1":"#502AEA","c2":"#751AD1"},{"name":"Blend 038","c1":"#862AEA","c2":"#E753EA"},{"name":"Blend 039","c1":"#BD2AEA","c2":"#D11A5D"},{"name":"Blend 040","c1":"#EA2AE0","c2":"#EA6453"},{"name":"Blend 041","c1":"#EA2AAA","c2":"#D11A5D"},{"name":"Blend 042","c1":"#EA2A73","c2":"#EA6453"},{"name":"Blend 043","c1":"#EA2A3D","c2":"#D1A61A"},{"name":"Blend 044","c1":"#EA4D2A","c2":"#C4EA53"},{"name":"Blend 045","c1":"#EA832A","c2":"#D1A61A"},{"name":"Blend 046","c1":"#EABA2A","c2":"#C4EA53"},{"name":"Blend 047","c1":"#E3EA2A","c2":"#2CD11A"},{"name":"Blend 048","c1":"#ADEA2A","c2":"#53EA8C"},{"name":"Blend 049","c1":"#76EA2A","c2":"#2CD11A"},{"name":"Blend 050","c1":"#40EA2A","c2":"#53EA8C"},{"name":"Blend 051","c1":"#2AEA4A","c2":"#1ACBD1"},{"name":"Blend 052","c1":"#2AEA80","c2":"#539CEA"},{"name":"Blend 053","c1":"#2AEAB7","c2":"#1ACBD1"},{"name":"Blend 054","c1":"#2AE7EA","c2":"#539CEA"},{"name":"Blend 055","c1":"#2AB0EA","c2":"#381AD1"},{"name":"Blend 056","c1":"#2A7AEA","c2":"#B553EA"},{"name":"Blend 057","c1":"#2A43EA","c2":"#381AD1"},{"name":"Blend 058","c1":"#462AEA","c2":"#B553EA"},{"name":"Blend 059","c1":"#7D2AEA","c2":"#D11A9A"},{"name":"Blend 060","c1":"#B32AEA","c2":"#EA5373"},{"name":"Blend 061","c1":"#EA2AEA","c2":"#D11A9A"},{"name":"Blend 062","c1":"#EA2AB3","c2":"#EA5373"},{"name":"Blend 063","c1":"#EA2A7D","c2":"#D1691A"},{"name":"Blend 064","c1":"#EA2A46","c2":"#EADD53"},{"name":"Blend 065","c1":"#EA432A","c2":"#D1691A"},{"name":"Blend 066","c1":"#EA7A2A","c2":"#EADD53"},{"name":"Blend 067","c1":"#EAB02A","c2":"#69D11A"},{"name":"Blend 068","c1":"#EAE72A","c2":"#53EA5A"},{"name":"Blend 069","c1":"#B7EA2A","c2":"#69D11A"},{"name":"Blend 070","c1":"#80EA2A","c2":"#53EA5A"},{"name":"Blend 071","c1":"#4AEA2A","c2":"#1AD19A"},{"name":"Blend 072","c1":"#2AEA40","c2":"#53CEEA"},{"name":"Blend 073","c1":"#2AEA76","c2":"#1AD19A"},{"name":"Blend 074","c1":"#2AEAAD","c2":"#53CEEA"},{"name":"Blend 075","c1":"#2AEAE3","c2":"#1A38D1"},{"name":"Blend 076","c1":"#2ABAEA","c2":"#8253EA"},{"name":"Blend 077","c1":"#2A83EA","c2":"#1A38D1"},{"name":"Blend 078","c1":"#2A4DEA","c2":"#8253EA"},{"name":"Blend 079","c1":"#3D2AEA","c2":"#CB1AD1"},{"name":"Blend 080","c1":"#732AEA","c2":"#EA53A6"},{"name":"Blend 081","c1":"#AA2AEA","c2":"#CB1AD1"},{"name":"Blend 082","c1":"#E02AEA","c2":"#EA53A6"},{"name":"Blend 083","c1":"#EA2ABD","c2":"#D12C1A"},{"name":"Blend 084","c1":"#EA2A86","c2":"#EAAB53"},{"name":"Blend 085","c1":"#EA2A50","c2":"#D12C1A"},{"name":"Blend 086","c1":"#EA3A2A","c2":"#EAAB53"},{"name":"Blend 087","c1":"#EA702A","c2":"#A6D11A"},{"name":"Blend 088","c1":"#EAA72A","c2":"#7DEA53"},{"name":"Blend 089","c1":"#EADD2A","c2":"#A6D11A"},{"name":"Blend 090","c1":"#C0EA2A","c2":"#7DEA53"},{"name":"Blend 091","c1":"#8AEA2A","c2":"#1AD15D"},{"name":"Blend 092","c1":"#53EA2A","c2":"#53EAD3"},{"name":"Blend 093","c1":"#2AEA36","c2":"#1AD15D"},{"name":"Blend 094","c1":"#2AEA6D","c2":"#53EAD3"},{"name":"Blend 095","c1":"#2AEAA3","c2":"#1A75D1"},{"name":"Blend 096","c1":"#2AEADA","c2":"#5355EA"},{"name":"Blend 097","c1":"#2AC3EA","c2":"#1A75D1"},{"name":"Blend 098","c1":"#2A8DEA","c2":"#5355EA"},{"name":"Blend 099","c1":"#2A56EA","c2":"#8E1AD1"},{"name":"Blend 100","c1":"#332AEA","c2":"#EA53D8"},{"name":"Blend 101","c1":"#6A2AEA","c2":"#8E1AD1"},{"name":"Blend 102","c1":"#A02AEA","c2":"#EA53D8"},{"name":"Blend 103","c1":"#D72AEA","c2":"#D11A45"},{"name":"Blend 104","c1":"#EA2AC7","c2":"#EA7853"},{"name":"Blend 105","c1":"#EA2A90","c2":"#D11A45"},{"name":"Blend 106","c1":"#EA2A5A","c2":"#EA7853"},{"name":"Blend 107","c1":"#EA302A","c2":"#D1BE1A"},{"name":"Blend 108","c1":"#EA662A","c2":"#B0EA53"},{"name":"Blend 109","c1":"#EA9D2A","c2":"#D1BE1A"},{"name":"Blend 110","c1":"#EAD32A","c2":"#B0EA53"},{"name":"Blend 111","c1":"#CAEA2A","c2":"#1AD120"},{"name":"Blend 112","c1":"#93EA2A","c2":"#53EAA1"},{"name":"Blend 113","c1":"#5DEA2A","c2":"#1AD120"},{"name":"Blend 114","c1":"#2AEA2D","c2":"#53EAA1"},{"name":"Blend 115","c1":"#2AEA63","c2":"#1AB2D1"},{"name":"Blend 116","c1":"#2AEA9A","c2":"#5387EA"},{"name":"Blend 117","c1":"#2AEAD0","c2":"#1AB2D1"},{"name":"Blend 118","c1":"#2ACDEA","c2":"#5387EA"},{"name":"Blend 119","c1":"#2A97EA","c2":"#511AD1"},{"name":"Blend 120","c1":"#2A60EA","c2":"#C953EA"},{"name":"Blend 121","c1":"#2A2AEA","c2":"#511AD1"},{"name":"Blend 122","c1":"#602AEA","c2":"#C953EA"},{"name":"Blend 123","c1":"#972AEA","c2":"#D11A81"},{"name":"Blend 124","c1":"#CD2AEA","c2":"#EA535F"},{"name":"Blend 125","c1":"#EA2AD0","c2":"#D11A81"},{"name":"Blend 126","c1":"#EA2A9A","c2":"#EA535F"},{"name":"Blend 127","c1":"#EA2A63","c2":"#D1811A"},{"name":"Blend 128","c1":"#EA2A2D","c2":"#E2EA53"},{"name":"Blend 129","c1":"#EA5D2A","c2":"#D1811A"},{"name":"Blend 130","c1":"#EA932A","c2":"#E2EA53"},{"name":"Blend 131","c1":"#EACA2A","c2":"#51D11A"},{"name":"Blend 132","c1":"#D3EA2A","c2":"#53EA6E"},{"name":"Blend 133","c1":"#9DEA2A","c2":"#51D11A"},{"name":"Blend 134","c1":"#66EA2A","c2":"#53EA6E"},{"name":"Blend 135","c1":"#30EA2A","c2":"#1AD1B2"},{"name":"Blend 136","c1":"#2AEA5A","c2":"#53BAEA"},{"name":"Blend 137","c1":"#2AEA90","c2":"#1AD1B2"},{"name":"Blend 138","c1":"#2AEAC7","c2":"#53BAEA"},{"name":"Blend 139","c1":"#2AD7EA","c2":"#1A20D1"},{"name":"Blend 140","c1":"#2AA0EA","c2":"#9753EA"},{"name":"Blend 141","c1":"#2A6AEA","c2":"#1A20D1"},{"name":"Blend 142","c1":"#2A33EA","c2":"#9753EA"},{"name":"Blend 143","c1":"#562AEA","c2":"#D11ABE"},{"name":"Blend 144","c1":"#8D2AEA","c2":"#EA5392"},{"name":"Blend 145","c1":"#C32AEA","c2":"#D11ABE"},{"name":"Blend 146","c1":"#EA2ADA","c2":"#EA5392"},{"name":"Blend 147","c1":"#EA2AA3","c2":"#D1451A"},{"name":"Blend 148","c1":"#EA2A6D","c2":"#EABF53"},{"name":"Blend 149","c1":"#EA2A36","c2":"#D1451A"},{"name":"Blend 150","c1":"#EA532A","c2":"#EABF53"},{"name":"Blend 151","c1":"#EA8A2A","c2":"#8ED11A"},{"name":"Blend 152","c1":"#EAC02A","c2":"#69EA53"},{"name":"Blend 153","c1":"#DDEA2A","c2":"#8ED11A"},{"name":"Blend 154","c1":"#A7EA2A","c2":"#69EA53"},{"name":"Blend 155","c1":"#70EA2A","c2":"#1AD175"},{"name":"Blend 156","c1":"#3AEA2A","c2":"#53EAE7"},{"name":"Blend 157","c1":"#2AEA50","c2":"#1AD175"},{"name":"Blend 158","c1":"#2AEA86","c2":"#53EAE7"},{"name":"Blend 159","c1":"#2AEABD","c2":"#1A5DD1"},{"name":"Blend 160","c1":"#2AE0EA","c2":"#6453EA"},{"name":"Blend 161","c1":"#2AAAEA","c2":"#1A5DD1"},{"name":"Blend 162","c1":"#2A73EA","c2":"#6453EA"},{"name":"Blend 163","c1":"#2A3DEA","c2":"#A61AD1"},{"name":"Blend 164","c1":"#4D2AEA","c2":"#EA53C4"},{"name":"Blend 165","c1":"#832AEA","c2":"#A61AD1"},{"name":"Blend 166","c1":"#BA2AEA","c2":"#EA53C4"},{"name":"Blend 167","c1":"#EA2AE3","c2":"#D11A2C"},{"name":"Blend 168","c1":"#EA2AAD","c2":"#EA8C53"},{"name":"Blend 169","c1":"#EA2A76","c2":"#D11A2C"},{"name":"Blend 170","c1":"#EA2A40","c2":"#EA8C53"},{"name":"Blend 171","c1":"#EA4A2A","c2":"#CBD11A"},{"name":"Blend 172","c1":"#EA802A","c2":"#9CEA53"},{"name":"Blend 173","c1":"#EAB72A","c2":"#CBD11A"},{"name":"Blend 174","c1":"#E7EA2A","c2":"#9CEA53"},{"name":"Blend 175","c1":"#B0EA2A","c2":"#1AD138"},{"name":"Blend 176","c1":"#7AEA2A","c2":"#53EAB5"},{"name":"Blend 177","c1":"#43EA2A","c2":"#1AD138"},{"name":"Blend 178","c1":"#2AEA46","c2":"#53EAB5"},{"name":"Blend 179","c1":"#2AEA7D","c2":"#1A9AD1"},{"name":"Blend 180","c1":"#2AEAB3","c2":"#5373EA"},{"name":"Blend 181","c1":"#2AEAEA","c2":"#1A9AD1"},{"name":"Blend 182","c1":"#2AB3EA","c2":"#5373EA"},{"name":"Blend 183","c1":"#2A7DEA","c2":"#691AD1"},{"name":"Blend 184","c1":"#2A46EA","c2":"#DD53EA"},{"name":"Blend 185","c1":"#432AEA","c2":"#691AD1"},{"name":"Blend 186","c1":"#7A2AEA","c2":"#DD53EA"},{"name":"Blend 187","c1":"#B02AEA","c2":"#D11A69"},{"name":"Blend 188","c1":"#E72AEA","c2":"#EA5A53"},{"name":"Blend 189","c1":"#EA2AB7","c2":"#D11A69"},{"name":"Blend 190","c1":"#EA2A80","c2":"#EA5A53"},{"name":"Blend 191","c1":"#EA2A4A","c2":"#D19A1A"},{"name":"Blend 192","c1":"#EA402A","c2":"#CEEA53"},{"name":"Blend 193","c1":"#EA762A","c2":"#D19A1A"},{"name":"Blend 194","c1":"#EAAD2A","c2":"#CEEA53"},{"name":"Blend 195","c1":"#EAE32A","c2":"#38D11A"},{"name":"Blend 196","c1":"#BAEA2A","c2":"#53EA82"},{"name":"Blend 197","c1":"#83EA2A","c2":"#38D11A"},{"name":"Blend 198","c1":"#4DEA2A","c2":"#53EA82"},{"name":"Blend 199","c1":"#2AEA3D","c2":"#1AD1CB"},{"name":"Blend 200","c1":"#2AEA73","c2":"#53A6EA"},{"name":"Blend 201","c1":"#2AEAAA","c2":"#1AD1CB"},{"name":"Blend 202","c1":"#2AEAE0","c2":"#53A6EA"},{"name":"Blend 203","c1":"#2ABDEA","c2":"#2C1AD1"},{"name":"Blend 204","c1":"#2A86EA","c2":"#AB53EA"},{"name":"Blend 205","c1":"#2A50EA","c2":"#2C1AD1"},{"name":"Blend 206","c1":"#3A2AEA","c2":"#AB53EA"},{"name":"Blend 207","c1":"#702AEA","c2":"#D11AA6"},{"name":"Blend 208","c1":"#A72AEA","c2":"#EA537D"},{"name":"Blend 209","c1":"#DD2AEA","c2":"#D11AA6"},{"name":"Blend 210","c1":"#EA2AC0","c2":"#EA537D"},{"name":"Blend 211","c1":"#EA2A8A","c2":"#D15D1A"},{"name":"Blend 212","c1":"#EA2A53","c2":"#EAD353"},{"name":"Blend 213","c1":"#EA362A","c2":"#D15D1A"},{"name":"Blend 214","c1":"#EA6D2A","c2":"#EAD353"},{"name":"Blend 215","c1":"#EAA32A","c2":"#75D11A"},{"name":"Blend 216","c1":"#EADA2A","c2":"#55EA53"},{"name":"Blend 217","c1":"#C3EA2A","c2":"#75D11A"},{"name":"Blend 218","c1":"#8DEA2A","c2":"#55EA53"},{"name":"Blend 219","c1":"#56EA2A","c2":"#1AD18E"},{"name":"Blend 220","c1":"#2AEA33","c2":"#53D8EA"}];

/* ── 4-COLOR GRADIENT LIBRARY (160 Fusions) ── */
var GRAD4=[{"name":"Fusion 001","c1":"#C00C0C","c2":"#EE5A1B","c3":"#EDBA45","c4":"#D5ED78"},{"name":"Fusion 002","c1":"#C0450C","c2":"#EE9D1B","c3":"#EAED45","c4":"#B1ED78"},{"name":"Fusion 003","c1":"#C07E0C","c2":"#EEE01B","c3":"#B5ED45","c4":"#8CED78"},{"name":"Fusion 004","c1":"#C0B70C","c2":"#B9EE1B","c3":"#80ED45","c4":"#78ED8A"},{"name":"Fusion 005","c1":"#90C00C","c2":"#77EE1B","c3":"#4BED45","c4":"#78EDAF"},{"name":"Fusion 006","c1":"#57C00C","c2":"#34EE1B","c3":"#45ED75","c4":"#78EDD3"},{"name":"Fusion 007","c1":"#1EC00C","c2":"#1BEE45","c3":"#45EDAA","c4":"#78E1ED"},{"name":"Fusion 008","c1":"#0CC033","c2":"#1BEE88","c3":"#45EDDF","c4":"#78BCED"},{"name":"Fusion 009","c1":"#0CC06C","c2":"#1BEECB","c3":"#45C6ED","c4":"#7897ED"},{"name":"Fusion 010","c1":"#0CC0A5","c2":"#1BCEEE","c3":"#4591ED","c4":"#7E78ED"},{"name":"Fusion 011","c1":"#0CA2C0","c2":"#1B8CEE","c3":"#455CED","c4":"#A378ED"},{"name":"Fusion 012","c1":"#0C69C0","c2":"#1B49EE","c3":"#6445ED","c4":"#C878ED"},{"name":"Fusion 013","c1":"#0C30C0","c2":"#301BEE","c3":"#9945ED","c4":"#ED78ED"},{"name":"Fusion 014","c1":"#210CC0","c2":"#731BEE","c3":"#CE45ED","c4":"#ED78C8"},{"name":"Fusion 015","c1":"#5A0CC0","c2":"#B61BEE","c3":"#ED45D6","c4":"#ED78A3"},{"name":"Fusion 016","c1":"#930CC0","c2":"#EE1BE3","c3":"#ED45A1","c4":"#ED787E"},{"name":"Fusion 017","c1":"#C00CB4","c2":"#EE1BA1","c3":"#ED456C","c4":"#ED9778"},{"name":"Fusion 018","c1":"#C00C7B","c2":"#EE1B5E","c3":"#ED5345","c4":"#EDBC78"},{"name":"Fusion 019","c1":"#C00C42","c2":"#EE1B1B","c3":"#ED8845","c4":"#EDE178"},{"name":"Fusion 020","c1":"#C00F0C","c2":"#EE5E1B","c3":"#EDBD45","c4":"#D3ED78"},{"name":"Fusion 021","c1":"#C0480C","c2":"#EEA11B","c3":"#E7ED45","c4":"#AFED78"},{"name":"Fusion 022","c1":"#C0810C","c2":"#EEE31B","c3":"#B2ED45","c4":"#8AED78"},{"name":"Fusion 023","c1":"#C0BA0C","c2":"#B6EE1B","c3":"#7DED45","c4":"#78ED8C"},{"name":"Fusion 024","c1":"#8DC00C","c2":"#73EE1B","c3":"#48ED45","c4":"#78EDB1"},{"name":"Fusion 025","c1":"#54C00C","c2":"#30EE1B","c3":"#45ED78","c4":"#78EDD5"},{"name":"Fusion 026","c1":"#1BC00C","c2":"#1BEE49","c3":"#45EDAD","c4":"#78DFED"},{"name":"Fusion 027","c1":"#0CC036","c2":"#1BEE8C","c3":"#45EDE1","c4":"#78BAED"},{"name":"Fusion 028","c1":"#0CC06F","c2":"#1BEECE","c3":"#45C3ED","c4":"#7895ED"},{"name":"Fusion 029","c1":"#0CC0A8","c2":"#1BCBEE","c3":"#458EED","c4":"#8078ED"},{"name":"Fusion 030","c1":"#0C9FC0","c2":"#1B88EE","c3":"#4559ED","c4":"#A578ED"},{"name":"Fusion 031","c1":"#0C66C0","c2":"#1B45EE","c3":"#6745ED","c4":"#CA78ED"},{"name":"Fusion 032","c1":"#0C2DC0","c2":"#341BEE","c3":"#9C45ED","c4":"#ED78EB"},{"name":"Fusion 033","c1":"#240CC0","c2":"#771BEE","c3":"#D145ED","c4":"#ED78C6"},{"name":"Fusion 034","c1":"#5D0CC0","c2":"#B91BEE","c3":"#ED45D4","c4":"#ED78A1"},{"name":"Fusion 035","c1":"#960CC0","c2":"#EE1BE0","c3":"#ED459F","c4":"#ED787C"},{"name":"Fusion 036","c1":"#C00CB1","c2":"#EE1B9D","c3":"#ED456A","c4":"#ED9978"},{"name":"Fusion 037","c1":"#C00C78","c2":"#EE1B5A","c3":"#ED5645","c4":"#EDBE78"},{"name":"Fusion 038","c1":"#C00C3F","c2":"#EE1F1B","c3":"#ED8B45","c4":"#EDE378"},{"name":"Fusion 039","c1":"#C0120C","c2":"#EE621B","c3":"#EDC045","c4":"#D2ED78"},{"name":"Fusion 040","c1":"#C04B0C","c2":"#EEA41B","c3":"#E4ED45","c4":"#ADED78"},{"name":"Fusion 041","c1":"#C0840C","c2":"#EEE71B","c3":"#AFED45","c4":"#88ED78"},{"name":"Fusion 042","c1":"#C0BD0C","c2":"#B2EE1B","c3":"#7AED45","c4":"#78ED8E"},{"name":"Fusion 043","c1":"#8AC00C","c2":"#70EE1B","c3":"#45ED45","c4":"#78EDB3"},{"name":"Fusion 044","c1":"#51C00C","c2":"#2DEE1B","c3":"#45ED7A","c4":"#78EDD7"},{"name":"Fusion 045","c1":"#18C00C","c2":"#1BEE4C","c3":"#45EDAF","c4":"#78DDED"},{"name":"Fusion 046","c1":"#0CC039","c2":"#1BEE8F","c3":"#45EDE4","c4":"#78B8ED"},{"name":"Fusion 047","c1":"#0CC072","c2":"#1BEED2","c3":"#45C0ED","c4":"#7893ED"},{"name":"Fusion 048","c1":"#0CC0AB","c2":"#1BC7EE","c3":"#458BED","c4":"#8278ED"},{"name":"Fusion 049","c1":"#0C9CC0","c2":"#1B85EE","c3":"#4556ED","c4":"#A778ED"},{"name":"Fusion 050","c1":"#0C63C0","c2":"#1B42EE","c3":"#6A45ED","c4":"#CC78ED"},{"name":"Fusion 051","c1":"#0C2AC0","c2":"#371BEE","c3":"#9F45ED","c4":"#ED78E9"},{"name":"Fusion 052","c1":"#270CC0","c2":"#7A1BEE","c3":"#D445ED","c4":"#ED78C4"},{"name":"Fusion 053","c1":"#600CC0","c2":"#BD1BEE","c3":"#ED45D1","c4":"#ED789F"},{"name":"Fusion 054","c1":"#990CC0","c2":"#EE1BDC","c3":"#ED459C","c4":"#ED787A"},{"name":"Fusion 055","c1":"#C00CAE","c2":"#EE1B9A","c3":"#ED4567","c4":"#ED9B78"},{"name":"Fusion 056","c1":"#C00C75","c2":"#EE1B57","c3":"#ED5945","c4":"#EDC078"},{"name":"Fusion 057","c1":"#C00C3C","c2":"#EE221B","c3":"#ED8E45","c4":"#EDE578"},{"name":"Fusion 058","c1":"#C0150C","c2":"#EE651B","c3":"#EDC345","c4":"#D0ED78"},{"name":"Fusion 059","c1":"#C04E0C","c2":"#EEA81B","c3":"#E1ED45","c4":"#ABED78"},{"name":"Fusion 060","c1":"#C0870C","c2":"#EEEA1B","c3":"#ADED45","c4":"#86ED78"},{"name":"Fusion 061","c1":"#C0C00C","c2":"#AFEE1B","c3":"#78ED45","c4":"#78ED90"},{"name":"Fusion 062","c1":"#87C00C","c2":"#6CEE1B","c3":"#45ED48","c4":"#78EDB4"},{"name":"Fusion 063","c1":"#4EC00C","c2":"#29EE1B","c3":"#45ED7D","c4":"#78EDD9"},{"name":"Fusion 064","c1":"#15C00C","c2":"#1BEE50","c3":"#45EDB2","c4":"#78DBED"},{"name":"Fusion 065","c1":"#0CC03C","c2":"#1BEE93","c3":"#45EDE7","c4":"#78B6ED"},{"name":"Fusion 066","c1":"#0CC075","c2":"#1BEED5","c3":"#45BDED","c4":"#7892ED"},{"name":"Fusion 067","c1":"#0CC0AE","c2":"#1BC4EE","c3":"#4588ED","c4":"#8478ED"},{"name":"Fusion 068","c1":"#0C99C0","c2":"#1B81EE","c3":"#4553ED","c4":"#A978ED"},{"name":"Fusion 069","c1":"#0C60C0","c2":"#1B3EEE","c3":"#6C45ED","c4":"#CE78ED"},{"name":"Fusion 070","c1":"#0C27C0","c2":"#3B1BEE","c3":"#A145ED","c4":"#ED78E7"},{"name":"Fusion 071","c1":"#2A0CC0","c2":"#7E1BEE","c3":"#D645ED","c4":"#ED78C2"},{"name":"Fusion 072","c1":"#630CC0","c2":"#C01BEE","c3":"#ED45CE","c4":"#ED789D"},{"name":"Fusion 073","c1":"#9C0CC0","c2":"#EE1BD9","c3":"#ED4599","c4":"#ED7878"},{"name":"Fusion 074","c1":"#C00CAB","c2":"#EE1B96","c3":"#ED4564","c4":"#ED9D78"},{"name":"Fusion 075","c1":"#C00C72","c2":"#EE1B53","c3":"#ED5C45","c4":"#EDC278"},{"name":"Fusion 076","c1":"#C00C39","c2":"#EE261B","c3":"#ED9145","c4":"#EDE778"},{"name":"Fusion 077","c1":"#C0180C","c2":"#EE691B","c3":"#EDC645","c4":"#CEED78"},{"name":"Fusion 078","c1":"#C0510C","c2":"#EEAB1B","c3":"#DFED45","c4":"#A9ED78"},{"name":"Fusion 079","c1":"#C08A0C","c2":"#EEEE1B","c3":"#AAED45","c4":"#84ED78"},{"name":"Fusion 080","c1":"#BDC00C","c2":"#ABEE1B","c3":"#75ED45","c4":"#78ED92"},{"name":"Fusion 081","c1":"#84C00C","c2":"#69EE1B","c3":"#45ED4B","c4":"#78EDB6"},{"name":"Fusion 082","c1":"#4BC00C","c2":"#26EE1B","c3":"#45ED80","c4":"#78EDDB"},{"name":"Fusion 083","c1":"#12C00C","c2":"#1BEE53","c3":"#45EDB5","c4":"#78D9ED"},{"name":"Fusion 084","c1":"#0CC03F","c2":"#1BEE96","c3":"#45EDEA","c4":"#78B4ED"},{"name":"Fusion 085","c1":"#0CC078","c2":"#1BEED9","c3":"#45BAED","c4":"#7890ED"},{"name":"Fusion 086","c1":"#0CC0B1","c2":"#1BC0EE","c3":"#4585ED","c4":"#8678ED"},{"name":"Fusion 087","c1":"#0C96C0","c2":"#1B7EEE","c3":"#4551ED","c4":"#AB78ED"},{"name":"Fusion 088","c1":"#0C5DC0","c2":"#1B3BEE","c3":"#6F45ED","c4":"#D078ED"},{"name":"Fusion 089","c1":"#0C24C0","c2":"#3E1BEE","c3":"#A445ED","c4":"#ED78E5"},{"name":"Fusion 090","c1":"#2D0CC0","c2":"#811BEE","c3":"#D945ED","c4":"#ED78C0"},{"name":"Fusion 091","c1":"#660CC0","c2":"#C41BEE","c3":"#ED45CB","c4":"#ED789B"},{"name":"Fusion 092","c1":"#9F0CC0","c2":"#EE1BD5","c3":"#ED4596","c4":"#ED7A78"},{"name":"Fusion 093","c1":"#C00CA8","c2":"#EE1B93","c3":"#ED4561","c4":"#ED9F78"},{"name":"Fusion 094","c1":"#C00C6F","c2":"#EE1B50","c3":"#ED5E45","c4":"#EDC478"},{"name":"Fusion 095","c1":"#C00C36","c2":"#EE291B","c3":"#ED9345","c4":"#EDE978"},{"name":"Fusion 096","c1":"#C01B0C","c2":"#EE6C1B","c3":"#EDC845","c4":"#CCED78"},{"name":"Fusion 097","c1":"#C0540C","c2":"#EEAF1B","c3":"#DCED45","c4":"#A7ED78"},{"name":"Fusion 098","c1":"#C08D0C","c2":"#EAEE1B","c3":"#A7ED45","c4":"#82ED78"},{"name":"Fusion 099","c1":"#BAC00C","c2":"#A8EE1B","c3":"#72ED45","c4":"#78ED93"},{"name":"Fusion 100","c1":"#81C00C","c2":"#65EE1B","c3":"#45ED4E","c4":"#78EDB8"},{"name":"Fusion 101","c1":"#48C00C","c2":"#22EE1B","c3":"#45ED83","c4":"#78EDDD"},{"name":"Fusion 102","c1":"#0FC00C","c2":"#1BEE57","c3":"#45EDB8","c4":"#78D7ED"},{"name":"Fusion 103","c1":"#0CC042","c2":"#1BEE9A","c3":"#45EDED","c4":"#78B2ED"},{"name":"Fusion 104","c1":"#0CC07B","c2":"#1BEEDC","c3":"#45B8ED","c4":"#788EED"},{"name":"Fusion 105","c1":"#0CC0B4","c2":"#1BBDEE","c3":"#4583ED","c4":"#8878ED"},{"name":"Fusion 106","c1":"#0C93C0","c2":"#1B7AEE","c3":"#454EED","c4":"#AD78ED"},{"name":"Fusion 107","c1":"#0C5AC0","c2":"#1B37EE","c3":"#7245ED","c4":"#D278ED"},{"name":"Fusion 108","c1":"#0C21C0","c2":"#421BEE","c3":"#A745ED","c4":"#ED78E3"},{"name":"Fusion 109","c1":"#300CC0","c2":"#851BEE","c3":"#DC45ED","c4":"#ED78BE"},{"name":"Fusion 110","c1":"#690CC0","c2":"#C71BEE","c3":"#ED45C8","c4":"#ED7899"},{"name":"Fusion 111","c1":"#A20CC0","c2":"#EE1BD2","c3":"#ED4593","c4":"#ED7C78"},{"name":"Fusion 112","c1":"#C00CA5","c2":"#EE1B8F","c3":"#ED455E","c4":"#EDA178"},{"name":"Fusion 113","c1":"#C00C6C","c2":"#EE1B4C","c3":"#ED6145","c4":"#EDC678"},{"name":"Fusion 114","c1":"#C00C33","c2":"#EE2D1B","c3":"#ED9645","c4":"#EDEB78"},{"name":"Fusion 115","c1":"#C01E0C","c2":"#EE701B","c3":"#EDCB45","c4":"#CAED78"},{"name":"Fusion 116","c1":"#C0570C","c2":"#EEB21B","c3":"#D9ED45","c4":"#A5ED78"},{"name":"Fusion 117","c1":"#C0900C","c2":"#E7EE1B","c3":"#A4ED45","c4":"#80ED78"},{"name":"Fusion 118","c1":"#B7C00C","c2":"#A4EE1B","c3":"#6FED45","c4":"#78ED95"},{"name":"Fusion 119","c1":"#7EC00C","c2":"#62EE1B","c3":"#45ED51","c4":"#78EDBA"},{"name":"Fusion 120","c1":"#45C00C","c2":"#1FEE1B","c3":"#45ED85","c4":"#78EDDF"},{"name":"Fusion 121","c1":"#0CC00C","c2":"#1BEE5A","c3":"#45EDBA","c4":"#78D5ED"},{"name":"Fusion 122","c1":"#0CC045","c2":"#1BEE9D","c3":"#45EAED","c4":"#78B1ED"},{"name":"Fusion 123","c1":"#0CC07E","c2":"#1BEEE0","c3":"#45B5ED","c4":"#788CED"},{"name":"Fusion 124","c1":"#0CC0B7","c2":"#1BB9EE","c3":"#4580ED","c4":"#8A78ED"},{"name":"Fusion 125","c1":"#0C90C0","c2":"#1B77EE","c3":"#454BED","c4":"#AF78ED"},{"name":"Fusion 126","c1":"#0C57C0","c2":"#1B34EE","c3":"#7545ED","c4":"#D378ED"},{"name":"Fusion 127","c1":"#0C1EC0","c2":"#451BEE","c3":"#AA45ED","c4":"#ED78E1"},{"name":"Fusion 128","c1":"#330CC0","c2":"#881BEE","c3":"#DF45ED","c4":"#ED78BC"},{"name":"Fusion 129","c1":"#6C0CC0","c2":"#CB1BEE","c3":"#ED45C6","c4":"#ED7897"},{"name":"Fusion 130","c1":"#A50CC0","c2":"#EE1BCE","c3":"#ED4591","c4":"#ED7E78"},{"name":"Fusion 131","c1":"#C00CA2","c2":"#EE1B8C","c3":"#ED455C","c4":"#EDA378"},{"name":"Fusion 132","c1":"#C00C69","c2":"#EE1B49","c3":"#ED6445","c4":"#EDC878"},{"name":"Fusion 133","c1":"#C00C30","c2":"#EE301B","c3":"#ED9945","c4":"#EDED78"},{"name":"Fusion 134","c1":"#C0210C","c2":"#EE731B","c3":"#EDCE45","c4":"#C8ED78"},{"name":"Fusion 135","c1":"#C05A0C","c2":"#EEB61B","c3":"#D6ED45","c4":"#A3ED78"},{"name":"Fusion 136","c1":"#C0930C","c2":"#E3EE1B","c3":"#A1ED45","c4":"#7EED78"},{"name":"Fusion 137","c1":"#B4C00C","c2":"#A1EE1B","c3":"#6CED45","c4":"#78ED97"},{"name":"Fusion 138","c1":"#7BC00C","c2":"#5EEE1B","c3":"#45ED53","c4":"#78EDBC"},{"name":"Fusion 139","c1":"#42C00C","c2":"#1BEE1B","c3":"#45ED88","c4":"#78EDE1"},{"name":"Fusion 140","c1":"#0CC00F","c2":"#1BEE5E","c3":"#45EDBD","c4":"#78D3ED"},{"name":"Fusion 141","c1":"#0CC048","c2":"#1BEEA1","c3":"#45E7ED","c4":"#78AFED"},{"name":"Fusion 142","c1":"#0CC081","c2":"#1BEEE3","c3":"#45B2ED","c4":"#788AED"},{"name":"Fusion 143","c1":"#0CC0BA","c2":"#1BB6EE","c3":"#457DED","c4":"#8C78ED"},{"name":"Fusion 144","c1":"#0C8DC0","c2":"#1B73EE","c3":"#4548ED","c4":"#B178ED"},{"name":"Fusion 145","c1":"#0C54C0","c2":"#1B30EE","c3":"#7845ED","c4":"#D578ED"},{"name":"Fusion 146","c1":"#0C1BC0","c2":"#491BEE","c3":"#AD45ED","c4":"#ED78DF"},{"name":"Fusion 147","c1":"#360CC0","c2":"#8C1BEE","c3":"#E145ED","c4":"#ED78BA"},{"name":"Fusion 148","c1":"#6F0CC0","c2":"#CE1BEE","c3":"#ED45C3","c4":"#ED7895"},{"name":"Fusion 149","c1":"#A80CC0","c2":"#EE1BCB","c3":"#ED458E","c4":"#ED8078"},{"name":"Fusion 150","c1":"#C00C9F","c2":"#EE1B88","c3":"#ED4559","c4":"#EDA578"},{"name":"Fusion 151","c1":"#C00C66","c2":"#EE1B45","c3":"#ED6745","c4":"#EDCA78"},{"name":"Fusion 152","c1":"#C00C2D","c2":"#EE341B","c3":"#ED9C45","c4":"#EBED78"},{"name":"Fusion 153","c1":"#C0240C","c2":"#EE771B","c3":"#EDD145","c4":"#C6ED78"},{"name":"Fusion 154","c1":"#C05D0C","c2":"#EEB91B","c3":"#D4ED45","c4":"#A1ED78"},{"name":"Fusion 155","c1":"#C0960C","c2":"#E0EE1B","c3":"#9FED45","c4":"#7CED78"},{"name":"Fusion 156","c1":"#B1C00C","c2":"#9DEE1B","c3":"#6AED45","c4":"#78ED99"},{"name":"Fusion 157","c1":"#78C00C","c2":"#5AEE1B","c3":"#45ED56","c4":"#78EDBE"},{"name":"Fusion 158","c1":"#3FC00C","c2":"#1BEE1F","c3":"#45ED8B","c4":"#78EDE3"},{"name":"Fusion 159","c1":"#0CC012","c2":"#1BEE62","c3":"#45EDC0","c4":"#78D2ED"},{"name":"Fusion 160","c1":"#0CC04B","c2":"#1BEEA4","c3":"#45E4ED","c4":"#78ADED"}];

  /* Hand-picked production variants are listed first; generated collections remain below. */
  var CURATED2=[
    {name:'Aurora Mint',c1:'#00F5A0',c2:'#00D9F5'},{name:'Electric Sunset',c1:'#FF512F',c2:'#DD2476'},
    {name:'Midnight Neon',c1:'#0F0C29',c2:'#7F00FF'},{name:'Ocean Signal',c1:'#005AA7',c2:'#00E4D0'},
    {name:'Mango Punch',c1:'#F7971E',c2:'#FFD200'},{name:'Rose Quartz',c1:'#F857A6',c2:'#FF5858'},
    {name:'Cyber Lime',c1:'#A8FF78',c2:'#00F2FE'},{name:'Royal Ink',c1:'#141E30',c2:'#6A5ACD'},
    {name:'Peach Bloom',c1:'#FF9A9E',c2:'#FAD0C4'},{name:'Arctic Blue',c1:'#4FACFE',c2:'#00F2FE'},
    {name:'Ember Gold',c1:'#8E2DE2',c2:'#FFB347'},{name:'Forest Glass',c1:'#134E5E',c2:'#71B280'},
    {name:'Candy Pop',c1:'#FC466B',c2:'#3F5EFB'},{name:'Mono Steel',c1:'#232526',c2:'#BFC0C0'},
    {name:'Coral Reef',c1:'#FF9966',c2:'#00C9A7'},{name:'Lavender Sky',c1:'#C471F5',c2:'#FA71CD'},
    {name:'Blueberry Ice',c1:'#396AFC',c2:'#A9C9FF'},{name:'Solar Flare',c1:'#F12711',c2:'#F5AF19'},
    {name:'Deep Space',c1:'#000428',c2:'#004E92'},{name:'Mint Cream',c1:'#96FBC4',c2:'#F9F586'},
    {name:'Violet Pulse',c1:'#7F00FF',c2:'#E100FF'},{name:'Warm Editorial',c1:'#C79081',c2:'#DFA579'},
    {name:'Teal Magenta',c1:'#11998E',c2:'#C471ED'},{name:'Ice Fire',c1:'#00C6FF',c2:'#FF3D71'}
  ];
  var CURATED4=[
    {name:'Orbit Aurora',c1:'#050816',c2:'#3858FF',c3:'#00E5C3',c4:'#C8FF67'},
    {name:'Creator Sunset',c1:'#391306',c2:'#FF512F',c3:'#F09819',c4:'#FFE259'},
    {name:'Neon Studio',c1:'#090014',c2:'#7F00FF',c3:'#E100FF',c4:'#00F5D4'},
    {name:'Ocean Depth',c1:'#001219',c2:'#005F73',c3:'#0A9396',c4:'#94D2BD'},
    {name:'Editorial Rose',c1:'#2B0A1A',c2:'#A4133C',c3:'#FF758F',c4:'#FFCCD5'},
    {name:'Golden Film',c1:'#241500',c2:'#9C640C',c3:'#F5B942',c4:'#FFF1B8'},
    {name:'Night Drive',c1:'#03001E',c2:'#7303C0',c3:'#EC38BC',c4:'#FDEFF9'},
    {name:'Fresh Product',c1:'#06283D',c2:'#1363DF',c3:'#47B5FF',c4:'#DFF6FF'},
    {name:'Matcha Cream',c1:'#1B4332',c2:'#52B788',c3:'#B7E4C7',c4:'#F1FAEE'},
    {name:'Heat Map',c1:'#240046',c2:'#7B2CBF',c3:'#FF6D00',c4:'#FFEA00'},
    {name:'Chrome Candy',c1:'#111827',c2:'#2563EB',c3:'#F472B6',c4:'#FDF2F8'},
    {name:'Soft Interface',c1:'#EEF2FF',c2:'#C7D2FE',c3:'#A5B4FC',c4:'#6366F1'}
  ];

  function uniqueBy(items,keyFn){
    var seen={},out=[];
    for(var i=0;i<items.length;i++){
      var key=keyFn(items[i]);
      if(seen[key]) continue;
      seen[key]=true;out.push(items[i]);
    }
    return out;
  }
  function grad2Key(g){
    var a=String(g.c1||'').toUpperCase(),b=String(g.c2||'').toUpperCase();
    return a<b?a+'|'+b:b+'|'+a;
  }
  function grad4Key(g){
    var a=[g.c1,g.c2,g.c3,g.c4].map(function(v){return String(v||'').toUpperCase();});
    var b=a.slice().reverse();
    var x=a.join('|'),y=b.join('|');return x<y?x:y;
  }
  var RAW_SOLID_COUNT=SOLIDS.length;
  SOLIDS=uniqueBy(SOLIDS,function(v){return String(v||'').toUpperCase();});
  GRAD2=uniqueBy(CURATED2.concat(GRAD2),grad2Key);
  GRAD4=uniqueBy(CURATED4.concat(GRAD4),grad4Key);
  window.CompXColorLibraryAudit={solidEntries:RAW_SOLID_COUNT,uniqueSolids:SOLIDS.length,removedSolidDuplicates:RAW_SOLID_COUNT-SOLIDS.length,trendingPalettes:TRENDING.length,proLooks:PRO_LOOKS.length,gradients2:GRAD2.length,gradients4:GRAD4.length};

  function each(nl,fn){ for(var i=0;i<nl.length;i++)fn(nl[i],i); }

  /* ── apply to AE using the centralized CompX host bridge ── */
  function applySolidHex(hex){
    var h=String(hex||'').trim().toUpperCase(); if(h.charAt(0)!=='#')h='#'+h;
    hostCall('ae_applyColor('+hostArg('fill')+','+hostArg(h)+')','Color Applied', function(){ pushRecent(h); });
  }
  function applyGrad4(a,b,c,d){
    var colors=[a,b,c,d].map(function(v){var h=String(v||'').trim().toUpperCase();return h.charAt(0)==='#'?h:'#'+h;});
    hostCall('ae_applyGradient4('+colors.map(hostArg).join(',')+')','4-Color Applied', function(){ pushRecent(colors[0]); });
  }
  function applyGrad2(c1,c2){
    var h1=String(c1||'').trim().toUpperCase();if(h1.charAt(0)!=='#')h1='#'+h1;
    var h2=String(c2||'').trim().toUpperCase();if(h2.charAt(0)!=='#')h2='#'+h2;
    var cfg=JSON.stringify({preset:'2color-linear',c1:h1,c2:h2,rampType:1,angle:0});
    hostCall('ae_applyGradientPlate('+hostArg(cfg)+')','2-Color Applied', function(){ pushRecent(h1); });
  }
  function applyFusion(c1,c2,c3,c4){ applyGrad4(c1,c2,c3,c4); }

  /* ── section renderers ── */
  function paletteRow(colors,label){
    var bars='';
    for(var i=0;i<colors.length;i++)
      bars+='<button class="cp-pcolor" style="background:#'+colors[i]+'" data-solid="'+colors[i]+'" title="#'+colors[i].toUpperCase()+'"></button>';
    var g=[colors[0],colors[1],colors[2],colors[3]];
    return '<div class="cp-prow" title="'+String(label||'Palette')+'"><div class="cp-pbar">'+bars+'</div>'+
      '<button class="cp-papply" data-grad="'+g.join(',')+'" title="Apply '+String(label||'palette')+' as a 4-color gradient">'+
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>'+
      '</button></div>';
  }
  function swatchGrid(items){
    var h='<div class="cp-swgrid">';
    for(var i=0;i<items.length;i++){
      var it=items[i];
      var hex=typeof it==='string'?it:it.hex;
      var tip=typeof it==='string'?('#'+hex.toUpperCase()):(it.name+' · #'+hex.toUpperCase());
      h+='<button class="cp-sw" style="background:#'+hex+'" data-solid="'+hex+'" title="'+tip+'"></button>';
    }
    return h+'</div>';
  }
  function grad2Row(g){
    return '<div class="cp-grad2row" data-g2c1="'+g.c1+'" data-g2c2="'+g.c2+'" title="'+g.name+' — click to apply">'+
      '<div class="cp-grad2bar" style="background:linear-gradient(135deg,'+g.c1+','+g.c2+')"></div>'+
      '<span class="cp-grad2name">'+g.name+'</span></div>';
  }
  function grad4Row(g){
    return '<div class="cp-grad4row" data-g4c1="'+g.c1+'" data-g4c2="'+g.c2+'" data-g4c3="'+g.c3+'" data-g4c4="'+g.c4+'" title="'+g.name+' — click to apply">'+
      '<div class="cp-grad2bar" style="background:linear-gradient(135deg,'+g.c1+' 0%,'+g.c2+' 33%,'+g.c3+' 66%,'+g.c4+' 100%)"></div>'+
      '<span class="cp-grad2name">'+g.name+'</span></div>';
  }
  function build(root){
    var proRows = PRO_LOOKS.map(function(p){ return paletteRow(p.colors,p.label); }).join('');
    var trendingRows = TRENDING.map(function(p){ return paletteRow(p.colors,p.label); }).join('');
    var saasRows = SAAS.map(function(p){ return paletteRow(p.colors,p.label); }).join('');
    var grad2Rows = GRAD2.map(grad2Row).join('');
    var grad4Rows = GRAD4.map(grad4Row).join('');

    root.innerHTML =
      '<div class="cp-secttitle">PRODUCTION LOOKS <span style="font-size:7px;opacity:.5;font-weight:400;">('+PRO_LOOKS.length+' palettes)</span></div><div class="cp-pgrid">'+proRows+'</div>'+
      '<div class="cp-secttitle">TRENDING PALETTES <span style="font-size:7px;opacity:.5;font-weight:400;">('+TRENDING.length+' palettes)</span></div><div class="cp-pgrid">'+trendingRows+'</div>'+
      '<div class="cp-secttitle">SAAS COLORS</div>'+
      '<div class="cp-pgrid" id="cp-saas">'+saasRows+'</div>'+
      '<div class="cp-secttitle">MARKETING SOLIDS <span style="font-size:7px;opacity:.5;font-weight:400;">('+SOLIDS.length+' unique)</span></div>'+swatchGrid(SOLIDS)+
      '<div class="cp-secttitle">WARM COLORS</div>'+swatchGrid(WARM)+
      '<div class="cp-secttitle">2-COLOR GRADIENTS <span style="font-size:7px;opacity:.5;font-weight:400;">('+GRAD2.length+' variants)</span></div>'+
      '<div class="cp-grad2grid" id="cp-grad2">'+grad2Rows+'</div>'+
      '<div class="cp-secttitle">4-COLOR GRADIENTS <span style="font-size:7px;opacity:.5;font-weight:400;">('+GRAD4.length+' variants)</span></div>'+
      '<div class="cp-grad2grid" id="cp-grad4">'+grad4Rows+'</div>';

    /* Wire SAAS palette rows and any other items with data-solid/data-grad directly at root level */
    each(root.querySelectorAll('[data-solid]'), function(b){
      b.addEventListener('click', function(){
        applySolidHex(b.getAttribute('data-solid'));
      });
    });

    each(root.querySelectorAll('[data-grad]'), function(b){
      b.addEventListener('click', function(){
        var q = b.getAttribute('data-grad').split(',');
        applyGrad4(q[0], q[1], q[2], q[3]);
      });
    });

    /* Wire 2-color gradients */
    var g2grid = root.querySelector('#cp-grad2');
    if(g2grid) g2grid.addEventListener('click', function(e){
      var row = e.target.closest('.cp-grad2row');
      if(!row) return;
      applyGrad2(row.dataset.g2c1, row.dataset.g2c2);
    });

    /* Wire 4-color gradients */
    var g4grid = root.querySelector('#cp-grad4');
    if(g4grid) g4grid.addEventListener('click', function(e){
      var row = e.target.closest('.cp-grad4row');
      if(!row) return;
      applyFusion(row.dataset.g4c1, row.dataset.g4c2, row.dataset.g4c3, row.dataset.g4c4);
    });
  }

  function init(){
    var root = document.getElementById('cxColorPlate');
    if(!root) return;
    try { build(root); } catch(e) {
      root.innerHTML = '<div style="color:red;padding:8px;font-size:10px;">Color plate error: '+e+'</div>';
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
