import { parseArgs } from "jsr:@std/cli/parse-args";
import { join, basename } from "jsr:@std/path";
import MidiWriter from "npm:midi-writer-js";
import { midiToJson } from "jsr:@midi-json-tools/midi-to-json";

// Configuration
interface MidiOptions {
  bpm: number;
  noteDuration: number;
  accentVelocity: number;
  normalVelocity: number;
  flamDuration: number; // New: offset in ticks for flam grace note
  flamVelocity: number; // New: velocity for flam grace note
  noFlams: boolean; // New: option to disable flams
}

// Add after MidiOptions interface
const LIMITS = {
  bpm: { min: 30, max: 240 },
  noteDuration: [1, 2, 4, 8, 16, 32, 64], // valid Duration values
  velocity: { min: 0, max: 100 },
  flamDuration: [64, 128, 256], // New: valid flam duration values
};

function validateOptions(options: Partial<MidiOptions>): void {
  if (options.bpm !== undefined) {
    if (options.bpm < LIMITS.bpm.min || options.bpm > LIMITS.bpm.max) {
      throw new Error(
        `BPM must be between ${LIMITS.bpm.min} and ${LIMITS.bpm.max}`
      );
    }
  }

  if (options.noteDuration !== undefined) {
    if (!LIMITS.noteDuration.includes(options.noteDuration)) {
      throw new Error(
        `Note duration must be one of: ${LIMITS.noteDuration.join(", ")}`
      );
    }
  }

  if (options.accentVelocity !== undefined) {
    if (
      options.accentVelocity < LIMITS.velocity.min ||
      options.accentVelocity > LIMITS.velocity.max
    ) {
      throw new Error(
        `Accent velocity must be between ${LIMITS.velocity.min} and ${LIMITS.velocity.max}`
      );
    }
  }

  if (options.normalVelocity !== undefined) {
    if (
      options.normalVelocity < LIMITS.velocity.min ||
      options.normalVelocity > LIMITS.velocity.max
    ) {
      throw new Error(
        `Normal velocity must be between ${LIMITS.velocity.min} and ${LIMITS.velocity.max}`
      );
    }
  }

  if (options.flamDuration !== undefined) {
    if (!LIMITS.flamDuration.includes(options.flamDuration)) {
      throw new Error(
        `Flam duration must be one of: ${LIMITS.flamDuration.join(", ")}`
      );
    }
    
    // Ensure flamDuration is larger than noteDuration
    const noteDur = options.noteDuration || DEFAULT_CONFIG.noteDuration;
    if (options.flamDuration <= noteDur) {
      throw new Error(
        `Flam duration (${options.flamDuration}) must be larger than note duration (${noteDur})`
      );
    }
  }
  if (options.flamVelocity !== undefined) {
    if (
      options.flamVelocity < LIMITS.velocity.min ||
      options.flamVelocity > LIMITS.velocity.max
    ) {
      throw new Error(
        `Flam velocity must be between ${LIMITS.velocity.min} and ${LIMITS.velocity.max}`
      );
    }
  }
}

// Add drum name to MIDI note mapping
const DRUM_MAP: { [key: string]: number } = {
  BD: 36,
  RS: 37,
  SD: 38,
  CP: 39,
  CH: 42,
  LT: 43,
  OH: 46,
  MT: 47,
  CY: 49,
  HT: 50,
  CB: 56,
};

// Add this helper function after DRUM_MAP definition
function getDrumNote(noteStr: string): number | undefined {
  const upperKey = noteStr.toUpperCase();
  return DRUM_MAP[upperKey] ?? parseInt(noteStr, 10);
}

// Types
interface DrumHit {
  note: number;
  pattern: string;
}

interface ParsedPattern {
  hits: DrumHit[];
  accents: boolean[];
  patternLength: number;
}

interface CommandLineArgs {
  _: (string | number)[];
  output?: string;
  debug?: boolean;
  o?: string;
  help?: boolean;
  h?: boolean;
  bpm?: number;
  noteDuration?: number;
  accentVelocity?: number;
  normalVelocity?: number;
  noFlams?: boolean; // New: CLI argument for disabling flams
}

