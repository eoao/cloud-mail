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

for (const required of ['subscriptionId: id', "event: 'new_mail'", 'emailId: Number(emailRow.emailId)']) {
  if (!webhook.includes(required)) throw new Error(`missing privacy-minimized push field: ${required}`);
}
for (const forbidden of [
  'emailRow.subject', 'emailRow.content', 'emailRow.text', 'emailRow.sendEmail',
  'emailRow.name', 'emailRow.attachments', 'deviceToken', 'device_token'
]) {
  if (webhook.includes(forbidden)) throw new Error(`push webhook leaks forbidden field/reference: ${forbidden}`);
}
if (/api\.(?:sandbox\.)?push\.apple\.com/.test(runtime)) {
  throw new Error('CloudMail runtime must not connect directly to APNs');
}
if (/apns_private_key|APNS_PRIVATE_KEY/.test(runtime)) {
  throw new Error('CloudMail runtime must not contain APNs private-key bindings');
}
if (!deviceApi.includes('subscriptionId, pushSecret, accountId')) {
  throw new Error('CloudMail device API must accept scoped Gateway subscriptions');
}
if (/\{\s*token\s*,/.test(deviceApi)) {
  throw new Error('CloudMail device API must not accept raw APNs tokens');
}
console.log('push webhook contract: PASS');
