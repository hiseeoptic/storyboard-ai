// Regression guards for the Veo prompt contract.
//
// Each assertion here corresponds to a defect observed in generated video.
// These broke once already when a bulk "sync" replaced this file wholesale, so
// they are locked down: if a future sync drops one, this test fails loudly.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "../..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  const mapped = request.startsWith("@/")
    ? path.join(projectRoot, "src", request.slice(2))
    : request;
  return originalResolve.call(this, mapped, parent, isMain, options);
};

require.extensions[".ts"] = (mod, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
};

const { buildVeoJson } = require("./storyboard-breakdown.ts");
const {
  inferRevolvingDoorOperation,
  resolveSpatialLayout,
} = require("../lib/spatial-topology/index.ts");

const baseBreakdown = (segmentOverrides = {}) => ({
  character_locks: [
    {
      name: "Minh",
      gender: "male",
      is_child: false,
      gender_age: "Vietnamese male, 32 years old",
      build: "average build",
      hair: "short black hair",
      costume: "light blue collared shirt, dark grey trousers",
      wardrobe_materials: "cotton shirt and wool-blend trousers",
      render_style: "photoreal live action",
      voice: "native Standard Northern Vietnamese, warm male voice",
    },
    {
      name: "Lan",
      gender: "female",
      is_child: false,
      costume: "soft beige knit top, dark indigo jeans",
      voice: "native Standard Northern Vietnamese, calm female voice",
    },
  ],
  scene_bible: {
    lens: "natural medium lens",
    lighting: "soft window daylight",
    backdrop: "modest apartment dining room",
    color_grade: "neutral natural grade",
    film_grain: "fine organic grain",
  },
  style_guide: { art_direction: "natural live action", color_palette: [] },
  segments: [
    {
      segment_number: 1,
      duration_seconds: 10,
      title: "Bữa cơm",
      marketing_role: "body",
      beats: [
        { beat: "establish the table", camera: "[WIDE] the whole dining table" },
        { beat: "settle on Minh", camera: "[CLOSE] Minh's face" },
        { beat: "hold on Lan", camera: "[OTS] over Minh's shoulder onto Lan" },
      ],
      first_frame_prompt:
        "A modest apartment dining room with a wooden table and soft window daylight. Minh sits to the left of Lan with both feet on the floor, a cloth shopping bag hanging from his right hand.",
      motion_prompt:
        "Minh turns toward Lan and places his right hand on the table while the bag stays in his grip. Lan watches silently.",
      dialogue: "Anh hiểu rồi.",
      speaker: "Minh",
      dialogue_lines: [{ speaker: "Minh", text: "Anh hiểu rồi.", start_s: 1, end_s: 3 }],
      characters_in_scene: ["Minh", "Lan"],
      environment_ref: "custom",
      continuity_note: "Minh remains seated left of Lan, bag still in his right hand.",
      ...segmentOverrides,
    },
  ],
});

const buildClip = (segmentOverrides) =>
  buildVeoJson(baseBreakdown(segmentOverrides), {
    aspectRatio: "9:16",
    dialogueLanguage: "Vietnamese",
  }).clips[0];

test("the clip carries NO flat prompt paragraph", () => {
  const clip = buildClip();
  // Verified against the 17/07-18/07 exports: their clips have no such field.
  // A flattened paragraph re-states the character, style, voice and physics
  // facts the structured fields already own, so Veo gets each fact twice in two
  // wordings — and it alone was ~33% of the clip's size.
  assert.equal(Object.hasOwn(clip, "prompt"), false);
  // Nothing in the app reads clips[].prompt; the structured fields are the
  // only contract.
  assert.ok(clip.scene_action.motion.length > 0);
});