// Replace the DEFAULT_CONFIG with validated values
const DEFAULT_CONFIG: MidiOptions = {
  bpm: 120,
  noteDuration: 16,
  accentVelocity: 80, 
  normalVelocity: 60,  
  flamDuration: 128, 
  flamVelocity: 40, // Quieter than normal hits
  noFlams: false, // New: default to allowing flams
};

// Core functions
function parsePatFile(content: string, name: string): ParsedPattern {
  const lines = content.trim().split("\n");
  let accents: boolean[] = [];
  const hits: DrumHit[] = [];
  let patternLength = Infinity;

  lines.forEach((line) => {
    const [noteStr, pattern] = line.trim().split(/\s+/, 2);
    if (!noteStr || !pattern) return;

    if (noteStr.toUpperCase() === "AC") {
      accents = pattern.split("").map((char) => char.toUpperCase() === "X");
      patternLength = Math.min(patternLength, pattern.length);
    } else {
      const note = getDrumNote(noteStr);
      if (note === undefined || isNaN(note)) {
        console.error(`Invalid note '${noteStr}' in file ${name}`);
        return;
      }
      hits.push({ note, pattern });
      patternLength = Math.min(patternLength, pattern.length);
    }
  });

  // Validate and trim patterns
  hits.forEach((hit) => {
    hit.pattern = hit.pattern.substring(0, patternLength);
  });
  accents = accents.slice(0, patternLength);

  return { hits, accents, patternLength };
}

function convertPatternToMidi(
  parsedData: ParsedPattern,
  filename: string,
  options: Partial<MidiOptions> = {}
): Uint8Array {
  const config = { ...DEFAULT_CONFIG, ...options };
  const { hits, accents, patternLength } = parsedData;
  const track = new MidiWriter.Track();
  const flamTrack = new MidiWriter.Track(); // New: track for flam grace notes
  let noteDuration = config.noteDuration;

  track.addTrackName(filename.replace(/\.[^/.]+$/, ""));
  track.setTempo(config.bpm);
  if (patternLength % 8 === 0) {
    track.setTimeSignature(patternLength / 4, 4);
  } else {
    track.setTimeSignature(patternLength, 8);
    noteDuration /= 2;
  }
  const ticksPerNote = MidiWriter.Utils.getTickDuration(noteDuration);
  const ticksPerFlam = MidiWriter.Utils.getTickDuration(config.flamDuration);

  let wait = 0;

  for (let step = 0; step < patternLength; step++) {
    const notesAtStep = hits
      .filter(({ pattern }) => {
        const char = pattern[step].toUpperCase();
        return char === "X" || char === "F";
      })
      .map(({ note, pattern }) => ({
        isFlam: pattern[step].toUpperCase() === "F",
        midiValue: Number(note),
      }));

    if (notesAtStep.length === 0) {
      wait += ticksPerNote;
      continue;
    }

    // Process flams (without noFlams check)
    if (!config.noFlams) {
      const tick = step * ticksPerNote - ticksPerFlam
      notesAtStep.filter(note => note.isFlam).forEach((note) => {
          const graceNote = new MidiWriter.NoteEvent({
            pitch: [note.midiValue],
            duration: 'T' + (ticksPerFlam - 1),
            velocity: accents[step] ? config.normalVelocity : config.flamVelocity,
            tick: tick < 0 ? ticksPerFlam: tick,
          });
          track.addEvent(graceNote);
      });
    }

    // Regular note (treat flams as normal hits if noFlams is true)
    const event = new MidiWriter.NoteEvent({
      pitch: notesAtStep.map(note => note.midiValue),
      duration: noteDuration,
      velocity: accents[step] ? config.accentVelocity : config.normalVelocity,
      wait: "T" + wait,
    });

    track.addEvent(event);
    wait = 0;
  }

  return new Uint8Array(new MidiWriter.Writer([track]).buildFile());
}

