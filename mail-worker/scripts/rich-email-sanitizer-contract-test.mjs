import assert from 'node:assert/strict';
import { sanitizeEmailHtml } from '../src/utils/html-utils.js';

const input = `<!doctype html><html><head>
<style>
@import url('https://evil.invalid/a.css');
@font-face { font-family: Leak; src: url('https://evil.invalid/font.woff2'); }
.hero { color: #123456; width: 640px; }
@media screen and (max-width: 480px) { .hero { width: 100%; } }
</style></head><body>
<script>alert(1)</script>
<div class="hero" onclick="alert(2)"><img src="https://images.example.test/a.png"></div>
</body></html>`;

const output = sanitizeEmailHtml(input);
assert.match(output, /<style>/i);
assert.match(output, /\.hero\s*\{/i);
assert.match(output, /@media\s+screen/i);
assert.doesNotMatch(output, /@import/i);
assert.doesNotMatch(output, /@font-face/i);
assert.doesNotMatch(output, /<script/i);
assert.doesNotMatch(output, /onclick=/i);
assert.match(output, /https:\/\/images\.example\.test\/a\.png/i);
console.log('✅ rich email sanitizer preserves responsive CSS while removing active/external-style hazards');
