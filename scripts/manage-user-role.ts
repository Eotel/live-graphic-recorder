#!/usr/bin/env bun

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { DB_CONFIG } from "../src/config/constants";
import { PersistenceService } from "../src/services/server/persistence";
import { isUserRole, USER_ROLES, type UserRole } from "../src/types/auth";

interface CliOptions {
  email?: string;
  role?: UserRole;
  dbPath: string;
  interactive: boolean;
  help: boolean;
}

function printUsage(): void {
  console.log(`
Usage:
  bun run user:role -- --email <email> --role <user|staff|admin>
  bun run user:role -- --interactive

Options:
  --email <email>        Target user email
  --role <role>          New role (user | staff | admin)
  --db <path>            Database path (default: ${DB_CONFIG.defaultPath})
  --interactive          Prompt for missing fields
  --no-interactive       Disable prompts; requires --email and --role
  --help                 Show this help
  `);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dbPath: DB_CONFIG.defaultPath,
    interactive: true,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "--") continue;

    switch (arg) {
      case "--email":
        options.email = argv[i + 1];
        i += 1;
        break;
      case "--role": {
        const role = argv[i + 1];
        if (isUserRole(role)) {
          options.role = role;
        } else if (role) {
          throw new Error(`Invalid role: ${role}`);
        }
        i += 1;
        break;
      }
      case "--db":
        options.dbPath = argv[i + 1] ?? DB_CONFIG.defaultPath;
        i += 1;
        break;
      case "--interactive":
        options.interactive = true;
        break;
      case "--no-interactive":
        options.interactive = false;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function promptForMissing(options: CliOptions): Promise<CliOptions> {
  if (!options.interactive) {
    return options;
  }

  if (options.email && options.role) {
    return options;
  }

  const rl = createInterface({ input, output });
  try {
    const next = { ...options };

    if (!next.email) {
      const emailInput = await rl.question("Email: ");
      next.email = emailInput;
    }

    if (!next.role) {
      const roleInput = await rl.question(`Role (${USER_ROLES.join("/")}) [admin]: `);
      const normalizedRole = (roleInput.trim() || "admin").toLowerCase();
      if (!isUserRole(normalizedRole)) {
        throw new Error(`Invalid role: ${normalizedRole}`);
      }
      next.role = normalizedRole;
    }

    return next;
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  let options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  options = await promptForMissing(options);

  const email = options.email ? normalizeEmail(options.email) : "";
  const role = options.role;

  if (!email) {
    throw new Error("--email is required");
  }
  if (!role || !isUserRole(role)) {
    throw new Error("--role is required and must be one of user/staff/admin");
  }

  const service = new PersistenceService(options.dbPath, DB_CONFIG.defaultMediaPath);
  try {
    const user = service.getUserByEmail(email);
    if (!user) {
      throw new Error(`User not found: ${email}`);
    }

    const updated = service.setUserRole(user.id, role);
    if (!updated) {
      throw new Error("Failed to update user role");
    }

    console.log(`[user:role] updated user=${updated.email} id=${updated.id} role=${updated.role}`);
  } finally {
    service.close();
  }
}

main().catch((error) => {
  console.error("[user:role] failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
