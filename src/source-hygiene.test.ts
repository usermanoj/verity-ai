import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// A control byte in a source file makes git treat that file as BINARY: no
// diff, no blame, no merge resolution. It happened for real — a NUL used as a
// key separator in concept-failure.ts, the file holding every rule about what
// a teacher is told about a class of children. Nothing in review catches it;
// git prints "Bin 8076 -> 10433 bytes" and everyone reads past it.
//
// Escape sequences are fine and are what the code should use. This is about
// the bytes on disk.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css|sql|md)$/.test(name) ? [path] : [];
  });
}

describe("source files stay text", () => {
  it("contains no NUL or other C0 control bytes", () => {
    const offenders: string[] = [];
    for (const path of [...sourceFiles("src"), ...sourceFiles("supabase"), ...sourceFiles("scripts")]) {
      const bytes = readFileSync(path);
      // Tab (9), LF (10) and CR (13) are the legitimate ones.
      for (const b of bytes) {
        if (b < 0x20 && b !== 9 && b !== 10 && b !== 13) {
          offenders.push(`${path} contains byte 0x${b.toString(16).padStart(2, "0")}`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
