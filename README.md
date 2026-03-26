# pat2midi

A command-line tool to convert drum pattern text files (.pat) to MIDI files. Based on the file format from the [drum-patterns](https://github.com/jcelerier/drum-patterns) repository.

## Basic Usage

Convert a single pattern file to MIDI:
```bash
deno --allow-read --allow-write pat2midi.ts examples/example.pat
```

Convert a pattern file with custom velocity settings:
```bash
deno --allow-read --allow-write pat2midi.ts examples/named.pat --accentVelocity 100 --normalVelocity 80
```

Convert all pattern files in a directory:
```bash
deno --allow-read --allow-write pat2midi.ts examples
```

Debug mode outputs MIDI file contents as JSON:
```bash
deno --allow-read --allow-write pat2midi.ts examples/example.pat --debug
```

## Pattern File Format (.pat)

Pattern files use a simple text format where each line represents a drum instrument:

```
42 x---x---x---x---
38 ----x-------x---
36 x-------x-x-----
AC ----x-------x---
```

Each line contains:
- A MIDI note number or drum name (e.g., 42 or CH)
- A pattern using the following characters:
  - `x` — regular hit
  - `f` — flam (grace note played just before the main hit at reduced velocity)
  - `-` — silence
- Optional `AC` line defining accents (marks which steps have higher velocity)

### Flam Notation

A flam (`f`) is a drumming technique consisting of a quiet grace note played slightly before the main stroke. Use `f` in a pattern wherever you want a flam hit:

```
SD ----f-------x---
BD x-------x-x-----
CH x---x---x---x---
AC ----x-------x---
```

In this example, the snare drum plays a flam on beat 2 and a normal hit on beat 4.

See [examples/flam.pat](examples/flam.pat) for a complete flam pattern example.

## Using Drum Names

Standard drum names can replace MIDI numbers:

```
CH --x---x---x--xx-
CP ----x-------x---
BD x---x---x---x---
AC ----x-------x-x-
```

### Supported Drum Names:

| Name | Description    | MIDI Note |
|------|---------------|-----------|
| BD   | Bass Drum     | 36        |
| RS   | Rim Shot      | 37        |
| SD   | Snare Drum    | 38        |
| CP   | Clap          | 39        |
| CH   | Closed Hi-hat | 42        |
| LT   | Low Tom       | 43        |
| OH   | Open Hi-hat   | 46        |
| MT   | Mid Tom       | 47        |
| CY   | Crash Cymbal  | 49        |
| HT   | High Tom      | 50        |
| CB   | Cowbell       | 56        |

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output=PATH` | Specify output file or directory | input filename with `.mid` extension |
| `--debug` | Output MIDI file contents as JSON instead of writing file | `false` |
| `--bpm=NUMBER` | Set tempo in beats per minute (30–240) | `120` |
| `--noteDuration=NUMBER` | Set note duration (`1\|2\|4\|8\|16\|32\|64`) | `16` |
| `--accentVelocity=NUMBER` | Set velocity for accented notes (0–100) | `80` |
| `--normalVelocity=NUMBER` | Set velocity for normal notes (0–100) | `60` |
| `--flamOffset=NUMBER` | Set flam grace note offset in ticks (`64\|128\|256`) | `128` |
| `--flamVelocity=NUMBER` | Set flam grace note velocity (0–100) | `40` |
| `--no-flams` | Disable flam processing (treat `f` as a normal hit) | `false` |
| `-h, --help` | Display help and exit | |

### Flam configuration

Flam grace notes play `--flamOffset` ticks before the main hit at a velocity set by `--flamVelocity`. A lower `--flamVelocity` produces a softer, more realistic flam.

Convert a pattern with custom flam settings:
```bash
deno --allow-read --allow-write pat2midi.ts examples/flam.pat --flamOffset 64 --flamVelocity 30
```

Disable flam processing so all `f` characters are treated as normal hits:
```bash
deno --allow-read --allow-write pat2midi.ts examples/flam.pat --no-flams
```

## Background

Inspired by [drum-machine-patterns](https://github.com/montoyamoraga/drum-machine-patterns), [drum-patterns](https://github.com/jcelerier/drum-patterns) and René-Pierre Bardet's book *200 Drum Machine Patterns*. Created to provide ready-to-use MIDI drum patterns.
