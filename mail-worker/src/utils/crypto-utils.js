const encoder = new TextEncoder();

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_PREFIX = '$pbkdf2$';

const saltHashUtils = {

	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return btoa(String.fromCharCode(...array));
	},

	async hashPassword(password) {
		const salt = this.generateSalt();
		const hash = await this._pbkdf2Hash(password, salt);
		return { salt, hash };
	},

	async _pbkdf2Hash(password, salt) {
		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			encoder.encode(password),
			'PBKDF2',
			false,
			['deriveBits']
		);

		const derived = await crypto.subtle.deriveBits(
			{
				name: 'PBKDF2',
				salt: encoder.encode(salt),
				iterations: PBKDF2_ITERATIONS,
				hash: 'SHA-256',
			},
			keyMaterial,
			256
		);

		const hashArray = Array.from(new Uint8Array(derived));
		return PBKDF2_PREFIX + btoa(String.fromCharCode(...hashArray));
	},

	async _legacyHash(password, salt) {
		const data = encoder.encode(salt + password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return btoa(String.fromCharCode(...hashArray));
	},

	async verifyPassword(inputPassword, salt, storedHash) {
		if (storedHash && storedHash.startsWith(PBKDF2_PREFIX)) {
			const hash = await this._pbkdf2Hash(inputPassword, salt);
			return hash === storedHash;
		}

		const legacyHash = await this._legacyHash(inputPassword, salt);
		return legacyHash === storedHash;
	},

	async needsRehash(storedHash) {
		return !storedHash || !storedHash.startsWith(PBKDF2_PREFIX);
	},

	genRandomPwd(length = 16) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(array[i] % chars.length);
		}
		return result;
	}
};

export default saltHashUtils;
