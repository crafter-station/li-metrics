export type CliOptions = {
  json: boolean;
  ndjson: boolean;
  cdp: string;
  timeout: string;
  receiptDir: string;
};

export type ParsedCli = {
  options: CliOptions;
  positionals: string[];
  help: boolean;
  dryRun: boolean;
  details: boolean;
  days: string;
  since?: string;
  full: boolean;
};

function valueAfter(args: string[], index: number, flag: string): string {
  if (index + 1 >= args.length) {
    throw new Error(`Missing value for ${flag}`);
  }
  const value = args[index + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function inlineValue(argument: string, flag: string): string | undefined {
  const prefix = `${flag}=`;
  return argument.startsWith(prefix)
    ? argument.slice(prefix.length)
    : undefined;
}

export function parseCliArgs(
  args: string[],
  defaultReceiptDirectory: string,
): ParsedCli {
  const options: CliOptions = {
    json: false,
    ndjson: false,
    cdp: "9222",
    timeout: "20000",
    receiptDir: defaultReceiptDirectory,
  };
  const positionals: string[] = [];
  let help = false;
  let dryRun = false;
  let details = true;
  let days = "7";
  let since: string | undefined;
  let full = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      continue;
    }
    if (argument === "--") {
      for (let rest = index + 1; rest < args.length; rest += 1) {
        const positional = args[rest];
        if (positional !== undefined) {
          positionals.push(positional);
        }
      }
      break;
    }
    if (argument === "-h" || argument === "--help") {
      help = true;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--ndjson") {
      options.ndjson = true;
    } else if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--no-details") {
      details = false;
    } else if (argument === "--full") {
      full = true;
    } else if (argument === "--color" || argument === "--no-color") {
    } else if (argument === "--cdp") {
      options.cdp = valueAfter(args, index, argument);
      index += 1;
    } else if (argument === "--timeout") {
      options.timeout = valueAfter(args, index, argument);
      index += 1;
    } else if (argument === "--receipt-dir") {
      options.receiptDir = valueAfter(args, index, argument);
      index += 1;
    } else if (argument === "--days") {
      days = valueAfter(args, index, argument);
      index += 1;
    } else if (argument === "--since") {
      since = valueAfter(args, index, argument);
      index += 1;
    } else {
      const cdp = inlineValue(argument, "--cdp");
      const timeout = inlineValue(argument, "--timeout");
      const receiptDirectory = inlineValue(argument, "--receipt-dir");
      const selectedDays = inlineValue(argument, "--days");
      const selectedSince = inlineValue(argument, "--since");
      if (cdp !== undefined) {
        options.cdp = cdp;
      } else if (timeout !== undefined) {
        options.timeout = timeout;
      } else if (receiptDirectory !== undefined) {
        options.receiptDir = receiptDirectory;
      } else if (selectedDays !== undefined) {
        days = selectedDays;
      } else if (selectedSince !== undefined) {
        since = selectedSince;
      } else if (argument.startsWith("-")) {
        throw new Error(`Unknown option: ${argument}`);
      } else {
        positionals.push(argument);
      }
    }
  }

  if (options.json && options.ndjson) {
    throw new Error("--json and --ndjson cannot be used together");
  }

  return {
    options,
    positionals,
    help,
    dryRun,
    details,
    days,
    since,
    full,
  };
}

export function helpText(path: string[], receiptDirectory: string): string {
  const command = path.join(" ");
  if (command === "doctor") {
    return "Usage: li-metrics doctor\n\nCheck the browser bridge and LinkedIn session.";
  }
  if (command === "schema") {
    return "Usage: li-metrics schema [operation]\n\nPrint machine-readable operation schemas.";
  }
  if (command === "posts") {
    return "Usage: li-metrics posts <command>\n\nCommands:\n  week  list posts visible in the 7-day analytics dashboard";
  }
  if (command === "posts week") {
    return "Usage: li-metrics posts week [--days 7] [--no-details]\n\nList posts visible in the 7-day analytics dashboard.";
  }
  if (command === "post") {
    return "Usage: li-metrics post <command>\n\nCommands:\n  metrics <post>  capture metrics for a LinkedIn post link or URN";
  }
  if (command === "post metrics") {
    return "Usage: li-metrics post metrics <post>\n\nCapture metrics for a LinkedIn post link or URN.";
  }
  if (command === "checkpoint") {
    return "Usage: li-metrics checkpoint <command>\n\nCommands:\n  capture <post>  capture and persist an append-only metric receipt";
  }
  if (command === "checkpoint capture") {
    return "Usage: li-metrics checkpoint capture [--dry-run] <post>\n\nCapture and persist an append-only metric receipt.";
  }
  if (command === "backfill") {
    return "Usage: li-metrics backfill [--dry-run] <posts...>\n\nCapture and persist lifetime receipts for multiple LinkedIn posts.";
  }
  if (command === "trend") {
    return "Usage: li-metrics trend\n\nCompare the first and latest local checkpoint for each post.";
  }
  if (command === "cohort") {
    return "Usage: li-metrics cohort --since YYYY-MM-DD\n\nRank the latest local receipt for posts published on or after a date.";
  }
  if (command === "import") {
    return "Usage: li-metrics import <command>\n\nCommands:\n  xlsx <files...>  import LinkedIn single-post XLSX exports";
  }
  if (command === "import xlsx") {
    return "Usage: li-metrics import xlsx [--dry-run] <files...>\n\nImport one or more LinkedIn single-post XLSX exports.";
  }
  if (command === "reconcile") {
    return "Usage: li-metrics reconcile <files...>\n\nCompare receipt files without overwriting history.";
  }
  if (command === "brief") {
    return "Usage: li-metrics brief <command>\n\nCommands:\n  week  produce a conservative weekly decision brief";
  }
  if (command === "brief week") {
    return "Usage: li-metrics brief week\n\nProduce a conservative weekly decision brief.";
  }
  if (command === "receipt") {
    return "Usage: li-metrics receipt <command>\n\nCommands:\n  list  list stored metric receipts";
  }
  if (command === "receipt list") {
    return "Usage: li-metrics receipt list\n\nList stored metric receipts.";
  }
  if (command === "skills") {
    return "Usage: li-metrics skills <command>\n\nCommands:\n  list             list bundled agent skills\n  get core         print version-matched agent instructions\n  get core --full  print the complete agent guide";
  }
  if (command === "skills list") {
    return "Usage: li-metrics skills list\n\nList bundled agent skills.";
  }
  if (command === "skills get") {
    return "Usage: li-metrics skills get core [--full]\n\nPrint version-matched agent instructions.";
  }
  if (command.length > 0) {
    throw new Error(`Unknown command: ${command}`);
  }
  return `Usage: li-metrics [options] <command>

Read-only LinkedIn post analytics through an authenticated browser

Options:
  --json                    emit compact JSON for agents
  --ndjson                  emit one JSON object per line for agents
  --color                   force colors in human output
  --no-color                disable colors in human output
  --cdp <port>              Dia remote debugging port (default: "9222")
  --timeout <milliseconds>  browser command timeout (default: "20000")
  --receipt-dir <path>      append-only receipt directory (default: "${receiptDirectory}")
  -h, --help                display help

Commands:
  doctor
  schema [operation]
  posts week
  post metrics <post>
  checkpoint capture <post>
  backfill <posts...>
  trend
  cohort --since YYYY-MM-DD
  import xlsx <files...>
  reconcile <files...>
  brief week
  receipt list
  skills list
  skills get core [--full]`;
}
