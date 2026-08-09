import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webhook = fs.readFileSync(path.join(root, 'src/service/push-webhook-service.js'), 'utf8');
const deviceApi = fs.readFileSync(path.join(root, 'src/api/device-api.js'), 'utf8');
const runtimeFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) runtimeFiles.push(full);
  }
}
walk(path.join(root, 'src'));
const runtime = runtimeFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');

for (const required of [
  "const DEFAULT_GATEWAY = 'https://push.readori.com'",
  "mode === 'privateOnly'",
  "mode === 'sender'",
  "mode === 'senderAndSubject'",
  'emailRow?.text',
  'soundEnabled:',
  'badgeEnabled:',
  "quiet ? 'badge_sync' : 'new_mail'"
]) {
  if (!webhook.includes(required)) throw new Error(`missing rich/self-hosted push behavior: ${required}`);
}
if (!webhook.includes("DISABLED_GATEWAY_VALUES")) throw new Error('self-hosted gateway opt-out is missing');
if (/api\.(?:sandbox\.)?push\.apple\.com/.test(runtime)) {
  throw new Error('CloudMail runtime must not connect directly to APNs');
}
if (/apns_private_key|APNS_PRIVATE_KEY/.test(runtime)) {
  throw new Error('CloudMail runtime must not contain APNs private-key bindings');
}
if (!deviceApi.includes('subscriptionId, pushSecret, accountId')) {
  throw new Error('CloudMail device API must accept scoped Gateway subscriptions');
}
if (!deviceApi.includes('body)')) {
  throw new Error('CloudMail device API must pass notification preferences into registration');
}
if (/\{\s*token\s*,/.test(deviceApi)) {
  throw new Error('CloudMail device API must not accept raw APNs tokens');
}
if (!webhook.includes("event = 'new_mail'")) throw new Error('new-mail webhook event missing');
if (!webhook.includes("'badge_sync'")) throw new Error('badge sync webhook event missing');

const emailApi = fs.readFileSync(path.join(root, 'src/api/email-api.js'), 'utf8');
const deviceApiFull = fs.readFileSync(path.join(root, 'src/api/device-api.js'), 'utf8');
if (!emailApi.includes('emailService.unreadCount')) throw new Error('read/delete paths must recalculate unread badge count');
if (!deviceApiFull.includes('emailService.unreadCount')) throw new Error('device registration must seed unread badge baseline');
console.log('push webhook rich/self-hosted contract: PASS');
