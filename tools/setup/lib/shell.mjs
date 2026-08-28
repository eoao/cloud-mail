import { spawn } from 'node:child_process';

/**
 * Run a command, streaming its output only when it fails. Keeps the wizard's
 * happy path quiet while still surfacing everything on an error.
 */
export function run(command, args, { cwd, env, quiet = true, input } = {}) {
	return new Promise((resolve, reject) => {

		const child = spawn(command, args, {
			cwd,
			env: { ...process.env, ...env },
			stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe']
		});

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', d => {
			stdout += d;
			if (!quiet) process.stdout.write(d);
		});
		child.stderr.on('data', d => {
			stderr += d;
			if (!quiet) process.stderr.write(d);
		});

		if (input !== undefined) {
			child.stdin.write(input);
			child.stdin.end();
		}

		child.on('error', reject);

		child.on('close', code => {
			if (code === 0) {
				return resolve({ stdout, stderr });
			}
			const detail = (stderr || stdout).trim().split('\n').slice(-6).join('\n');
			reject(new Error(`${command} ${args.join(' ')} exited ${code}\n${detail}`));
		});
	});
}

export async function has(command) {
	try {
		await run(command, ['--version']);
		return true;
	} catch {
		return false;
	}
}
