import { describe, expect, it } from 'vitest';
import userService from '../src/service/user-service';

describe('userService.batchAdd', () => {
	it('returns created credentials while isolating duplicate and failed rows', async () => {
		const add = async (_context, item) => {
			if (item.email === 'fail@example.com') throw new Error('Role does not exist.');
			return { userId: 100 + item.password.length, email: item.email };
		};
		const result = await userService.batchAdd.call({ add }, {}, [
			{ email: 'alice@example.com', password: 'Password123', type: 1 },
			{ email: 'ALICE@example.com', password: 'Password456', type: 1 },
			{ email: 'fail@example.com', password: 'Password789', type: 1 },
			{ email: 'bob@example.com', password: 'Password321', type: 1 }
		]);

		expect(result.created).toEqual([
			{ email: 'alice@example.com', password: 'Password123', userId: 111 },
			{ email: 'bob@example.com', password: 'Password321', userId: 111 }
		]);
		expect(result.failed).toEqual([
			{ index: 2, email: 'ALICE@example.com', message: 'Duplicate email in this batch.' },
			{ index: 3, email: 'fail@example.com', message: 'Role does not exist.' }
		]);
	});

	it('uses the selected default role for every imported row', async () => {
		let capturedUsers = [];
		const batchAdd = async (_context, users) => {
			capturedUsers = users;
			return { created: [], failed: [] };
		};
		await userService.batchImport.call({ batchAdd }, {}, {
			type: 7,
			users: [{ email: 'alice@example.com', password: 'Password123', type: 99 }]
		});
		expect(capturedUsers).toEqual([
			{ email: 'alice@example.com', password: 'Password123', type: 7 }
		]);
	});
});
