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
}

// Add after MidiOptions interface
const LIMITS = {
  bpm: { min: 30, max: 240 },
  noteDuration: [1, 2, 4, 8, 16, 32, 64], // valid Duration values
  velocity: { min: 0, max: 100 }
};

function validateOptions(options: Partial<MidiOptions>): void {
  if (options.bpm !== undefined) {
    if (options.bpm < LIMITS.bpm.min || options.bpm > LIMITS.bpm.max) {
      throw new Error(`BPM must be between ${LIMITS.bpm.min} and ${LIMITS.bpm.max}`);
    }
  }

  if (options.noteDuration !== undefined) {
    if (!LIMITS.noteDuration.includes(options.noteDuration)) {
      throw new Error(`Note duration must be one of: ${LIMITS.noteDuration.join(', ')}`);
    }
  }

  if (options.accentVelocity !== undefined) {
    if (options.accentVelocity < LIMITS.velocity.min || options.accentVelocity > LIMITS.velocity.max) {
      throw new Error(`Accent velocity must be between ${LIMITS.velocity.min} and ${LIMITS.velocity.max}`);
    }
  }

  if (options.normalVelocity !== undefined) {
    if (options.normalVelocity < LIMITS.velocity.min || options.normalVelocity > LIMITS.velocity.max) {
      throw new Error(`Normal velocity must be between ${LIMITS.velocity.min} and ${LIMITS.velocity.max}`);
    }
  }
}

// Types
interface DrumHit {
  note: number | string;
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
}

// Replace the DEFAULT_CONFIG with validated values
const DEFAULT_CONFIG: MidiOptions = {
  bpm: 120,
  noteDuration: 16,
  accentVelocity: 80, // Adjusted to be within limits
  normalVelocity: 60, // Adjusted to be within limits
};

// Core functions
function parsePatFile(content: string, name: string): ParsedPattern {
  const lines = content.trim().split("\n");
  let accents: boolean[] = [];
  const hits: DrumHit[] = [];
  let patternLength = Infinity;

  lines.forEach((line) => {
    const [note, pattern] = line.trim().split(" ");
    if (!note || !pattern) return;

    if (note === "AC") {
      accents = pattern.split("").map((char) => char === "x");
      patternLength = Math.min(patternLength, pattern.length);
    } else {
      hits.push({ note, pattern });
      patternLength = Math.min(patternLength, pattern.length);
    }
  });

  // Validate and trim patterns
  hits.forEach(hit => {
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

  let wait = 0;

  for (let step = 0; step < patternLength; step++) {
    const notesAtStep = hits
      .filter(({ pattern }) => pattern[step] === 'x')
      .map(({ note }) => Number(note));

    if (notesAtStep.length === 0) {
      wait += ticksPerNote;
      continue;
    }

    const event = new MidiWriter.NoteEvent({
      pitch: notesAtStep,
      duration: noteDuration,
      velocity: accents[step] ? config.accentVelocity : config.normalVelocity,
      wait: "T" + wait
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
    console.log(`Converted ${basename(inputPath)} to ${await Deno.realPath(outputPath)}`);
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
      'output': 'o',
      'help': 'h'
    },
    string: ['output', 'o'],
    boolean: ['debug', 'help', 'h']
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
  --bpm=NUMBER             Set tempo in beats per minute (${LIMITS.bpm.min}-${LIMITS.bpm.max}, default: ${DEFAULT_CONFIG.bpm})
  --noteDuration=NUMBER    Set note duration (${LIMITS.noteDuration.join('|')}, default: ${DEFAULT_CONFIG.noteDuration})
  --accentVelocity=NUMBER  Set velocity for accented notes (${LIMITS.velocity.min}-${LIMITS.velocity.max}, default: ${DEFAULT_CONFIG.accentVelocity})
  --normalVelocity=NUMBER  Set velocity for normal notes (${LIMITS.velocity.min}-${LIMITS.velocity.max}, default: ${DEFAULT_CONFIG.normalVelocity})
  -h, --help               Display this help and exit`);
    Deno.exit(1);
  }

  const options: Partial<MidiOptions> = {
    bpm: args.bpm,
    noteDuration: args.noteDuration,
    accentVelocity: args.accentVelocity,
    normalVelocity: args.normalVelocity
  };

  // Remove undefined values
  Object.keys(options).forEach(key => 
    options[key as keyof MidiOptions] === undefined && delete options[key as keyof MidiOptions]
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
    console.error(`Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}`);
    Deno.exit(1);
  }
}

await main();
