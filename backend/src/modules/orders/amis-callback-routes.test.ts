import assert from 'node:assert/strict';
import test from 'node:test';
import { misaCallbackResponse } from './amis-callback-routes.js';

test('callback trả đúng contract PascalCase mà AMIS Kế toán yêu cầu', () => {
  assert.deepEqual(misaCallbackResponse(true), {
    Success: true,
    ErrorMessage: '',
  });
  assert.deepEqual(misaCallbackResponse(false, 'Signature invalid', 'InvalidParam'), {
    Success: false,
    ErrorCode: 'InvalidParam',
    ErrorMessage: 'Signature invalid',
  });
});
