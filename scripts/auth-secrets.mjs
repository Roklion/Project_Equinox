import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import readline from "node:readline";

const scrypt = promisify(scryptCallback);
const command = process.argv[2];

if (command === "secret") {
  process.stdout.write(`${randomBytes(32).toString("hex")}\n`);
} else if (command === "hash") {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write("Run this command in an interactive terminal.\n");
    process.exitCode = 1;
  } else {
    const input = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    input._writeToOutput = function (text) {
      if (text.startsWith("Password: ") || text === "\n" || text === "\r\n") process.stdout.write(text);
    };
    const password = await new Promise((resolve) => input.question("Password: ", resolve));
    input.close();
    if (!password) {
      process.stderr.write("Password must not be empty.\n");
      process.exitCode = 1;
    } else {
      const salt = randomBytes(16);
      const hash = await scrypt(password, salt, 32, { N: 16384, r: 8, p: 1 });
      process.stdout.write(`scrypt$16384$8$1$${salt.toString("hex")}$${hash.toString("hex")}\n`);
    }
  }
} else {
  process.stderr.write("Usage: node scripts/auth-secrets.mjs hash|secret\n");
  process.exitCode = 1;
}