// File processing functions
async function processFile(
  inputPath: string,
  outputPath: string,
  debug: boolean,
  options?: Partial<MidiOptions>
) {
  try {
    const content = await Deno.readTextFile(inputPath);
    const filename = basename(inputPath);
    const parsedData = parsePatFile(content, filename);
    const midiBuffer = convertPatternToMidi(parsedData, filename, options);

    if (debug) {
      const midiJson = await midiToJson(midiBuffer.buffer);
      console.log(JSON.stringify(midiJson, null, 2));
      return;
    }

    await Deno.writeFile(outputPath, midiBuffer);
    console.log(
      `Converted ${basename(inputPath)} to ${await Deno.realPath(outputPath)}`
    );
  } catch (error) {
    throw new Error(`Failed to process file ${inputPath}: ${error.message}`);
  }
}

async function processDirectory(
  inputDir: string,
  outputDir: string,
  debug: boolean,
  options?: Partial<MidiOptions>
) {
  await Deno.mkdir(outputDir, { recursive: true });

  for await (const entry of Deno.readDir(inputDir)) {
    if (!entry.isFile || !entry.name.endsWith(".pat")) continue;

    const inputPath = join(inputDir, entry.name);
    const outputPath = join(outputDir, entry.name.replace(".pat", ".mid"));
    await processFile(inputPath, outputPath, debug, options);
  }
}

// Main execution
async function main() {
  const args = parseArgs(Deno.args, {
    alias: {
      output: "o",
      help: "h",
    },
    string: ["output", "o"],
    boolean: ["debug", "help", "h", "no-flams"], // Added no-flams to boolean options
  }) as CommandLineArgs;

  const target = args._[0]?.toString();

  if (!target || args.help || args.h) {
    console.error(`Usage: pat2midi [OPTION]... FILE...

Convert .pat files to MIDI files.

Examples:
  pat2midi example.pat                    Convert single pattern to MIDI
  pat2midi -o output.mid pattern.pat      Convert to specific output file
  pat2midi --bpm 140 patterns/            Convert all patterns in directory
  pat2midi --debug pattern.pat            Show MIDI file contents as JSON

Options:
  -o, --output=PATH        Specify output file or directory
  --debug                  Output MIDI file contents as JSON instead of writing file
  --bpm=NUMBER             Set tempo in beats per minute (${LIMITS.bpm.min}-${
      LIMITS.bpm.max
    }, default: ${DEFAULT_CONFIG.bpm})
  --noteDuration=NUMBER    Set note duration (${LIMITS.noteDuration.join(
    "|"
  )}, default: ${DEFAULT_CONFIG.noteDuration})
  --accentVelocity=NUMBER  Set velocity for accented notes (${
    LIMITS.velocity.min
  }-${LIMITS.velocity.max}, default: ${DEFAULT_CONFIG.accentVelocity})
  --normalVelocity=NUMBER  Set velocity for normal notes (${
    LIMITS.velocity.min
  }-${LIMITS.velocity.max}, default: ${DEFAULT_CONFIG.normalVelocity})
  --flamOffset=NUMBER     Set flam grace note offset in ticks (0-20, default: ${
    DEFAULT_CONFIG.flamDuration
  })
  --flamVelocity=NUMBER   Set flam grace note velocity (${
    LIMITS.velocity.min
  }-${LIMITS.velocity.max}, default: ${DEFAULT_CONFIG.flamVelocity})
  --no-flams             Disable flam processing (convert flams to normal hits)
  -h, --help               Display this help and exit`);
    Deno.exit(1);
  }

  const options: Partial<MidiOptions> = {
    bpm: args.bpm,
    noteDuration: args.noteDuration,
    accentVelocity: args.accentVelocity,
    normalVelocity: args.normalVelocity,
    noFlams: args["no-flams"], // Add the no-flams option
  };

  // Remove undefined values
  Object.keys(options).forEach(
    (key) =>
      options[key as keyof MidiOptions] === undefined &&
      delete options[key as keyof MidiOptions]
  );

  try {
    validateOptions(options);
    const info = await Deno.stat(target);
    if (info.isDirectory) {
      const outputDir = args.output || join(target, "midi");
      await processDirectory(target, outputDir, args.debug ?? false, options);
    } else {
      const outputPath = args.output || target.replace(".pat", ".mid");
      await processFile(target, outputPath, args.debug ?? false, options);
    }
  } catch (error) {

    console.error(
      `Error: ${
        error instanceof Error ? error.message : "An unknown error occurred"
      }`
    );
    Deno.exit(1);
  }
}

await main();
