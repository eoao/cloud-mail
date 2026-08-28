// Standalone sanity check for the Faz 0 hardening. Run: node test/faz0-verify.mjs
import webhookUtils from '../src/utils/webhook-utils.js';
import { pollDelay, MAX_DELAY_MS } from '../../mail-vue/src/utils/poll-utils.js';

const secretRaw = crypto.getRandomValues(new Uint8Array(24));
const secret = 'whsec_' + btoa(String.fromCharCode(...secretRaw));

const id = 'msg_test';
const ts = String(Math.floor(Date.now() / 1000));
const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'x' } });

const key = await crypto.subtle.importKey('raw', secretRaw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
const sig = 'v1,' + btoa(String.fromCharCode(...mac));

const H = (o) => new Headers(o);
const signed = { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sig };

console.log('valid signature       ->', JSON.stringify(await webhookUtils.verifySvix(secret, H(signed), body)));
console.log('tampered body         ->', JSON.stringify(await webhookUtils.verifySvix(secret, H(signed), body + ' ')));
console.log('secret not configured ->', JSON.stringify(await webhookUtils.verifySvix(undefined, H(signed), body)));
console.log('stale timestamp       ->', JSON.stringify(await webhookUtils.verifySvix(secret,
	H({ ...signed, 'svix-timestamp': String(Math.floor(Date.now() / 1000) - 3600) }), body)));
console.log('missing headers       ->', JSON.stringify(await webhookUtils.verifySvix(secret, H({}), body)));

console.log('\npollDelay base=3s streak 0..12:', Array.from({ length: 13 }, (_, i) => pollDelay(3, i)).join(', '));
console.log('cap respected         ->', pollDelay(3, 99) === MAX_DELAY_MS);
console.log('floor respected       ->', pollDelay(0, 0) === 3000 && pollDelay(1, 0) === 3000);
console.log('admin 30s honored     ->', pollDelay(30, 0) === 30000);
