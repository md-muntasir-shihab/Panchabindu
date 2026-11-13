import test from 'node:test';
import assert from 'node:assert/strict';
import { uiText, localizedField, localizeMessages } from './ui-text';
import { UI_MESSAGES } from './ui-messages';

test('operational labels and statuses follow the selected language in both directions', () => {
  assert.ok(Object.keys(UI_MESSAGES).length > 1200);
  assert.equal(uiText('পেমেন্ট স্ট্যাটাস', 'en'), 'Payment status');
  assert.equal(uiText('Product name (English) *', 'bn'), 'পণ্যের নাম (ইংরেজি) *');
  assert.equal(uiText('pending_confirmation', 'en'), 'Pending confirmation');
  assert.equal(uiText('pending_confirmation', 'bn'), 'নিশ্চিতকরণ অপেক্ষমাণ');
  assert.equal(uiText('অর্ডারটি খুঁজে পাওয়া যায়নি।', 'en'), 'Order not found.');
  assert.equal(uiText('Network error.', 'bn'), 'নেটওয়ার্কে সমস্যা হয়েছে।');
  assert.equal(uiText('5 ROLES', 'en'), '4 staff roles + separate customer');
});

test('localized content and API feedback retain the original bilingual business data', () => {
  const record = { nameBn: 'পণ্য', nameEn: 'Product', errorBn: 'অর্ডারটি খুঁজে পাওয়া যায়নি।', errorEn: 'Order not found.' };
  const result = localizeMessages(record, 'en');
  assert.equal(result.errorBn, 'Order not found.');
  assert.equal(result.nameBn, 'পণ্য');
  assert.equal(result.nameEn, 'Product');
  assert.equal(record.errorBn, 'অর্ডারটি খুঁজে পাওয়া যায়নি।');
  assert.equal(localizedField(record, 'nameBn', 'en'), 'Product');
  assert.equal(localizedField(record, 'nameBn', 'bn'), 'পণ্য');
});
