import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

export async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`${message} (y/n): `);
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

export async function prompt(message: string): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`${message}: `);
    return answer.trim();
  } finally {
    rl.close();
  }
}