test("camera.movement keeps the whole beat plan, joined by ->", () => {
  const clip = buildClip();
  const movement = clip.camera.movement;

  // The 17/07-18/07 shape: "[WIDE] ... -> [CLOSE] ... -> [OTS] ...".
  // An attempt to collapse this into one generated sentence dropped the middle
  // beats and leaked beat words ("framing of ...") into the prose.
  assert.match(movement, / -> /);
  assert.match(movement, /the whole dining table/i);
  assert.match(movement, /over Minh's shoulder onto Lan/i);
  // No invented narration, and the "one take" wording is not repeated here —
  // it belongs to scene_action.continuity_lock.
  assert.doesNotMatch(movement, /it begins on|settles on/i);
  assert.doesNotMatch(movement, /ONE CONTINUOUS TAKE/);
  // No mangled punctuation from string surgery.
  assert.doesNotMatch(movement, /\.\s*,|,\s*\./);
});

test("every dialogue row carries a hard voice binding to its own speaker", () => {
  const clip = buildClip();
  const row = clip.dialogue[0];

  assert.equal(row.speaker_name, "Minh");
  assert.equal(row.voice_personality, clip.character_lock.CHAR_1.voice_personality);
  // Framing must never be allowed to re-cast the voice.
  assert.match(clip.lip_sync_director_note, /HARD VOICE BINDING/);
  assert.match(clip.lip_sync_director_note, /override character order, camera subject/i);
  assert.match(clip.camera.focus, /NOT the active speaker/i);
});

test("negative list guards the observed physical defects", () => {
  const neg = buildClip().negative_prompt;

  const required = [
    // doors opening by themselves / walking through closed doors
    /a door opening or swinging with no hand on it/i,
    /a pull door opened by pushing/i,
    /crossing a door before it visibly opens/i,
    // hand here, bag there
    /detaching from the hand or floating beside the body/i,
    // mid-shot background swap
    /background changing, flickering or re-rendering mid-shot/i,
    /lighting or colour-temperature jump mid-shot/i,
    // chair teleport
    /left-right seat swap/i,
    /unexplained seated-standing change/i,
    // voices changing randomly
    /a character's voice changing between clips/i,
    /cross-gender voice swap/i,
    // the proven 17/18 guards must still be present
    /listener lip movement/i,
    /any readable letters numbers or typography anywhere in the frame/i,
  ];
  for (const pattern of required) {
    assert.match(neg, pattern);
  }
});

test("negative_prompt stays near the proven 17/18 length", () => {
  const neg = buildClip().negative_prompt;
  // The known-good exports carried ~1,663 characters. A later "restore the full
  // list" pass pushed this past 4,000 by spelling out variations Veo already
  // infers, diluting every individual guard. Keep it lean.
  assert.ok(
    neg.length < 2600,
    `negative_prompt is ${neg.length} chars — the 17/18 baseline was ~1,663; it is bloating again`
  );
});

test("scene_action locks door operation and carried objects", () => {
  const lock = buildClip().scene_action.continuity_lock;
  assert.match(lock, /no door, gate or lid moves until a named hand visibly grips it/i);
  assert.match(lock, /pull door is pulled toward the person/i);
  assert.match(lock, /stays attached to the exact hand or shoulder gripping it/i);
});

test("background_lock holds the set still for the whole clip", () => {
  const persistence = buildClip().background_lock.persistence;
  assert.match(persistence, /HOLD THE SET/);
  assert.match(persistence, /nothing behind the action appears, vanishes, slides, flickers/i);
});

test("revolving-door exit starts inside the occupied wedge, one direction", () => {
  const operation = inferRevolvingDoorOperation({
    setting: "A hotel lobby with a revolving door.",
    motion: "Minh steps out of the revolving door onto the lobby floor.",
    startState: "Minh is inside the revolving door compartment.",
    endState: "Minh stands on the destination lobby floor.",
  });
  assert.equal(operation, "exit");

  const layout = resolveSpatialLayout({
    setting: "A hotel lobby with a revolving door.",
    motion: "Minh steps out of the revolving door onto the lobby floor.",
    startState: "Minh is inside the revolving door compartment.",
    endState: "Minh stands on the destination lobby floor.",
    characterNames: ["Minh"],
  });

  assert.ok(layout, "a revolving-door scene must resolve a spatial layout");
  assert.match(layout.character_placement, /starts inside the same occupied wedge/i);
  assert.match(layout.mechanism_motion, /never reverse, re-enter, cross a wing or center shaft/i);
  // The person must not be described as already outside before the exit.
  assert.match(layout.walkable_path, /exactly once/i);
});

test("a scene with no mechanism emits no mechanism_motion", () => {
  const layout = resolveSpatialLayout({
    setting: "A modest apartment dining room with a wooden table.",
    motion: "Minh turns toward Lan.",
    characterNames: ["Minh", "Lan"],
  });
  // Either no layout at all (simple single-zone scene) or no mechanism field.
  if (layout) assert.equal(layout.mechanism_motion, undefined);
});

// The two tests below are carried over from codex's suite: they guard the
// spatial-topology module that was ported wholesale, and do not depend on the
// parts of codex's prompt contract that were deliberately not adopted.

test("revolving-door scenes never inherit doorway or stair topology", () => {
  const layout = resolveSpatialLayout({
    layout: {
      zone_order: "lower walkable area -> stair entry -> stair flight -> upper landing",
      fixed_architecture: "wrong legacy stair template",
      character_placement: "Minh and Lan stand by the mall entrance",
      walkable_path: "wrong legacy stair route",
      camera_zone: "mall lobby",
    },
    setting: "A modern mall entrance with one glass revolving door.",
    motion: "Lan steps out of the revolving-door compartment while Minh waits on the lobby floor.",
    characterNames: ["Minh", "Lan"],
  });

  assert.match(layout.zone_order, /revolving-door compartment/i);
  assert.doesNotMatch(layout.zone_order, /stair/i);
  assert.doesNotMatch(layout.fixed_architecture, /stair/i);
  assert.match(layout.character_placement, /Lan starts inside/i);
  assert.match(layout.walkable_path, /destination-side threshold exactly once/i);
  assert.match(layout.mechanism_motion, /already occupied wedge/i);
  assert.match(layout.mechanism_motion, /never reverse/i);
});

test("ordinary step verbs do not invent stairs", () => {
  // "steps toward" is walking, not a staircase — the loose STAIRS regex used to
  // hallucinate a stair topology onto a flat floor.
  const layout = resolveSpatialLayout({
    setting: "A flat mall lobby with a glass entrance.",
    motion: "Minh steps toward Lan on the same-level polished floor.",
    characterNames: ["Minh", "Lan"],
  });

  assert.equal(layout, null);
});

test("uploaded-reference characters keep the photo as the ONLY wardrobe authority", () => {
  const {
    stripUploadedCharacterAppearance,
  } = require("../lib/character-realism.ts");

  const cleaned = stripUploadedCharacterAppearance(
    "Lan, with long black hair, wearing a soft beige knit top and dark indigo jeans, stands beside Minh and smiles.",
    ["Lan"]
  );

  // Identity prose is stripped...
  assert.doesNotMatch(cleaned, /long black hair/i);
  // ...and so is invented wardrobe: the uploaded photo is the only clothing
  // authority, so leaving this in is what made outfits drift between clips.
  assert.doesNotMatch(cleaned, /beige knit top/i);
  assert.doesNotMatch(cleaned, /indigo jeans/i);
  // Name, blocking and ordinary acting survive.
  assert.match(cleaned, /Lan/);
  assert.match(cleaned, /smiles/i);
});

test("appearance stripping never eats blocking, props or acting language", () => {
  const {
    stripUploadedCharacterAppearance,
  } = require("../lib/character-realism.ts");

  // The opposite failure mode: an over-broad stripper mangles ordinary prose
  // (a previous version turned "calmly" into "ly"). Everything here is action,
  // blocking or prop state and must survive untouched.
  const kept = stripUploadedCharacterAppearance(
    "Lan calmly sets the warm teapot on the low shelf, then steps to the top of the stairs " +
      "with a cup in her right hand, faces toward Minh and smiles warmly.",
    ["Lan"]
  );

  for (const phrase of [
    "calmly",
    "warm teapot",
    "the low shelf",
    "the top of the stairs",
    "a cup in her right hand",
    "smiles warmly",
  ]) {
    assert.ok(
      kept.toLowerCase().includes(phrase.toLowerCase()),
      `stripping removed legitimate prose: "${phrase}" — got: ${kept}`
    );
  }
});
