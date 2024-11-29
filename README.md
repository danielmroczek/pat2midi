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
- A pattern using 'x' (hit) and '-' (silence)
- Optional 'AC' line defining accents

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

## Background

Inspired by [drum-machine-patterns](https://github.com/montoyamoraga/drum-machine-patterns), [drum-patterns](https://github.com/jcelerier/drum-patterns) and René-Pierre Bardet's book *200 Drum Machine Patterns*. Created to provide ready-to-use MIDI drum patterns.
