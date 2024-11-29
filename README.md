# pat2midi

A command-line tool to convert drum pattern text files (.pat) to MIDI files. This project was inspired by the filetype specified in the [drum-patterns](https://github.com/jcelerier/drum-patterns) repository.

## Basic Usage

Convert a single pattern file to MIDI:
```bash
pat2midi example.pat
```

Convert a pattern file with custom velocity settings:
```bash
pat2midi example.pat --accentVelocity 100 --normalVelocity 80
```

Convert all pattern files in a directory:
```bash
pat2midi patterns
```

Use debug mode to output MIDI file contents as JSON:
```bash
pat2midi example.pat --debug
```

## Pattern File Format (.pat)

Pattern files use a simple text format where each line represents a drum instrument:
```
42 x---x---x---x---
38 ----x-------x---
36 x-------x-x-----
AC ----x-------x---
```

- Each number represents a MIDI note
- 'x' marks a hit, '-' represents silence
- Special 'AC' line defines accent pattern

## Acknowledgments

This project was inspired by the [drum-patterns](https://github.com/jcelerier/drum-patterns) repository.
