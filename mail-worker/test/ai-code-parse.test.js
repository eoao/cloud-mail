import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAiResult, extractCodeFromText } from '../src/utils/ai-code-parse.js';

describe('parseAiResult', () => {
	it('parses a JSON string with a string code', () => {
		assert.equal(parseAiResult('{"code":"739284"}'), '739284');
	});

	it('accepts a numeric code', () => {
		assert.equal(parseAiResult({ code: 739284 }), '739284');
	});

	it('reads Workers AI {response: jsonString}', () => {
		assert.equal(parseAiResult({ response: '{"code":"739284"}' }), '739284');
	});

	it('reads Workers AI {response: object}', () => {
		assert.equal(parseAiResult({ response: { code: '739284' } }), '739284');
	});

	it('extracts JSON wrapped in prose', () => {
		assert.equal(parseAiResult('Here you go:\n```json\n{"code":"739284"}\n```'), '739284');
	});

	it('accepts a bare 4-8 character code from the model', () => {
		assert.equal(parseAiResult('739284'), '739284');
	});

	it('accepts mixed alphanumeric codes', () => {
		assert.equal(parseAiResult({ code: 'A8K2M1' }), 'A8K2M1');
	});

	it('accepts all-caps letter codes', () => {
		assert.equal(parseAiResult({ code: 'XKLM' }), 'XKLM');
	});

	it('rejects codes longer than 8 characters', () => {
		assert.equal(parseAiResult({ code: '123456789' }), '');
	});

	it('rejects codes that contain spaces', () => {
		assert.equal(parseAiResult('{"code":"12 3456"}'), '');
	});

	it('rejects greeting words like Hello', () => {
		assert.equal(parseAiResult({ response: '{"code":"Hello"}' }), '');
	});
});

describe('extractCodeFromText', () => {
	it('picks the code after "verification code is"', () => {
		assert.equal(
			extractCodeFromText('Your verification code is 739284.\nThis code expires in 10 minutes.'),
			'739284'
		);
	});

	it('picks a simplified Chinese 验证码 with mixed alnum', () => {
		assert.equal(extractCodeFromText('您的验证码：A8K2M1，10分钟内有效'), 'A8K2M1');
	});

	it('picks 验证码紧贴数字（短信常见）', () => {
		assert.equal(extractCodeFromText('【淘宝】验证码123456，切勿泄露'), '123456');
	});

	it('picks 校验码 / 确认码 / 动态密码', () => {
		assert.equal(extractCodeFromText('校验码是 8821'), '8821');
		assert.equal(extractCodeFromText('确认码：QWERTY'), 'QWERTY');
		assert.equal(extractCodeFromText('动态密码为 Ab12Cd'), 'Ab12Cd');
	});

	it('picks English OTP / passcode / PIN', () => {
		assert.equal(extractCodeFromText('Your OTP is 440188'), '440188');
		assert.equal(extractCodeFromText('one-time passcode: XK4P9Q'), 'XK4P9Q');
		assert.equal(extractCodeFromText('PIN code 882911'), '882911');
	});

	it('picks a code from a forwarded SMS email', () => {
		assert.equal(
			extractCodeFromText('转发短信\nFrom: +8613800138000\n【银行】短信验证码 440188，5分钟内有效'),
			'440188'
		);
	});

	it('picks a code from an English forwarded SMS', () => {
		assert.equal(
			extractCodeFromText('Forwarded SMS from +15551212:\nYour verification code is 562913'),
			'562913'
		);
	});

	it('returns empty when there is no verification phrasing', () => {
		assert.equal(extractCodeFromText('Invoice 20260829 amount 123456'), '');
	});

	it('skips Hello after the subject and takes the real code', () => {
		assert.equal(
			extractCodeFromText('Your verification code\nHello,\n\nYour verification code is 481627.'),
			'481627'
		);
	});
});
