import { parseArgs } from "jsr:@std/cli/parse-args";
import { join, basename, dirname } from "https://deno.land/std/path/mod.ts";
import MidiWriter from "npm:midi-writer-js";
import { midiToJson } from "jsr:@midi-json-tools/midi-to-json";

// Configuration
interface MidiOptions {
  bpm: number;
  noteDuration: number;
  accentVelocity: number;
  normalVelocity: number;
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
}

const DEFAULT_CONFIG: MidiOptions = {
  bpm: 120,
  noteDuration: 16,
  accentVelocity: 100,
  normalVelocity: 80,
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
  const ticksPerNote = MidiWriter.Utils.getTickDuration(config.noteDuration);
  
  track.addTrackName(filename.replace(/\.[^/.]+$/, ""));
  track.setTempo(config.bpm);

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
      duration: config.noteDuration,
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
    alias: { 'output': 'o' }
  }) as CommandLineArgs;
  
  const target = args._[0]?.toString();
  
  if (!target) {
    console.error("Usage: pat2midi <file|directory> [-o,--output <path>] [--debug]");
    Deno.exit(1);
  }

  // You could add command line options for MIDI configuration here
  const options: Partial<MidiOptions> = {
    bpm: args.bpm ? Number(args.bpm) : undefined,
    // Add other options as needed
  };

  try {
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
