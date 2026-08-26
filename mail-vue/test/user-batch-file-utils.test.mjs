import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseUserImportFile } from '../src/utils/user-batch-file-utils.js';

function asFile(name, type, bytes) {
  return {
    name,
    type,
    async arrayBuffer() {
      if (bytes instanceof ArrayBuffer) return bytes.slice(0);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
  };
}

test('parses a CSV user import with an optional password and ignores role columns', async () => {
  const bytes = new TextEncoder().encode('email,password,type\nalice@example.com,Password123,1\nbob@example.com,,2\n');
  const users = await parseUserImportFile(asFile('users.csv', 'text/csv', bytes));
  assert.deepEqual(users, [
    { email: 'alice@example.com', password: 'Password123' },
    { email: 'bob@example.com', password: '' }
  ]);
});

test('parses an XLSX user import', async () => {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['email', 'password'],
    ['carol@example.com', 'Password456']
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const users = await parseUserImportFile(asFile('users.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes));
  assert.deepEqual(users, [
    { email: 'carol@example.com', password: 'Password456' }
  ]);
});
