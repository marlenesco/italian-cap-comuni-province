import { updateDatasets, verifyLocal } from './update.mjs';
import { formatReport } from './report.mjs';

try {
  const [command, ...args] = process.argv.slice(2);
  if (!['verify', 'check', 'update'].includes(command)) throw new Error('Expected verify, check or update');
  const options = {};
  const names = { '--archive': 'archive', '--source-date': 'sourceDate', '--sha256': 'sha256', '--report': 'report' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') options.dryRun = true;
    else if (names[args[i]] && args[i + 1] && !args[i + 1].startsWith('--')) options[names[args[i]]] = args[++i];
    else throw new Error(`Unknown or incomplete option: ${args[i]}`);
  }
  if (command === 'verify') {
    if (args.length) throw new Error('verify does not accept options');
    console.log(JSON.stringify(verifyLocal(), null, 2));
  } else {
    if (command === 'check') {
      if (options.report) throw new Error('check does not write reports; use update --dry-run --report');
      options.dryRun = true;
    }
    const report = await updateDatasets(options);
    const markdown = formatReport(report);
    console.log(markdown);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
