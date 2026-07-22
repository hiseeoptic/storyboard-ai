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

const compileTs = (mod, filename) => {
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
require.extensions[".ts"] = compileTs;

const { buildVeoJson } = require("./storyboard-breakdown.ts");

test("Veo JSON stays structured and does not repeat character/outfit/voice prose", () => {
  const breakdown = {
    character_locks: [
      {
        name: "Minh",
        gender: "male",
        is_child: false,
        gender_age: "Vietnamese male, 32 years old",
        build: "average build",
        skin_tone: "medium complexion",
        face_structure: "oval face",
        skin_texture: "real skin with visible pores",
        eye_details: "dark brown eyes",
        eyebrow_details: "individual natural brow hairs",
        eyelash_details: "individual natural lashes",
        nose_lips_details: "natural nose and lips",
        hair: "short black hair",
        hair_details: "natural hairline and flyaways",
        eyes: "dark brown",
        costume: "light blue collared shirt, dark grey trousers",
        wardrobe_materials: "cotton shirt and wool-blend trousers",
        signature_features: "gentle asymmetrical smile",
        render_style: "photoreal live action",
        voice: "native Standard Northern Vietnamese, warm male voice",
      },
      {
        name: "Lan",
        gender: "female",
        is_child: false,
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
        duration_seconds: 8,
        title: "Bữa cơm",
        marketing_role: "body",
        beats: [{ beat: "Minh sits", camera: "medium static eye-level framing" }],
        first_frame_prompt:
          "A modest apartment dining room with a wooden table and soft window daylight. Minh, Vietnamese male, 32 years old, with short black hair, wearing light blue collared shirt, dark grey trousers, sits left of Lan with both feet on the floor.",
        motion_prompt:
          "Minh turns toward Lan and places his right hand on the table. Lan watches silently. Single continuous motion, natural movement obeying real-world physics, consistent weight and gravity, stable identity, object permanence.",
        dialogue: "Anh hiểu rồi.",
        speaker: "Minh",
        dialogue_lines: [{ speaker: "Minh", text: "Anh hiểu rồi.", start_s: 1, end_s: 3 }],
        characters_in_scene: ["Minh", "Lan"],
        environment_ref: "custom",
        spatial_layout: {
          zone_order: "dining table left -> dining table right",
          fixed_architecture: "table and walls stay fixed",
          character_placement: "Minh sits left of Lan",
          walkable_path: "clear floor around the table",
          camera_zone: "supported floor in front of the table",
        },
        continuity_note: "Minh remains seated left of Lan with his right hand on the table.",
      },
    ],
  };

  const result = buildVeoJson(breakdown, {
    aspectRatio: "9:16",
    dialogueLanguage: "Vietnamese",
    characterReferenceNames: ["Lan"],
  });
  const clip = result.clips[0];

  assert.equal(Object.hasOwn(clip, "prompt"), false);
  assert.deepEqual(Object.keys(clip).slice(0, 6), [
    "scene_id",
    "duration_sec",
    "visual_style",
    "scene_role",
    "characters_in_scene",
    "character_lock",
  ]);
  assert.equal(Object.hasOwn(clip.scene_action, "wardrobe_lock"), false);
  assert.equal(Object.hasOwn(clip.dialogue[0], "voice_personality"), false);
  assert.match(clip.character_lock.CHAR_1.voice_personality, /Northern Vietnamese/i);
  assert.deepEqual(Object.keys(clip.character_lock.CHAR_2), [
    "id",
    "name",
    "reference_image_lock",
    "avoid_character_surface_artifacts",
    "voice_personality",
  ]);
  assert.doesNotMatch(
    clip.scene_action.start_state,
    /32 years|short black hair|light blue collared shirt|dark grey trousers/i
  );
  assert.doesNotMatch(clip.background_lock.setting, /Minh|Lan/i);
  assert.doesNotMatch(
    clip.scene_action.motion,
    /single continuous motion, natural movement obeying/i
  );
  assert.ok(JSON.stringify(clip).length < 6500);
});
